# Rialto Architecture

Status: draft for team review (branch `architecture`).
Everything in this document is grounded in one of: the x402 specs as merged upstream, the
`@x402/stellar` package as published (v2.21.0), SDF's reference implementation, our own
settled testnet runs, or an accepted design decision in `docs/decisions/`. The contract
research spike has landed as a full spec in this repo
([`docs/specs/scheme_upto_stellar.md`](specs/scheme_upto_stellar.md)); §3.3 matches it.

---

## 1. Plain-English overview

Rialto is a payment processor and a search engine glued together, for machines.

A seller with a paid API points it at Rialto and never touches blockchain plumbing. A
buyer - almost always an AI agent - asks Rialto's catalog "what services exist that do
X?", gets back results it can trust (each one carries exact payment terms and a track
record of real settlements), pays through the same service, and holds a receipt it can
verify against the public ledger. Every payment that flows through Rialto automatically
keeps the catalog fresh: getting paid is what gets a service listed.

The stack is deliberately boring: one TypeScript service (the facilitator, which also
serves discovery), one PostgreSQL database (catalog + search), one small Soroban contract
(only for capped "pay up to" payments), and an MCP server so agents can drive the whole
loop from inside their own runtime. Settlement logic is not ours - we compose the
Apache-2.0 `@x402/stellar` package that already settles payments on both Stellar networks.

## 2. The two loops

### 2.1 Payment loop (exact scheme - runs today, we verified it end to end)

```mermaid
sequenceDiagram
    participant A as Agent
    participant S as Seller API
    participant F as Rialto facilitator
    participant L as Stellar

    A->>S: GET /resource
    S-->>A: 402 + requirements
    Note over A: sign Soroban auth entry
    A->>S: retry + payment
    S->>F: POST /verify
    F->>L: simulate
    F-->>S: isValid
    Note over S: serve the resource
    S->>F: POST /settle
    F->>L: submit tx
    L-->>F: settled ~5s
    F-->>S: tx hash + receipt
    S-->>A: 200 + resource
```

Key properties, all from the merged `scheme_exact_stellar` spec and observed in our runs:

- The buyer signs an **authorization entry** (permission for one specific token transfer
  with exact arguments), not a transaction. The facilitator builds the transaction around
  it, sources it from its own account, and pays the fee - so the buyer holds zero XLM
  and the facilitator advertises `extra: {areFeesSponsored: true}` in `/supported`.
- Verification simulates against the chain before anything moves; settlement re-runs
  verification so there is no verified-then-swapped window.
- Tampering (amount, asset, recipient) is a signature failure, not a policy check - the
  facilitator cannot alter what was signed.
- Expiry is ledger-bound (`signatureExpirationLedger`); replay is impossible because the
  auth entry's protocol-level nonce is consumed on use.
- Every rejection carries a machine-readable code and a specific, non-null reason.
  (We hit the counter-example in the wild: the reference facilitator reports an RPC
  outage as `unexpected_verify_error`. Rialto's error taxonomy distinguishes
  payload-invalid / expired / simulation-failed / upstream-unreachable, because an agent
  retrying blind on an ambiguous error burns money and time.)

### 2.2 Discovery loop (the new capability)

```mermaid
sequenceDiagram
    participant S as Seller API
    participant A as Agent
    participant F as Rialto facilitator
    participant C as Catalog (Postgres)

    S-->>A: 402 includes bazaar metadata + JSON schema
    A->>F: payment echoes the metadata
    F->>C: validate: schema, route template, soft-drop fields
    C-->>F: indexed
    F-->>A: EXTENSION-RESPONSES (catalog outcome)
```

- Sellers declare metadata (name, description, tags, per-parameter descriptions, input/
  output schemas) in the 402 response; the client echoes it inside the payment payload;
  the facilitator catalogs it as a side effect of settlement. **No registration step.**
  Manual registration exists but is secondary, exactly as the Bazaar spec orders it.
- Both HTTP endpoints and **MCP tools** are cataloged; MCP entries are keyed on the
  tuple (resource URL, tool name) because one MCP endpoint multiplexes many tools.
- Cataloging outcomes are reported to the client in the `EXTENSION-RESPONSES` header
  (`success` / `processing` / `rejected` + reason), per spec.

## 3. Components

### 3.1 `packages/facilitator` - the service

Canonical x402 endpoints (`/verify`, `/settle`, `/supported`) for `stellar:testnet` and
`stellar:pubnet`, plus the discovery endpoints (§3.2 serves them, this process hosts
them). Composes `@x402/stellar`'s facilitator module for exact-scheme verify/settle
(verified present and network-complete in v2.21.0: CAIP-2 ids, network passphrases,
Horizon URLs, and USDC contract addresses for both networks).

What we add around the library:

- **Throughput**: channel accounts + a dedicated fee-bump signer, adopting the pattern
  SDF's reference facilitator documents (N channel accounts = N parallel settlements;
  accounts created with sponsored reserves; round-robin selection). Config-driven; falls
  back to single-signer for small self-hosted deployments.
- **Sponsor-cost protection**: sponsored fees mean every failed settlement costs the
  operator real XLM, so protection is economic, not arbitrary: per-principal cost
  accounting (what each caller has burned in sponsored fees), rate limits that tighten
  as a caller's settlement success rate drops, and a prepaid tier for heavy callers held
  strictly as **off-chain account credit** - never an on-chain escrow. Thresholds ship
  as configuration with defaults set from measured testnet failure data, not invented
  numbers.
- **Receipts**: the settle response already carries the transaction hash; Rialto returns
  it inside a structured receipt (network, ledger, hash, amount, asset, payTo) that an
  agent can verify against any Horizon/RPC endpoint independently of us, and retain as
  proof of payment.
- **Fee bounds**: settlement fees derive from fresh simulation with a configurable
  circuit-breaker cap (the library default is 50,000 stroops; SDF's own reference
  configuration warns that Soroban resource fees can exceed it - so the bound is
  explicit, documented configuration rather than a hardwired constant).

### 3.2 `packages/discovery` - catalog, search, federation

**Catalog (PostgreSQL).** One database holds resources, their payment options, their
metadata, embeddings, and settlement statistics. Every entry records **provenance**:
`observed-settlement` (indexed because a payment settled here), `registered` (seller
self-registered), or `ingested` (imported from an external catalog). Provenance is
visible in API responses and feeds ranking - an agent can always tell how an entry got
into the index.

**Integrity gauntlet** (the catalog-poisoning boundary, §4.2) - applied to every
submission regardless of provenance, implementing the Bazaar spec's rules:

- metadata validated against the seller-supplied JSON Schema; external `$ref`/`$id`
  resolution refused (same-document fragments only)
- `routeTemplate` sanitized: must match the spec's character set, no `..`, no `://`,
  **percent-decoded before** traversal checks; invalid templates are discarded and the
  concrete URL path used instead
- field-level soft-drop: an oversized `serviceName`, an invalid tag, a loopback/IP-literal
  `iconUrl` each drop that field alone; only an invalid envelope rejects the entry
- outcomes reported via `EXTENSION-RESPONSES`

**Search** (built - ADR 0002, implemented in `packages/discovery/src/search/`): hybrid
retrieval - real BM25F (`bm25.ts`, Postgres does tokenization only; field-weighted
serviceName/tags > description > URL, k1/b as named constants) + a local, permissively-
licensed embedding model (`all-MiniLM-L6-v2` via transformers.js, in-process, no external
API) - fused with reciprocal rank fusion by rank position only, never a raw score
comparison (`fusion.ts`); query-derived structured constraints (a network named in the
query is a hard filter that excludes non-matching rows outright, not a ranking nudge -
asset/price mentions apply the same way in a lighter-weight v1); synthetic per-resource
queries generated at index time (template-based v1, not yet LLM-authored - see
`synthetic-queries.ts`) and embedded alongside the metadata, generation-versioned so a
model swap never compares old and new vectors against each other; **settlement-history
ranking** as a tiebreak after fusion, not an override, so a proven endpoint only wins over
an equally-relevant untested one. Vectors are stored in Postgres via **pgvector**
(`vector` column, dimension-unconstrained so multiple generations coexist; cosine distance
computed in SQL via `<=>`, no ANN index - exact scan, per ADR 0002's own reasoning at this
corpus size). Embedding runs on its own async worker (`embedding-worker.ts`: Postgres-
queue job claiming via `FOR UPDATE SKIP LOCKED`, lease-based crash recovery, exponential
backoff, dead-lettering), never blocking cataloging or the request path. Wire surface is
exactly the spec's: `/discovery/resources` with
`type`/`payTo`/`scheme`/`network`/`extensions`/`limit`/`offset`, `/discovery/search` with
`query`, cursor pagination, and honest `partialResults` (true whenever the dense arm
errored or the embedding worker has a backlog, false only when the full pipeline ran).

**Federation** - the answer to the open interop question (stellar/x402-stellar#50: the
registration path for independent facilitators is undetermined). What's built today is
a **central-registration model, scoped honestly**:

- `POST /federation/register` / `GET /federation/peers` - a facilitator declares itself
  (`name`, `baseUrl`, `catalogUrl`) into this instance's `federation_peers` table;
  transparent, but only ever a local list, and only ever populated by whoever already
  knows to call it.
- ingestion of external catalogs (CDP-shaped exports, AlgoVoi's live feed) is a
  **manual** CLI invocation (`ingest-cli.ts`: `pnpm ingest cdp <dir>` /
  `pnpm ingest algovoi [url]`) - a direct HTTPS pull from the source, entries marked
  `ingested` and passed through the identical integrity gauntlet every other entry
  gets. Registering a `catalogUrl` does **not** trigger automatic ingestion from it
  (`docs/threat-model.md` §6) - that's a deliberate containment boundary today, not yet
  a scheduled job.
- cross-publishing (Rialto's own catalog exported in a shape others can ingest) is not
  implemented at all yet - only ingestion *into* Rialto is (`docs/documentation-audit.md`
  §2.7).

The real gap this leaves: a facilitator only becomes findable if it already knows to
register with an index, or an index operator already knows to pull from it - N
registries instead of one is still a registry problem. **[ADR 0003](decisions/0003-federation-dht-discovery.md)**
proposes closing that gap with a Kademlia DHT for the discovery step only - the same
peer-discovery primitive BitTorrent and IPFS use, not their full stack - while keeping
catalogs pulled directly over HTTPS from the source facilitator, exactly as
`ingest-cli.ts` already does, so there's still no relay hop and no custom
message-signing scheme required. Worked out in full, including why not a full libp2p
node, in [`docs/federation/dht-peer-discovery.md`](federation/dht-peer-discovery.md).
**This is a design proposal, not implemented** - the bullets above are the accurate
description of what runs today.

A service settles anywhere but is findable everywhere. Stellar must not be a walled
garden; neither will Rialto be one.

### 3.3 `contracts/upto-settlement` - the capped-payment contract

**Design accepted (ADR 0001); mechanics finalized in the spec merged into this repo**
([`docs/specs/scheme_upto_stellar.md`](specs/scheme_upto_stellar.md)). The cap is enforced on-chain
by a minimal, stateless Soroban contract (`UptoSettlement`): the client signs
**(recipient, asset, max amount, validAfter, expirationLedger, salt, autoRevoke)** in
one auth entry - the actual amount is deliberately excluded from the signature and
arrives unsigned at settlement. Inside a single atomic `settle()` call the contract
grants itself an allowance for the maximum (satisfied by a pre-signed fixed-argument
sub-invocation), transfers the actual amount, and - if the client opted in via
`autoRevoke` - zeroes any leftover allowance in the same transaction, so no allowance
ever exists on-chain outside the settlement itself. `actual ≤ max` is checked by the
contract; replay protection rides Soroban's native auth-entry nonce; zero usage means
no transaction at all.

Time bounds: the client-chosen, **signed `expirationLedger`** is the single expiry -
the contract checks it against the ledger sequence, and the *same signed value* feeds
the token approval's expiry, so no timestamp-to-ledger conversion exists to mismatch
(the flaw review caught in the first draft). `validAfter` stays a clock-time argument
checked on-chain, giving a real "not before" bound. `salt` is required.

Settlement is deliberately **facilitator-agnostic**: no facilitator identity is bound
into the signature, so any facilitator holding the signed entries can submit - which is
what the federation model and the self-facilitation path need. The tradeoff is stated
honestly: a leaked authorization can at worst settle the signed maximum to the signed
recipient - never a different amount ceiling, never a different recipient.

### 3.4 `packages/mcp-server` - the agent interface

Three tools wrapping the full loop with deterministic, structured IO:

- `search_resources` - natural-language query + structured filters over the catalog
- `get_resource` - full metadata, schemas, payment requirements, provenance, settlement
  stats for one resource
- `paid_call` - executes discover → pay → retry end to end and returns the result plus
  the verifiable receipt

Machine-readable error codes; a non-null reason on every rejection; versioned schemas.

### 3.5 `packages/seller-sdk`

Declaration helpers (typed metadata builders including per-parameter descriptions) plus
**local validation that mirrors the facilitator's integrity gauntlet exactly** - a seller
finds out about a malformed asset id or an invalid route template on their laptop, not in
production. Malformed listings are an observed real-world problem, not hypothetical: a
production catalog today carries Stellar entries whose asset identifiers no conformant
client can settle.

### 3.6 `packages/eval-harness`

Public, versioned search-quality evaluation, scored on nDCG@10 / MRR / Recall@20 for
three configurations side by side (BM25-only, dense-only, fused+settlement) so the value
each stage adds is visible, not blended into one number. A CI job
(`.github/workflows/eval-harness.yml`) runs it on every change touching
`packages/discovery/src/search/**` and fails the build if the fused configuration
regresses past a documented threshold against `baseline.json`. Anyone can re-run
`pnpm eval` and get the same numbers, modulo the catalog's actual contents at the time.

**v1 scope, stated plainly rather than rounded up to the target:** the target is
100-200 golden queries with judgments pooled across all three rankers, LLM-assisted
labeling with a human-audited sample, and a judge model different from whatever
generates synthetic queries/embeddings (ADR 0002). What's built today is 15 queries
across the required categories (exact-name, paraphrase, filtered, no-result,
adversarial) against an 18-resource seed catalog, judged in a single pass by the same
model that built the harness - no separate judge model, no human audit yet. That gap is
documented in `packages/eval-harness/README.md`, not hidden, and is the harness's
highest-priority next step. See [`docs/benchmarks.md`](benchmarks.md) for the current
numbers and what they show.

## 4. Trust boundaries - who could cheat, and what stops them

| # | Boundary | Attacker | Defense |
|---|----------|----------|---------|
| 4.1 | Client signature | A facilitator (including us) altering amount, asset, or recipient | The signed auth entry binds exact arguments; any change is a signature failure enforced by Stellar consensus. Non-custodial by construction. |
| 4.2 | Catalog integrity | A hostile client echoing forged metadata or a crafted route template into the payment payload | The integrity gauntlet (§3.2): schema validation, sanitized route templates (percent-decode before traversal checks), field-level soft-drop, no external `$ref`, provenance labeling. Quality judgment (is the service good?) stays with agents - integrity validation (is the entry forged?) is ours. |
| 4.3 | Spending cap | A seller or facilitator settling above an agent's authorized maximum, redirecting funds, or settling twice | The `upto` contract: cap and recipient are in the signed arguments, `actual ≤ max` checked on-chain, auth-entry nonce consumed on settlement. Settlement is facilitator-agnostic by design - the signature bounds *what* can happen, not *who* submits it. |
| 4.4 | Sponsor economics | Callers burning the operator's sponsored fees with settlements that fail | Per-principal cost accounting; rate limits tied to settlement success rate; prepaid tier as off-chain credit. Failed-settlement cost is bounded and attributable. |

## 5. Behavior under failure

- **Semantic search arm down** (embedding process unavailable): serve lexical-only
  results with `partialResults: true` - the spec's field, used honestly.
- **Catalog database down**: `/discovery/*` degrades; `/verify` and `/settle` are
  unaffected - payments never depend on the index.
- **Soroban RPC unreachable or flaky**: bounded retries, then a rejection whose code
  names the upstream failure (not a generic verify error) - an agent can distinguish
  "my payment is bad" from "try again later".
- **Channel account exhaustion** (burst beyond N parallel settlements): requests queue
  with backpressure rather than colliding on sequence numbers.
- **Testnet reset**: facilitator accounts are re-fundable by script (documented SDF
  pattern); the catalog is unaffected.

Availability target for hosted endpoints is 99%+, with the degraded modes above as the
explicit story for the gap.

## 6. Deferred scope - and where it would attach

Stated deferrals, per the RFP's own guidance, with the attachment points left open:

- **On-chain Soroban registry** (optional/stretch in the RFP): the federation layer
  (§3.2) is the attachment point - a future job could mirror catalog roots on-chain.
  Deferred for rent/TTL overhead; nothing in the schema forecloses it.
- **Batch settlement** (RFP phase two): would land as a new entrypoint on the settlement
  contract (§3.3) plus a scheme handler in the facilitator. The prepaid tier deliberately
  stays off-chain credit so it does not pre-empt this design.
- **Auth-capture** (RFP phase two): a scheme-handler slot in the facilitator; the
  verify/settle separation already models authorize-then-capture timing.

## 7. Diagram

```mermaid
flowchart LR
    subgraph AGENT["Agent runtime"]
        A[AI agent]
        MCP["MCP server<br/>search_resources / get_resource / paid_call"]
    end

    subgraph SELLER["Seller"]
        S["Paid API / MCP tool<br/>(declares metadata via seller-sdk)"]
    end

    subgraph RIALTO["Rialto service"]
        F["Facilitator<br/>/verify /settle /supported<br/>channel accounts - fee sponsorship<br/>cost accounting - receipts"]
        D["Discovery<br/>/discovery/resources /discovery/search<br/>integrity gauntlet - BM25 + dense fusion<br/>settlement-history ranking"]
        W["Embedding worker<br/>FOR UPDATE SKIP LOCKED queue<br/>backoff - dead-letter"]
        EV["Eval harness<br/>golden queries - CI gate"]
    end

    subgraph PG["PostgreSQL (pgvector)"]
        C["Catalog + embeddings (vector)<br/>+ settlement stats<br/>(provenance-labeled)"]
    end

    subgraph CHAIN["Stellar network"]
        L["Ledger<br/>SEP-41 transfers"]
        U["upto-settlement contract<br/>actual &le; max, on-chain"]
    end

    subgraph EXT["Wider x402 ecosystem"]
        X["Independent facilitators<br/>external catalogs<br/>.well-known/x402"]
    end

    A -->|"1. discover"| MCP --> D
    A -->|"2. request, get 402"| S
    A -->|"3. pay (signed auth entry)"| S
    S -->|"4. verify / settle"| F
    F -->|"exact: direct transfer"| L
    F -->|"upto: settle via contract"| U --> L
    F -->|"5. auto-catalog on settlement"| D
    D <--> C
    W <--> C
    F -->|"6. receipt (tx hash)"| S --> A
    A -.->|"verify receipt on-ledger"| L
    D <-->|"register / ingest / cross-publish"| X
    EV -.->|"gates ranking changes"| D
```

Trust boundaries in the picture: the signature boundary sits on edge 3→4 (nothing past
the seller can alter what the agent signed); the poisoning boundary sits on edge 5 (the
gauntlet between facilitator and catalog); the cap boundary is the contract node; the
sponsor boundary lives inside the facilitator (cost accounting before submission).

---

*Review notes for the team: §3.3 finalizes after the contract spike lands Monday; every
other section is complete. Sources: x402 specs (`scheme_exact_stellar`, `scheme_upto`,
`extensions/bazaar`), `@x402/stellar` v2.21.0, stellar/x402-stellar reference patterns,
ADRs 0001-0002, and our settled testnet runs.*

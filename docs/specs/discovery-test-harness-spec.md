# Spec: Discovery Layer Test Harness (Proof of Concept)

## Purpose

This harness is not just a test suite. It is the primary evidence artifact for the
discovery layer: it must let anyone (a reviewer reading the repo, or an audience
watching a recorded walkthrough) understand what the discovery layer does, why each
piece exists, and see it actually work, without reading the architecture doc first.

Two audiences, two requirements:

1. **Read as documentation.** Every `describe` block explains a capability in plain
   language before any test runs. Someone skimming only the block titles and comments,
   never the assertions, should come away understanding the system.
2. **Run as a live demonstration.** The suite runs top to bottom in a deliberate
   narrative order (happy path, then edge cases, then adversarial cases, then failure
   modes), with output readable enough to narrate over in a recording.

## Tech stack

- TypeScript, Vitest (matches the `@x402/stellar` ecosystem's own tooling, and Vitest's
  default reporter is readable enough for a recording without extra plugins).
- Fixtures over live network calls for the majority of the suite (see "Fixtures" below).
- A small number of tests marked `[LIVE]` in their title that do hit real Stellar
  testnet and the real x402 discovery extension wire format, so the suite proves it
  isn't all simulation.

## Directory structure

```
packages/discovery/test/
  README.md                  <- how to run, how the suite is organized, run order
  fixtures/
    resources.ts              known catalog entries, both clean and adversarial
    settlements.ts            known settlement events (success, failure, partial)
    golden-queries.ts         the query set for retrieval tests (subset of eval harness)
  conformance/
    01.cataloging.spec.ts      auto-cataloging on settlement, no registration step
    02.integrity-gauntlet.spec.ts   schema validation, route-template sanitization, soft-drop
    03.retrieval.spec.ts       BM25 + dense + RRF, filters, structured constraints
    04.mcp-resources.spec.ts   MCP tool cataloging (url, toolName) tuple keying
    05.federation.spec.ts      ingest, cross-publish, provenance labeling
    06.error-taxonomy.spec.ts  every rejection has a non-null, specific reason
    07.live-settlement.spec.ts [LIVE] one real testnet settlement, cataloged end to end
  quality/
    eval-harness.spec.ts       nDCG@10 / MRR / Recall@20 against the golden query set,
                                reported as numbers, not pass/fail assertions
```

## Conventions (apply to every file)

- Every `describe` block's title starts with the spec citation it proves, in square
  brackets, e.g. `describe('[RFP 3.2] Automatic cataloging on settlement', ...)`.
  If a test proves a design decision instead of an RFP line, cite the ADR or doc
  section instead: `[ADR-0002]`, `[architecture.md §4.2]`.
- Immediately inside each `describe`, a single comment block (3 to 6 lines) explains,
  in plain English, what capability is being proven and why it matters. Write this as
  if reading it aloud. No jargon that hasn't been defined earlier in the suite.
- Each `it` title is a complete sentence describing the observable behavior, not the
  implementation: `it('catalogs a resource the first time it settles, with no separate
  registration call')`, not `it('calls catalogRepository.insert')`.
- Arrange/Act/Assert sections inside each test are separated by a blank line and a short
  comment, so the shape of the test is visible without reading assertions closely.
- No test depends on the execution order of another test file. Fixtures are reset
  between tests. The one exception is the `[LIVE]` file, which is allowed to be slower
  and is run last by convention (see run order below).

## Coverage, mapped explicitly to what must be proven

### `01.cataloging.spec.ts`, RFP 3.2

- A settlement carrying valid Bazaar metadata results in exactly one new catalog entry,
  with no separate seller action.
- A settlement with no Bazaar metadata catalogs nothing (silence is the correct
  behavior, not an error).
- A second settlement for an already-cataloged resource updates settlement stats
  (recency, count) rather than duplicating the entry.
- `EXTENSION-RESPONSES` header content matches the actual outcome (`success`,
  `processing`, `rejected` and reason) for each of the above.

### `02.integrity-gauntlet.spec.ts`, RFP 3.2, architecture §4.2

This is the trust boundary. Every test here is framed as an attack, then a defense.

- A crafted `routeTemplate` containing `../` is rejected, including when the traversal
  sequence is percent-encoded, proving decode happens before the traversal check, not
  after.
- External `$ref`/`$id` resolution in supplied JSON Schema is refused; same-document
  fragments are allowed.
- An oversized `serviceName` or a loopback/IP-literal `iconUrl` drops that field alone
  (soft-drop), leaving the rest of the entry intact and cataloged.
- A structurally invalid envelope (not just one bad field) is rejected outright, and the
  rejection reason names which part of the envelope failed.
- Every case in this file asserts on the exact reason string or code returned, not just
  that a rejection happened, since a vague rejection is itself a defect the RFP calls
  out.

### `03.retrieval.spec.ts`, RFP 3.2, architecture §3.2

- A keyword query matches on exact vocabulary overlap (lexical arm alone would find
  this).
- A paraphrase query with no vocabulary overlap with the listing still surfaces the
  correct resource (proves the dense arm and synthetic per-resource queries are doing
  real work, not just the lexical arm).
- A query naming a specific network or asset applies as a hard filter, not merely a
  ranking boost.
- Two resources with identical text relevance are ordered by settlement history, the
  one with more recent successful settlements ranking first.
- `partialResults: true` is set and honestly reflects reality when the embedding arm is
  unavailable (simulate this by disabling the dense arm and confirming lexical-only
  results still return, correctly flagged).

### `04.mcp-resources.spec.ts`, RFP 3.2

- An MCP tool resource is cataloged keyed on the (resource URL, tool name) tuple.
- Two different tools multiplexed behind the same MCP endpoint URL catalog as two
  distinct, independently searchable entries.

### `05.federation.spec.ts`, architecture §3.2 federation

- An externally ingested entry passes through the same integrity gauntlet as a
  directly-settled one (reuse fixtures from `02`, feed them through the ingestion path
  instead of the settlement path, confirm identical rejection behavior).
- Every catalog entry's provenance field correctly reflects how it arrived
  (`observed-settlement`, `registered`, `ingested`), and this is visible in the API
  response.
- The catalog's own export shape round-trips through its own ingestion path (proves
  cross-publishing is actually wire-compatible with ourselves, the minimum bar before
  claiming compatibility with anyone else).

### `06.error-taxonomy.spec.ts`, architecture §2.1

- Each defined rejection cause (payload-invalid, expired, simulation-failed,
  upstream-unreachable) produces a distinct, correctly-labeled error, and never falls
  through to a generic catch-all message.
- A simulated upstream RPC outage produces `upstream-unreachable`, explicitly not the
  generic error the reference facilitator is documented to return for the same
  condition. Name this contrast directly in the test's comment.

### `07.live-settlement.spec.ts` [LIVE], RFP 3.2 and 3.6

- One real signed Soroban auth entry, submitted through the real facilitator path, on
  Stellar testnet.
- The resulting settlement carries Bazaar metadata and is confirmed present in the
  catalog afterward, queried through the real `/discovery/resources` endpoint.
- The test prints the real settled transaction hash to console on success, since this
  is the artifact you'll want visible on camera.

### `quality/eval-harness.spec.ts`, architecture §3.6

- Not pass/fail. Runs the golden query set, computes nDCG@10, MRR, and Recall@20, and
  prints a table. A separate CI check (not this file) fails the build if a change
  regresses these numbers past a documented threshold; this file's job is only to
  produce the numbers clearly for a human or a recording to read.

## Run order for the presentation

`01` through `06` in numeric order (each one narratable in under two minutes), then `07`
last as the "this is real" closer, then the eval harness printed as a final summary
table. Put this exact order in `test/README.md` along with a one-line suggested spoken
intro for each file, so whoever narrates the video isn't improvising.

## Fixtures

`fixtures/resources.ts` and `fixtures/settlements.ts` must include, at minimum: one
clean resource, one resource with each individual soft-droppable defect, one resource
with a hard-reject defect, one MCP-tool resource, and a small settlement history (at
least 3 settlements across at least 2 resources) so ranking-by-history tests have real
variance to sort on. Keep these small and hand-readable, not generated, since a reader
should be able to open the fixture file and understand the whole test suite's inputs at
a glance.

## What this spec deliberately does not include

Load/throughput testing, the `upto` contract, and the seller/buyer SDK packages are out
of scope for this harness. This is the discovery layer's own proof of concept. If it
proves useful, the same conventions (spec-cited describe blocks, plain-English intro
comments, fixtures over live calls except for one closing live test) should be reused
for a facilitator-focused and an `upto`-focused harness later, but that is separate work,
not part of this deliverable.

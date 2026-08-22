# ADR 0003: Peer discovery via a Kademlia DHT, not a central registry

Status: proposed · 2026-08-15 · **not implemented** - this ADR records a decision about
the target design; no code in this repo implements it yet. See the "What's not decided
yet" section below and the deep-dive at
[`docs/federation/dht-peer-discovery.md`](../federation/dht-peer-discovery.md).

## Context

[stellar/x402-stellar#50](https://github.com/stellar/x402-stellar/issues/50) leaves the registration path for independent facilitators
undetermined - stated as an open interop question, not answered by the base x402 spec.
Rialto's federation layer (`docs/architecture.md` §3.2) currently answers it like this:

- `POST /federation/register` lets a facilitator declare itself (`name`, `baseUrl`,
  `catalogUrl`) into **this specific instance's** `federation_peers` table.
- `GET /federation/peers` lists whoever has registered, for transparency.
- Actual catalog ingestion is a manual CLI invocation (`pnpm ingest cdp <dir>` /
  `pnpm ingest algovoi [url]`), pulling directly over HTTPS from the source - not
  triggered automatically by registration.

This works, and it is honestly scoped (see `docs/threat-model.md` §6). But it has a
real ceiling: a facilitator only becomes discoverable by _this_ instance if it already
knows this instance exists and manually registers, and it only becomes discoverable
_through_ this instance if an operator manually runs the ingest CLI against it. There
is no path by which a brand-new, independent facilitator becomes findable across the
wider x402 ecosystem without first tracking down and individually registering with
every index that might carry it - which is a central-registry problem wearing a
federated costume, just with N registries instead of one.

Two shapes were on the table for removing that ceiling:

- **A gossip network** - peers periodically exchange peer lists with neighbors,
  eventually converging the whole network's view. Works, but needs its own
  anti-entropy and failure-detection machinery to keep views converged and stale
  entries pruned - real operational weight for a problem that, underneath, is just
  "given a key, find who holds it."
- **A full libp2p node** - battle-tested (it's what IPFS and Filecoin run on), but
  brings a large stack (transport negotiation, stream multiplexing, circuit relay for
  NAT traversal, pubsub/gossipsub, peer identify) to solve a narrower problem than what
  libp2p is built for. Every facilitator here already runs a plain HTTPS server an
  operator has to expose anyway - there's no NAT-traversal problem to solve and no
  need for a relay or a pubsub layer at this scale.

## Decision

Adopt a **Kademlia distributed hash table**, used only for the peer-discovery step -
the same peer-discovery primitive BitTorrent's Mainline DHT (BEP 5) and IPFS's content
routing are built on, not the whole libp2p stack either of them ships alongside it.

- Each facilitator derives or generates a node ID and joins the DHT through a small
  set of well-known bootstrap nodes, the same way a new BitTorrent client bootstraps
  into the Mainline DHT.
- Once joined, it **publishes a DHT record** mapping its node ID to `{baseUrl,
catalogUrl}` - the DHT equivalent of BitTorrent storing a swarm's peer list under an
  infohash, or IPFS storing a provider record under a content ID. The DHT never stores
  the catalog itself, only the pointer to where it lives.
- Discovery is a Kademlia iterative lookup: no central authority is queried, no
  instance needs to have pre-registered with another.
- Once a peer's `baseUrl`/`catalogUrl` is resolved, its catalog is fetched with a
  **direct HTTPS GET straight from that facilitator** - exactly the pull
  `ingest-cli.ts`'s `ingestAlgovoi()` already performs today, just no longer requiring
  the URL to be hand-provided as a CLI argument. **No relay hop**: no third server sits
  between the requester and the source rewriting or forwarding the payload.

The "no relay hop" property is the load-bearing part of this decision, not a side
effect of it: because the catalog always comes from a direct, TLS-terminated
connection to its source, there is no hop where a listing could be tampered with in
transit, and therefore **no custom message-signing scheme to design and get right**.
Signing a payload only earns its keep when you can't trust the channel it travels
over; a direct HTTPS connection to the party who authored the data already gives that
guarantee. A relay is exactly the thing that would reintroduce the need for one.

The same DHT, with the same record shape one level down, also backs a second
mechanism beyond peer presence: **query-time fan-out with DHT-backed resource
selection** (deep-dive §4.1-§4.2). A search still answers from the local catalog
first; fan-out additionally sends it live to known peers, merges results, and is
honest (`partialResults: true`) about anything skipped. Whichever peer's answer
scores best gets a resource-pointer record published back into the DHT, so the next
node needing that same resource resolves it by lookup instead of repeating the
fan-out. This is federated-IR "resource selection," not a novel mechanism, and it
composes with the presence layer rather than requiring a second protocol.

## Alternatives considered

- **Keep the current self-registration model** - rejected as the long-term answer:
  doesn't scale past a handful of instances that already know about each other by
  other means; no path to ecosystem-wide discoverability without an implicit
  meta-registry of registries.
- **Gossip network** (epidemic peer-list propagation) - rejected: needs its own
  convergence and staleness-pruning protocol; more moving parts than a DHT lookup for
  the same result.
- **Full libp2p node** - rejected for this use case: the transport-negotiation,
  stream-muxing, circuit-relay, and pubsub machinery solve problems (arbitrary p2p
  transports, NAT traversal, real-time broadcast) Rialto doesn't have, since every
  facilitator is already a reachable HTTPS server. Revisit only if federation grows
  into needing push/subscribe rather than discover-then-pull.
- **On-chain Soroban registry** (mentioned as a stretch goal in `architecture.md` §6) -
  rejected as the _primary_ discovery mechanism: rent/TTL overhead, and a chain write
  on every facilitator join/leave is disproportionate. Nothing here forecloses using a
  chain later as a root-of-trust anchor for the DHT's bootstrap node list.
- **DNS-based discovery** (e.g. signed TXT records) - considered, not adopted as
  primary: still leans on a namespace authority (a registrar) even if not a single
  company, and lacks the "anyone with a keypair can join without asking anyone"
  property a DHT gives. Worth revisiting later as a secondary bootstrap-discovery path
  layered on top, not a replacement.

## Consequences

- Facilitators become discoverable ecosystem-wide without registering with Rialto
  specifically or with any other single index - answers [stellar/x402-stellar#50](https://github.com/stellar/x402-stellar/issues/50)
  without installing a new central party in its place.
- Operational weight stays low: a Kademlia client is a routing table plus four RPCs
  (§2 of the deep-dive), a small and well-understood component next to a gossip
  protocol or a full libp2p node - the same "boring infrastructure" tradeoff
  [ADR 0002](0002-search-stack-and-eval.md) makes for search.
- New surface for `docs/threat-model.md` to cover: Sybil/eclipse attacks against DHT
  lookups, and poisoned DHT records pointing at a malicious `catalogUrl`. The
  mitigation is unchanged from today's model - the integrity gauntlet
  (`cleanEntry()`) validates every ingested entry regardless of how the peer was
  found, so a forged record can at worst point a client at a catalog the gauntlet
  still filters, never at content the gauntlet trusts blindly.
- Search coverage beyond a single instance's own catalog stops being fixed at design
  time: DHT-backed resource selection means coverage grows from real query traffic
  (a resource nobody has searched for simply isn't in the DHT yet, which is correct
  behavior, not a gap), with no crawl or full-replication step ever required.
- This is a proposal only, evaluated on paper, not against a running implementation.
  The numbers and tradeoffs above should be revisited once a prototype exists.

## What's not decided yet

Named explicitly rather than left implicit:

- **Node ID derivation** - random, or derived from a facilitator's own signing
  key/domain (the latter would let a lookup target a _specific_ known facilitator by
  a stable identity rather than only a random point in the ID space).
- **Bootstrap node list** - who runs the first few nodes a fresh deployment joins
  through, and how that list itself is discovered and kept current.
- **Record lifetime** - TTL, republish interval, and how a facilitator that goes
  offline (temporarily or permanently) is reflected in the DHT rather than leaving a
  stale record that outlives it.
- **Record authenticity** - a DHT alone doesn't stop a Sybil node positioned near a
  target key from answering lookups with a forged record (the classic Kademlia
  weakness S/Kademlia-style extensions address). Whether that needs a dedicated fix or
  is adequately covered by "the integrity gauntlet catches bad content anyway" is an
  open call, not yet made.
- **Transport** - classic Kademlia rides over UDP; nothing requires that. An
  HTTP-transported variant would keep the entire federation stack to "things that
  speak HTTPS," consistent with the rest of this project, and is the current leaning
  but not a final choice.
- **Library vs. hand-rolled** - whether to build on an existing Kademlia
  implementation or hand-roll the minimal PING/STORE/FIND_NODE/FIND_VALUE subset this
  use case actually needs.

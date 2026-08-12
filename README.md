# Rialto

**An x402 facilitator and Bazaar discovery layer for Stellar** - so AI agents can find,
pay for, and verify paid services on `stellar:testnet` and `stellar:pubnet`.

> Status: building, in the open. `packages/shared`, `packages/facilitator`, and
> `packages/discovery` (catalog, BM25 + dense hybrid search, federation) are implemented
> and tested end to end, including a live testnet settlement path and a real search
> eval harness (numbers: [`docs/benchmarks.md`](docs/benchmarks.md)). `packages/mcp-server`
> and `packages/seller-sdk` are still design/skeleton. This is our SCF #45 RFP submission
> ("x402 Facilitator with Bazaar discovery support"); code lands milestone by milestone.

## What Rialto is

x402 lets software pay for HTTP resources with an on-chain payment instead of an API key.
Settlement on Stellar already works - the missing piece is **discovery**: an agent can
only pay endpoints it was already told about. Rialto adds the discovery layer:

- every payment that flows through the facilitator automatically catalogs the service it
  paid for - being paid is what gets a service listed,
- agents search that catalog in plain language and pay for what they find,
- the index **federates**: independent facilitators can register, external catalogs are
  ingested and cross-published, so a service settles anywhere but is findable everywhere.

## Repository layout

| Path | What it is |
|------|-----------|
| `packages/facilitator` | The service: `/verify`, `/settle`, `/supported` + discovery endpoints, built on the Apache-2.0 [`@x402/stellar`](https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/stellar) package (we compose settlement, we do not reimplement it) |
| `packages/discovery` | Catalog store, hybrid search, and federation (register / ingest / cross-publish) |
| `packages/mcp-server` | MCP tools for agents: search the catalog, make a paid call, hold a verifiable receipt |
| `packages/seller-sdk` | Helpers for sellers to declare and validate discovery metadata before it ever reaches an index |
| `packages/eval-harness` | The search-quality test set and scoring pipeline - versioned queries with known right answers, run on every ranking change |
| `contracts/upto-settlement` | Soroban contract enforcing the `upto` (pay-up-to) scheme's spending cap on-chain |
| `docs/` | Architecture, diagram, and design-decision records |
| `site/` | The documentation website (Next.js + Fumadocs) |
| `examples/` | Runnable seller and buyer end-to-end examples |

## Design decisions

Recorded in [`docs/decisions/`](docs/decisions/). The two that shape everything:

1. [`upto` enforces its cap on-chain](docs/decisions/0001-upto-onchain-cap.md) - a small
   settlement contract, because token allowances alone cannot bind the recipient or
   guarantee single settlement.
2. [Search quality is proven, not asserted](docs/decisions/0002-search-stack-and-eval.md) -
   hybrid retrieval on PostgreSQL (pgvector) with a public evaluation harness gating
   every change. Current numbers and honest v1 scope: [`docs/benchmarks.md`](docs/benchmarks.md).

## License

[Apache-2.0](LICENSE). No copyleft anywhere in the dependency path.

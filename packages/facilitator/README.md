# @rialto/facilitator

The Rialto facilitator service: canonical x402 `/verify`, `/settle`, and `/supported`
endpoints for `stellar:testnet` and `stellar:pubnet`, plus the Bazaar discovery endpoints
(`/discovery/resources`, `/discovery/search`).

Settlement composes the Apache-2.0 `@x402/stellar` package - we do not reimplement
verify/settle logic. This package adds what a running service needs around it:

- channel-account throughput (parallel settlements without sequence-number collisions)
  with a dedicated fee-bump signer
- fee sponsorship (`extra.areFeesSponsored`)
- sponsor-cost protection: a flat rate limit (120 req/min per process, hardcoded -
  not yet configurable, not yet per-principal or tied to settlement success rate;
  see `docs/guides/operator-guide.md` for the honest current state vs. the intended
  design) plus an optional Bearer API key
- automatic cataloging: payments carrying the Bazaar extension are validated and indexed
  as a side effect of settlement (see `@rialto/discovery`)
- machine-readable, non-null rejection reasons on every refusal
- verifiable settlement receipts, so a buyer can confirm on-ledger that its payment landed

See [`docs/guides/operator-guide.md`](../../docs/guides/operator-guide.md) for every
environment variable, deployment via `docker-compose.yml`, and what's still a stub
(self-facilitation has no example yet).

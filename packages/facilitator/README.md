# @rialto/facilitator

The Rialto facilitator service: canonical x402 `/verify`, `/settle`, and `/supported`
endpoints for `stellar:testnet` and `stellar:pubnet`, plus the Bazaar discovery endpoints
(`/discovery/resources`, `/discovery/search`).

Settlement composes the Apache-2.0 `@x402/stellar` package - we do not reimplement
verify/settle logic. This package adds what a running service needs around it:

- channel-account throughput (parallel settlements without sequence-number collisions)
  with a dedicated fee-bump signer
- fee sponsorship (`extra.areFeesSponsored`), with sponsor-cost protection: rate limits
  tied to a caller's settlement success rate and per-principal cost accounting, since
  every failed sponsored settlement is a cost the facilitator pays
- automatic cataloging: payments carrying the Bazaar extension are validated and indexed
  as a side effect of settlement (see `@rialto/discovery`)
- machine-readable, non-null rejection reasons on every refusal
- verifiable settlement receipts, so a buyer can confirm on-ledger that its payment landed

Hosted, self-hosted, and self-facilitation deployment paths will all be documented here.

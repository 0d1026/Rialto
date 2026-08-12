# @rialto/discovery

The catalog and search layer.

- **Catalog**: PostgreSQL-backed index of paid HTTP endpoints and MCP tools (keyed on
  resource URL + tool name), populated automatically when payments carrying the Bazaar
  extension settle. Metadata is validated before indexing - schema checks, route-template
  sanitization (percent-decoding before traversal checks), and field-level soft-drop -
  so a hostile client cannot poison the index. Cataloging outcomes are reported back via
  the `EXTENSION-RESPONSES` header.
- **Search**: hybrid retrieval (BM25 + local embeddings, reciprocal rank fusion) with
  query-derived structured filters and settlement-history ranking. Quality is gated by
  `@rialto/eval-harness` - see docs/decisions/0002.
- **Federation**: a registration endpoint for independent facilitators, ingestion of
  external catalogs, and cross-publishing - a service settles anywhere but is findable
  everywhere. This is our answer to the open interop question in stellar/x402-stellar#50.

## Testing

```
pnpm test        # unit + integration, against a throwaway Postgres
pnpm test:watch  # same, watch mode
pnpm test:live   # [LIVE] - requires LIVE_DISCOVERY_URL (and LIVE_INGEST_TOKEN if set)
```

`pnpm test` starts a disposable Postgres container via the Docker CLI automatically
(same image as `docker-compose.yml`) and tears it down after. Set `TEST_DATABASE_URL`
yourself to point at an existing instance instead (e.g. in CI) and Docker is skipped
entirely.

Layout: `test/unit` (pure logic + single-service HTTP behavior), `test/integration`
(cross-cutting flows against a real Postgres), `test/live` (hits a real deployed
instance, excluded from `pnpm test`). See `test/unit/01.gauntlet.spec.ts` onward for
the current baseline; `test/integration/08.regression-route-template.spec.ts` is a
known-failing regression test for the `routeTemplate`-dropped bug in
`packages/facilitator/src/settlement-events.ts` - it stays red until that's fixed.

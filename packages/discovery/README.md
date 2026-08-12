# @rialto/discovery

The catalog and search layer.

- **Catalog**: PostgreSQL-backed index of paid HTTP endpoints and MCP tools (keyed on
  resource URL + tool name), populated automatically when payments carrying the Bazaar
  extension settle. Metadata is validated before indexing - schema checks, route-template
  sanitization (percent-decoding before traversal checks), and field-level soft-drop -
  so a hostile client cannot poison the index. Cataloging outcomes are reported back via
  the `EXTENSION-RESPONSES` header.
- **Search**: hybrid retrieval - real BM25F (`src/search/bm25.ts`, Postgres does
  tokenization only) + a local embedding model (transformers.js, in-process, no external
  API) stored via **pgvector** and compared with SQL's `<=>` cosine operator - fused by
  rank position only (`src/search/fusion.ts`), with query-derived structured filters
  (network as a hard filter) and settlement-history ranking as a tiebreak. Quality is
  gated by `@rialto/eval-harness` - numbers in `docs/benchmarks.md`, methodology and
  known gaps in that package's README. See `docs/decisions/0002` for the full design.
- **Embedding worker**: a separate async process (`pnpm embed-worker`) claims jobs from a
  Postgres queue (`FOR UPDATE SKIP LOCKED`, lease-based crash recovery, exponential
  backoff, dead-lettering) so embedding never blocks cataloging or the request path.
  Vectors are generation-versioned (`src/search/embedding-worker.ts`'s
  `getOrCreateGeneration`) - a model swap never compares old and new vectors.
- **Federation**: a registration endpoint for independent facilitators, ingestion of
  external catalogs, and cross-publishing - a service settles anywhere but is findable
  everywhere. This is our answer to the open interop question in stellar/x402-stellar#50.

## Running it

Needs Postgres with the **pgvector** extension (`pgvector/pgvector:pg17`, not plain
`postgres:17-alpine` - see `migrations/0003_pgvector.sql`).

```
DATABASE_URL=postgresql://... pnpm dev            # API server
DATABASE_URL=postgresql://... pnpm embed-worker    # embedding worker, separate process
```

`docker-compose.yml` at the repo root runs the whole stack (Postgres, discovery,
embed-worker, facilitator) together.

## Testing

```
pnpm test        # unit + integration, against a throwaway Postgres
pnpm test:watch  # same, watch mode
pnpm test:live   # [LIVE] - requires LIVE_DISCOVERY_URL (and LIVE_INGEST_TOKEN if set)
```

`pnpm test` starts a disposable pgvector-enabled Postgres container via the Docker CLI
automatically and tears it down after. Set `TEST_DATABASE_URL` yourself to point at an
existing instance instead (e.g. in CI) and Docker is skipped entirely. The suite's one
real-model block (`test/unit/11.dense-retrieval.spec.ts`'s `[MODEL]` describe) downloads
the embedding model on first run (~90MB, cached afterward via `EMBEDDING_CACHE_DIR`);
everything else uses a fast, deterministic fake model
(`test/setup/fake-embedding-model.ts`).

Layout: `test/unit` (pure logic + single-service HTTP behavior), `test/integration`
(cross-cutting flows against a real Postgres), `test/live` (hits a real deployed
instance, excluded from `pnpm test`). See `test/unit/01.gauntlet.spec.ts` onward for
the current baseline.

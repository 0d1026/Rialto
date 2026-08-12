-- Stage 0 of the BM25/hybrid search work (docs: discovery-bm25-hybrid-eval-spec.md).
-- settlement_count backs stage 3's settlement-history ranking: at equal or
-- near-equal fused rank, the resource with more settlements (and a more
-- recent last_updated) ranks first.
--
-- Applied automatically and idempotently by Catalog.connect() (see
-- src/catalog.ts's SCHEMA constant) on every service start, the same way
-- every other schema change in this package has been applied so far - there
-- is no separate migration-runner step to remember. This file exists as the
-- versioned, human-readable record of that change, not as something you run
-- by hand.

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS settlement_count INTEGER NOT NULL DEFAULT 0;

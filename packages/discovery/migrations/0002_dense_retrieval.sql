-- Stage 2 of the BM25/hybrid search work: generation-versioned dense
-- retrieval. Applied automatically and idempotently by Catalog.connect()
-- (src/catalog.ts's SCHEMA constant), same as migrations/0001.
--
-- No pgvector: the deployed image (docker-compose.yml) is vanilla
-- postgres:17-alpine, not a pgvector build. Vectors are stored as
-- double precision[] and compared by cosine similarity in application code
-- (src/search/dense.ts) - correct and fast enough at catalog scale; adding
-- pgvector is a future optimization once corpus size justifies an ANN index,
-- not a correctness requirement now.

-- One row per distinct embedding configuration. Changing model/revision/
-- dimension/pooling/normalization is a new generation; old and new
-- generations' vectors are never compared to each other (see dense.ts).
CREATE TABLE IF NOT EXISTS generations (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  pooling TEXT NOT NULL,
  normalization TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, revision, dimension, pooling, normalization)
);

-- The embedding worker's job queue. Claimed with FOR UPDATE SKIP LOCKED
-- (embedding-worker.ts); next_attempt_at doubles as both "not due for retry
-- yet" (pending) and a claim lease expiry (processing) - see that file's
-- header comment for why a single column covers both.
CREATE TABLE IF NOT EXISTS embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embedding_jobs_claim_idx ON embedding_jobs (status, next_attempt_at);
-- at most one live (pending or processing) job per resource at a time
CREATE UNIQUE INDEX IF NOT EXISTS embedding_jobs_live_resource_idx
  ON embedding_jobs (resource_id) WHERE status IN ('pending', 'processing');

-- Resource metadata embeddings AND synthetic-query embeddings, both keyed
-- to a generation. `kind` distinguishes them; both are searched together
-- by dense.ts (a synthetic query embedding matching means the resource it
-- was generated for is the right answer).
CREATE TABLE IF NOT EXISTS embeddings (
  id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  generation_id BIGINT NOT NULL REFERENCES generations(id),
  kind TEXT NOT NULL CHECK (kind IN ('resource', 'synthetic_query')),
  text TEXT NOT NULL,
  vector DOUBLE PRECISION[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embeddings_generation_idx ON embeddings (generation_id);
CREATE INDEX IF NOT EXISTS embeddings_resource_idx ON embeddings (resource_id);

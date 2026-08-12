-- Switches embeddings.vector from double precision[] (stage 2's original,
-- portable-but-slow choice) to pgvector's `vector` type, and moves cosine
-- similarity computation from application-code JS (src/search/dense.ts) into
-- SQL via the `<=>` operator.
--
-- Deployment requirement: the Postgres image must have the pgvector
-- extension available (docker-compose.yml now uses pgvector/pgvector:pg17,
-- not plain postgres:17-alpine) - CREATE EXTENSION below fails otherwise.
--
-- Deliberately dimension-LESS (`vector`, not `vector(384)`): a fixed-width
-- column can't hold more than one embedding dimension, but this table holds
-- every generation's vectors side by side (migrations/0002's whole point -
-- old and new generations coexist during a model swap). Every real query
-- scopes by generation_id first (src/search/dense.ts), so any two vectors
-- actually compared always share the same dimension by construction; the
-- ANY-dimension shape here is what makes that safe without a migration
-- every time the model changes.
--
-- No ANN index (hnsw/ivfflat): ADR 0002 already decided against one at this
-- corpus size - exact scan, just computed by pgvector's operator instead of
-- hand-rolled JS now.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE embeddings
  ALTER COLUMN vector TYPE vector USING vector::real[]::vector;

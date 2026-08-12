/**
 * Dense retrieval: embeds the query with the live model, compares against
 * only the current generation's vectors (never a stale generation left
 * behind by a model/config change - see embedding-worker.ts's
 * getOrCreateGeneration), and returns resources ranked by best cosine
 * similarity across either their own metadata embedding or any of their
 * synthetic query embeddings (whichever is the closer match).
 *
 * Cosine similarity is computed in SQL via pgvector's `<=>` operator
 * (cosine distance; similarity = 1 - distance), not a JS loop - see
 * migrations/0003_pgvector.sql. Still an exact scan, no ANN index
 * (hnsw/ivfflat): ADR 0002 already decided against one at this corpus
 * size. `cosineSimilarity` stays exported as a plain utility (useful in
 * isolation, e.g. for tests) even though the query path below doesn't call it.
 */
import type pg from 'pg';
import pgvector from 'pgvector/pg';
import { getOrCreateGeneration } from './embedding-worker.js';
import type { EmbeddingModel } from './embedding-model.js';

export interface DenseCandidate {
  resourceId: number;
  score: number;
  matchedKind: 'resource' | 'synthetic_query';
  matchedText: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface BestMatchRow {
  resource_id: number;
  kind: 'resource' | 'synthetic_query';
  text: string;
  score: number;
}

/**
 * Returns candidates ranked by best-matching embedding (resource's own text
 * or any synthetic query), restricted to the model's current generation.
 * Returns an empty list (not an error) when the current generation has no
 * vectors yet - the caller (hybrid.ts) is what decides whether that means
 * `partialResults: true`.
 */
export async function denseSearch(
  pool: pg.Pool,
  model: EmbeddingModel,
  query: string,
): Promise<DenseCandidate[]> {
  const generationId = await getOrCreateGeneration(pool, model);
  const [queryVector] = await model.embed([query]);
  const queryVectorSql = pgvector.toSql(queryVector);

  // Inner query: best-matching row (lowest cosine distance) per resource,
  // via DISTINCT ON. Outer query: re-sort that one-row-per-resource result
  // by score across the whole candidate set (DISTINCT ON's own ORDER BY is
  // pinned to the distinct columns, so the final ranking needs its own pass).
  const rows = await pool.query<BestMatchRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (resource_id)
         resource_id, kind, text, 1 - (vector <=> $2) AS score
       FROM embeddings
       WHERE generation_id = $1
       ORDER BY resource_id, vector <=> $2
     ) best
     ORDER BY score DESC`,
    [generationId, queryVectorSql],
  );

  return rows.rows.map((row) => ({
    resourceId: row.resource_id,
    score: row.score,
    matchedKind: row.kind,
    matchedText: row.text,
  }));
}

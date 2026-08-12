/**
 * The embedding worker: claims jobs from embedding_jobs via
 * `FOR UPDATE SKIP LOCKED` (so multiple worker instances never claim the
 * same row), batches, retries with exponential backoff, and dead-letters
 * after MAX_ATTEMPTS.
 *
 * Crash recovery: claiming a job doesn't just flip its status, it also
 * pushes next_attempt_at forward by LEASE_DURATION_MS - a visibility
 * timeout, the same mechanism SQS/similar queues use. The claim query's
 * WHERE clause matches `status IN ('pending','processing') AND
 * next_attempt_at <= now()`, so a job whose worker crashed mid-batch (still
 * marked 'processing', lease never renewed) becomes reclaimable the moment
 * its lease expires - a second worker instance picks it up rather than it
 * silently vanishing. This is why next_attempt_at does double duty as both
 * "not due for retry yet" (pending) and "claim lease expiry" (processing),
 * instead of two separate columns.
 */
import type pg from 'pg';
import pgvector from 'pgvector/pg';
import type { EmbeddingModel } from './embedding-model.js';
import { generateSyntheticQueries } from './synthetic-queries.js';

export const BATCH_SIZE = 10;
export const LEASE_DURATION_MS = 2 * 60_000;
export const MAX_ATTEMPTS = 5;
/** Exponential backoff base; capped so a flapping dependency doesn't push a job out days */
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 10 * 60_000;

export interface EmbeddingJob {
  id: number;
  resource_id: number;
  attempts: number;
}

export function backoffDelayMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_CAP_MS);
}

/** Looks up (or creates) the generations row for this model's exact config. Same config always resolves to the same generation id. */
export async function getOrCreateGeneration(pool: pg.Pool, model: EmbeddingModel): Promise<number> {
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM generations
     WHERE model_id = $1 AND revision = $2 AND dimension = $3 AND pooling = $4 AND normalization = $5`,
    [model.modelId, model.revision, model.dimension, model.pooling, model.normalization],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO generations (model_id, revision, dimension, pooling, normalization)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (model_id, revision, dimension, pooling, normalization) DO UPDATE SET model_id = EXCLUDED.model_id
     RETURNING id`,
    [model.modelId, model.revision, model.dimension, model.pooling, model.normalization],
  );
  return inserted.rows[0].id;
}

/** Claims up to `batchSize` due jobs (fresh pending, or processing whose lease expired) and marks them processing with a fresh lease. */
export async function claimBatch(pool: pg.Pool, batchSize: number = BATCH_SIZE): Promise<EmbeddingJob[]> {
  const res = await pool.query<EmbeddingJob>(
    `UPDATE embedding_jobs
     SET status = 'processing',
         attempts = attempts + 1,
         next_attempt_at = now() + ($2 || ' milliseconds')::interval,
         updated_at = now()
     WHERE id IN (
       SELECT id FROM embedding_jobs
       WHERE status IN ('pending', 'processing') AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, resource_id, attempts`,
    [batchSize, LEASE_DURATION_MS],
  );
  return res.rows;
}

async function markDone(pool: pg.Pool, jobId: number): Promise<void> {
  await pool.query(`UPDATE embedding_jobs SET status = 'done', updated_at = now() WHERE id = $1`, [jobId]);
}

async function markFailed(pool: pg.Pool, job: EmbeddingJob, error: string): Promise<void> {
  if (job.attempts >= MAX_ATTEMPTS) {
    await pool.query(
      `UPDATE embedding_jobs SET status = 'dead', last_error = $2, updated_at = now() WHERE id = $1`,
      [job.id, error],
    );
    return;
  }
  await pool.query(
    `UPDATE embedding_jobs
     SET status = 'pending', last_error = $2, updated_at = now(),
         next_attempt_at = now() + ($3 || ' milliseconds')::interval
     WHERE id = $1`,
    [job.id, error, backoffDelayMs(job.attempts)],
  );
}

interface ResourceRow {
  id: number;
  service_name: string | null;
  description: string | null;
  tags: string[] | null;
  type: 'http' | 'mcp';
}

async function embedResource(
  pool: pg.Pool,
  model: EmbeddingModel,
  generationId: number,
  resource: ResourceRow,
): Promise<void> {
  const resourceText = [resource.service_name, resource.description, ...(resource.tags ?? [])]
    .filter(Boolean)
    .join(' ');
  const syntheticQueries = generateSyntheticQueries({
    serviceName: resource.service_name ?? undefined,
    description: resource.description ?? undefined,
    tags: resource.tags ?? undefined,
    type: resource.type,
  });

  const texts = [resourceText || resource.type, ...syntheticQueries];
  const vectors = await model.embed(texts);

  // Replace this resource's vectors for this generation atomically-enough
  // for our purposes: delete then insert within one client isn't a single
  // statement, but it's scoped to (resource_id, generation_id) and this
  // worker is the only writer of embeddings for a given resource, so no
  // concurrent writer can interleave here.
  await pool.query(`DELETE FROM embeddings WHERE resource_id = $1 AND generation_id = $2`, [
    resource.id,
    generationId,
  ]);
  for (let i = 0; i < texts.length; i++) {
    const kind = i === 0 ? 'resource' : 'synthetic_query';
    await pool.query(
      `INSERT INTO embeddings (resource_id, generation_id, kind, text, vector) VALUES ($1,$2,$3,$4,$5)`,
      [resource.id, generationId, kind, texts[i], pgvector.toSql(vectors[i])],
    );
  }
}

export interface WorkerRunStats {
  claimed: number;
  succeeded: number;
  failed: number;
}

/** Claims and processes one batch. Returns immediately with zero stats if nothing is due - callers loop/poll as they see fit. */
export async function runWorkerOnce(pool: pg.Pool, model: EmbeddingModel): Promise<WorkerRunStats> {
  const generationId = await getOrCreateGeneration(pool, model);
  const jobs = await claimBatch(pool);
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const res = await pool.query<ResourceRow>(
        `SELECT id, service_name, description, tags, type FROM resources WHERE id = $1`,
        [job.resource_id],
      );
      const resource = res.rows[0];
      if (!resource) {
        // resource was deleted since the job was queued - nothing to embed, done.
        await markDone(pool, job.id);
        succeeded++;
        continue;
      }
      await embedResource(pool, model, generationId, resource);
      await markDone(pool, job.id);
      succeeded++;
    } catch (err) {
      await markFailed(pool, job, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  return { claimed: jobs.length, succeeded, failed };
}

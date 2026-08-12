/**
 * Standalone embedding worker process: `pnpm embed-worker`. Polls for due
 * jobs and processes them in batches (search/embedding-worker.ts) until
 * stopped. Separate process from the API server (index.ts) deliberately -
 * model inference shouldn't share an event loop with request handling.
 */
import 'dotenv/config';
import pg from 'pg';
import { pino } from 'pino';
import { Catalog } from './catalog.js';
import { localEmbeddingModel } from './search/embedding-model.js';
import { runWorkerOnce } from './search/embedding-worker.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const POLL_INTERVAL_MS = Number(process.env.EMBED_WORKER_POLL_MS ?? 5_000);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');

  // ensures the schema (embedding_jobs, embeddings, generations) exists,
  // same as the API server does on startup.
  const catalog = await Catalog.connect(databaseUrl);
  await catalog.close();

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const model = localEmbeddingModel();
  logger.info({ modelId: model.modelId, dimension: model.dimension }, 'embedding worker starting');

  let stopped = false;
  process.on('SIGINT', () => (stopped = true));
  process.on('SIGTERM', () => (stopped = true));

  while (!stopped) {
    try {
      const stats = await runWorkerOnce(pool, model);
      if (stats.claimed > 0) {
        logger.info(stats, 'embedding batch processed');
      }
      if (stats.claimed === 0) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      logger.error({ err }, 'embedding worker batch failed');
      await sleep(POLL_INTERVAL_MS);
    }
  }

  await pool.end();
  logger.info('embedding worker stopped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});

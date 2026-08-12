import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Catalog } from './catalog.js';
import { createRouter } from './router.js';
import { localEmbeddingModel, type EmbeddingModel } from './search/embedding-model.js';

/**
 * Builds the Express app without binding a port - the process entrypoint
 * (index.ts) owns listen()/shutdown; tests build an app instance directly
 * against a Catalog they control, so nothing here touches a real socket.
 *
 * embeddingModel defaults to the real local model (search/embedding-
 * model.ts); tests override it with the fake, offline model
 * (test/setup/fake-embedding-model.ts) so most of the suite doesn't pay
 * model-load cost - see test/unit/12.fusion.spec.ts and
 * 13.settlement-ranking.spec.ts.
 */
export function createApp(
  catalog: Catalog,
  opts: { ingestToken?: string; embeddingModel?: EmbeddingModel } = {},
): Express {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const embeddingModel = opts.embeddingModel ?? localEmbeddingModel();

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGINS ?? '*' }));
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '256kb' }));
  app.use(createRouter(catalog, { ...opts, embeddingModel }));

  // Without this, an unhandled error (e.g. a malformed query param reaching
  // Postgres as invalid syntax) falls through to Express's own default
  // handler, which renders an HTML page containing the error's stack trace
  // - server file paths and library internals, in the response body. Every
  // other rejection in this codebase carries a coded, non-null reason
  // (facilitator's app.ts has the same middleware); this closes the one
  // path here that didn't.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'simulation_failed', reason: 'Internal server error' } });
    }
  });

  return app;
}

import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Catalog } from './catalog.js';
import { createRouter } from './router.js';

/**
 * Builds the Express app without binding a port - the process entrypoint
 * (index.ts) owns listen()/shutdown; tests build an app instance directly
 * against a Catalog they control, so nothing here touches a real socket.
 */
export function createApp(catalog: Catalog, opts: { ingestToken?: string } = {}): Express {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGINS ?? '*' }));
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '256kb' }));
  app.use(createRouter(catalog, opts));

  return app;
}

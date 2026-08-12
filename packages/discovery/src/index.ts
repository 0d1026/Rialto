import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { Catalog } from './catalog.js';
import { createRouter } from './router.js';

export { Catalog } from './catalog.js';
export * from './validation.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');
  const port = Number(process.env.PORT ?? 4030);

  const catalog = await Catalog.connect(databaseUrl);
  logger.info({ resources: await catalog.count() }, 'catalog connected');

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGINS ?? '*' }));
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '256kb' }));
  app.use(createRouter(catalog, { ingestToken: process.env.INGEST_TOKEN }));

  const server = app.listen(port, () => {
    logger.info({ port }, 'Rialto discovery listening');
  });

  function shutdown(signal: string) {
    logger.info(`received ${signal}, shutting down`);
    const force = setTimeout(() => process.exit(1), 5000);
    force.unref();
    server.close(() => {
      clearTimeout(force);
      void catalog.close().finally(() => process.exit(0));
    });
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Only start the server when run directly (the package is also imported as a library).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error({ err }, 'fatal');
    process.exit(1);
  });
}

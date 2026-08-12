import 'dotenv/config';
import { Env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(Env.port, () => {
  logger.info({ port: Env.port, network: Env.stellarNetwork }, 'Rialto facilitator listening');
});

function shutdown(signal: string) {
  logger.info(`received ${signal}, shutting down`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  server.close(() => {
    clearTimeout(force);
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

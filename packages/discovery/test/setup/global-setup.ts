import { execFileSync, spawnSync } from 'node:child_process';

/**
 * Boots a throwaway Postgres for the suite via the Docker CLI (the same
 * image docker-compose.yml uses to self-host the real stack) so `pnpm test`
 * is self-contained - no manually-started service to remember, and nothing
 * for a stale run to leave behind: the container is named and removed on
 * teardown, and forcibly removed again before creation in case a previous
 * run was killed without cleaning up.
 *
 * Set TEST_DATABASE_URL yourself (e.g. in CI, pointed at a managed
 * Postgres) to skip Docker entirely - this setup then does nothing.
 */

const CONTAINER_NAME = 'rialto-discovery-test-pg';
const PORT = 15433;
const PASSWORD = 'test';
const DB = 'rialto_test';

function dockerAvailable(): boolean {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return r.status === 0;
}

export default async function setup(): Promise<(() => Promise<void>) | void> {
  if (process.env.TEST_DATABASE_URL) {
    return;
  }

  if (!dockerAvailable()) {
    throw new Error(
      'TEST_DATABASE_URL is not set and Docker is not available to start one. ' +
        'Either start Docker or set TEST_DATABASE_URL to a reachable Postgres instance.',
    );
  }

  // idempotent: ignore failure if no prior container exists
  spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });

  execFileSync('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER_NAME,
    '-e',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    '-e',
    `POSTGRES_DB=${DB}`,
    '-p',
    `${PORT}:5432`,
    // pgvector, not plain postgres - the embeddings table needs the vector
    // extension (migrations/0003_pgvector.sql).
    'pgvector/pgvector:pg17',
  ]);

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    const r = spawnSync('docker', ['exec', CONTAINER_NAME, 'pg_isready', '-U', 'postgres'], {
      stdio: 'ignore',
    });
    if (r.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) {
    execFileSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });
    throw new Error(`Postgres test container did not become ready within 30s`);
  }

  process.env.TEST_DATABASE_URL = `postgresql://postgres:${PASSWORD}@localhost:${PORT}/${DB}`;

  return async function teardown() {
    spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });
  };
}

import pg from 'pg';
import pgvector from 'pgvector/pg';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL not set - global setup should have provided this');
  }
  return url;
}

/**
 * A pool with pgvector's types registered, for tests that query
 * `embeddings.vector` directly (Catalog.connect() does the same internally
 * for its own pool - tests that talk to the DB outside a Catalog instance
 * need this too, or a `vector` column read back comes back as raw wire
 * text instead of number[]).
 */
export function testPool(): pg.Pool {
  return new pg.Pool({
    connectionString: testDatabaseUrl(),
    onConnect: async (client) => {
      await pgvector.registerTypes(client);
    },
  });
}

/** Wipes catalog state between tests without reconnecting the Catalog under test. */
export async function resetDb(): Promise<void> {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  try {
    // CASCADE: embedding_jobs/embeddings (stage 2) have FKs onto resources.
    await pool.query(
      'TRUNCATE resources, federation_peers, generations, embedding_jobs, embeddings RESTART IDENTITY CASCADE',
    );
  } finally {
    await pool.end();
  }
}

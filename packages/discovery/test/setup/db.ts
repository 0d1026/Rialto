import pg from 'pg';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL not set - global setup should have provided this');
  }
  return url;
}

/** Wipes catalog state between tests without reconnecting the Catalog under test. */
export async function resetDb(): Promise<void> {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  try {
    await pool.query('TRUNCATE resources, federation_peers RESTART IDENTITY');
  } finally {
    await pool.end();
  }
}

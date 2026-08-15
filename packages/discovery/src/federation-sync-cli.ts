/**
 * One-shot federation sync CLI. Pulls every registered x402 discovery source
 * into the catalog and prints per-peer + net-new counts. Run on a schedule
 * (Railway cron) to keep the index current as the ecosystem grows.
 *
 *   DATABASE_URL=postgres://... pnpm federation-sync
 */
import 'dotenv/config';
import { Catalog } from './catalog.js';
import { syncAll } from './federation/sync.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');

  const catalog = await Catalog.connect(databaseUrl);
  try {
    const result = await syncAll(catalog);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await catalog.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

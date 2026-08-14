/**
 * One-off concurrent CDP loader. Reuses the exact Catalog.add() path (same
 * validation gauntlet, provenance, ON CONFLICT upsert) as ingest-cli, but runs
 * many adds in flight at once so the per-insert round trip to a remote database
 * overlaps instead of running one at a time. Safe to re-run: upsert on conflict.
 *
 *   DATABASE_URL=... tsx src/bulk-load.ts <dir-of-page-*.json> [concurrency]
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Catalog } from './catalog.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: tsx src/bulk-load.ts <dir> [concurrency]');
  const concurrency = Number(process.argv[3] ?? 24);

  const files = readdirSync(dir)
    .filter((f) => f.startsWith('page-') && f.endsWith('.json'))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

  const items: Record<string, unknown>[] = [];
  for (const file of files) {
    const page = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      items?: Record<string, unknown>[];
    };
    for (const item of page.items ?? []) items.push(item);
  }

  const catalog = await Catalog.connect(databaseUrl);
  let seen = 0;
  let added = 0;
  let rejected = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++];
      seen++;
      try {
        const result = await catalog.add(
          {
            resource: item.resource,
            type: item.type,
            x402Version: item.x402Version,
            accepts: item.accepts,
            description: item.description,
            mimeType: item.mimeType,
            serviceName: item.serviceName,
            tags: item.tags,
            iconUrl: item.iconUrl,
            extensions: item.extensions,
          },
          'ingested',
          'cdp-bazaar',
        );
        if (result.ok) added++;
        else rejected++;
      } catch {
        rejected++;
      }
      if (seen % 500 === 0) {
        console.log(`progress: seen=${seen}/${items.length} added=${added} rejected=${rejected}`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    console.log(
      `done: seen=${seen} added=${added} rejected=${rejected} total=${await catalog.count()}`,
    );
  } finally {
    await catalog.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

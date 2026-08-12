/**
 * Ingestion CLI - loads external catalogs into ours with provenance labels.
 *
 *   pnpm ingest cdp <dir-of-page-*.json>     # the downloaded CDP Bazaar dataset (v2 entries)
 *   pnpm ingest algovoi [url]                # AlgoVoi's live catalog (v1-style entries)
 *
 * Mappers are written against INSPECTED shapes, not guessed ones:
 * - CDP item: { resource, type:'http', x402Version:2, accepts:[{scheme,network,payTo,
 *   asset,amount,...}], description, extensions:{bazaar:...}, lastUpdated, quality,
 *   serviceName? (top-level on some entries) }
 * - AlgoVoi: { facilitator, items:[{ resource, type, accepts:[{scheme,network,payTo,
 *   asset,maxAmountRequired,description,mimeType,outputSchema,...}], metadata,
 *   lastUpdated }], ... } - v1-style requirements (maxAmountRequired), no per-entry
 *   x402Version -> recorded as 1.
 */

import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Catalog } from './catalog.js';

interface Stats {
  seen: number;
  added: number;
  rejected: number;
  droppedFields: number;
}

async function ingestCdp(catalog: Catalog, dir: string): Promise<Stats> {
  const stats: Stats = { seen: 0, added: 0, rejected: 0, droppedFields: 0 };
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('page-') && f.endsWith('.json'))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
  for (const file of files) {
    const page = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      items?: Record<string, unknown>[];
    };
    for (const item of page.items ?? []) {
      stats.seen++;
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
      if (result.ok) {
        stats.added++;
        stats.droppedFields += result.dropped.length;
      } else {
        stats.rejected++;
      }
    }
  }
  return stats;
}

async function ingestAlgovoi(catalog: Catalog, url: string): Promise<Stats> {
  const stats: Stats = { seen: 0, added: 0, rejected: 0, droppedFields: 0 };
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`algovoi fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  for (const item of body.items ?? []) {
    stats.seen++;
    const accepts = Array.isArray(item.accepts)
      ? (item.accepts as Record<string, unknown>[])
      : [];
    const first = accepts[0] ?? {};
    const result = await catalog.add(
      {
        resource: item.resource,
        type: item.type ?? 'http',
        // v1-style entries (maxAmountRequired in accepts, no version field)
        x402Version: 1,
        accepts,
        description: typeof first.description === 'string' ? first.description : undefined,
        mimeType: typeof first.mimeType === 'string' ? first.mimeType : undefined,
      },
      'ingested',
      url,
    );
    if (result.ok) {
      stats.added++;
      stats.droppedFields += result.dropped.length;
    } else {
      stats.rejected++;
    }
  }
  await catalog.registerPeer('AlgoVoi', new URL(url).origin, url);
  await catalog.markPeerIngested(new URL(url).origin);
  return stats;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');
  const [mode, arg] = process.argv.slice(2);

  const catalog = await Catalog.connect(databaseUrl);
  try {
    let stats: Stats;
    if (mode === 'cdp') {
      if (!arg) throw new Error('usage: pnpm ingest cdp <dir>');
      stats = await ingestCdp(catalog, arg);
    } else if (mode === 'algovoi') {
      stats = await ingestAlgovoi(
        catalog,
        arg ?? 'https://api.algovoi.co.uk/discovery/resources',
      );
    } else {
      throw new Error('usage: pnpm ingest cdp <dir> | pnpm ingest algovoi [url]');
    }
    console.log(
      `${mode}: seen=${stats.seen} added=${stats.added} rejected=${stats.rejected} ` +
        `softDroppedFields=${stats.droppedFields} total=${await catalog.count()}`,
    );
  } finally {
    await catalog.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

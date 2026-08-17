/**
 * Rolling live-catalog eval. Samples real entries from the deployed discovery
 * catalog, derives a natural-language query from each entry's own metadata, and
 * measures whether search brings that entry back (known-item retrieval). Unlike
 * the fixed 15-query golden set (runner.ts), the catalog changes over time, so
 * this number moves as real services are cataloged.
 *
 * This is deliberately a known-item UPPER BOUND: the query is generated from the
 * target's own text, so it measures whether search can recover a document it has
 * indexed, not full topical relevance. It must be labeled as an upper bound
 * wherever it is published.
 *
 * Run: DISCOVERY_URL=https://... pnpm rolling
 */
import type { Judgment } from './fixtures/judgments.js';
import { scoreConfiguration, type RankedList } from './metrics.js';

const DISCOVERY_URL = (
  process.env.DISCOVERY_URL || 'https://rialto-production-97c9.up.railway.app'
).replace(/\/$/, '');
const SAMPLE_SIZE = Number(process.env.ROLLING_SAMPLE ?? 40);

interface Resource {
  resource: string;
  description?: string;
  serviceName?: string;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Natural-language query from an entry's own metadata; null if there's no usable text. */
function queryFor(r: Resource): string | null {
  const raw = (r.description || r.serviceName || '').trim();
  if (raw.length < 8) return null;
  return raw.replace(/\s+/g, ' ').slice(0, 120);
}

/** Spread the sample across the whole catalog, not just the most recent entries. */
async function sampleResources(total: number, n: number): Promise<Resource[]> {
  const picks: Resource[] = [];
  const seen = new Set<string>();
  const pageSize = 20;
  let attempts = 0;
  while (picks.length < n && attempts < n * 4) {
    attempts++;
    const offset = Math.floor(Math.random() * Math.max(1, total - pageSize));
    const body = await getJson(
      `${DISCOVERY_URL}/discovery/resources?limit=${pageSize}&offset=${offset}`,
    );
    for (const it of (body.items ?? []) as Resource[]) {
      if (picks.length >= n) break;
      if (seen.has(it.resource) || !queryFor(it)) continue;
      seen.add(it.resource);
      picks.push(it);
    }
  }
  return picks;
}

async function search(query: string): Promise<RankedList> {
  const body = await getJson(
    `${DISCOVERY_URL}/discovery/search?query=${encodeURIComponent(query)}&limit=20`,
  );
  return ((body.resources ?? []) as Array<{ resource: string }>).map((r) => r.resource);
}

export interface RollingResult {
  generatedAt: string;
  discoveryUrl: string;
  catalogSize: number;
  sampleSize: number;
  metric: 'known-item-upper-bound';
  ndcgAt10: number;
  mrr: number;
  recallAt20: number;
  /** Sampled entries whose own-metadata query brought them back at rank 1. */
  recoveredAtRank1: number;
}

export async function runRolling(): Promise<RollingResult> {
  const health = await getJson(`${DISCOVERY_URL}/health`);
  const catalogSize = Number(health.resources ?? 0);
  const sample = await sampleResources(catalogSize, SAMPLE_SIZE);

  const results: Record<string, RankedList> = {};
  const judgments: Record<string, Record<string, Judgment>> = {};
  let i = 0;
  let recoveredAtRank1 = 0;
  for (const r of sample) {
    const id = `q${i++}`;
    results[id] = await search(queryFor(r)!);
    judgments[id] = { [r.resource]: 1 };
    if (results[id][0] === r.resource) recoveredAtRank1++;
  }

  const agg = scoreConfiguration(results, judgments);
  return {
    generatedAt: new Date().toISOString(),
    discoveryUrl: DISCOVERY_URL,
    catalogSize,
    sampleSize: sample.length,
    metric: 'known-item-upper-bound',
    ndcgAt10: Number(agg.ndcgAt10.toFixed(4)),
    mrr: Number(agg.mrr.toFixed(4)),
    recallAt20: Number(agg.recallAt20.toFixed(4)),
    recoveredAtRank1,
  };
}

async function main(): Promise<void> {
  const result = await runRolling();
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

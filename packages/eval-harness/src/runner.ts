/**
 * Runs BM25-only, dense-only, and fused-with-settlement-ranking as three
 * separate configurations against the same catalog and golden query set,
 * and prints nDCG@10 / MRR / Recall@20 side by side - so the value each
 * search stage adds is visible, not blended into one number.
 *
 * Today this seeds fixtures/seed-catalog.ts into whatever DATABASE_URL
 * points at (a scratch/CI Postgres, typically) rather than scoring a live
 * deployed catalog - see seed-catalog.ts's header for why, and for the
 * follow-up path (point this at a real deployment once one has enough
 * settled, cataloged resources to be worth scoring). Uses the real local
 * embedding model (not a test double) so the numbers reflect production
 * behavior.
 *
 * Run: DATABASE_URL=postgresql://... pnpm eval
 */
import pg from 'pg';
import {
  Catalog,
  localEmbeddingModel,
  runWorkerOnce,
  type EmbeddingModel,
} from '@rialto/discovery';
import { SEED_CATALOG } from './fixtures/seed-catalog.js';
import { GOLDEN_QUERIES } from './fixtures/golden-queries.js';
import { JUDGMENTS } from './fixtures/judgments.js';
import { scoreConfiguration, type RankedList } from './metrics.js';

const TOP_N = 20; // enough for Recall@20; nDCG@10/MRR use a prefix of this

async function seedCatalog(catalog: Catalog): Promise<void> {
  for (const r of SEED_CATALOG) {
    await catalog.add(
      {
        ...r,
        accepts: [
          { scheme: 'exact', network: r.network, payTo: 'GEVALHARNESS', asset: 'native', amount: r.amount },
        ],
      },
      'registered',
      'eval-harness-seed',
    );
  }
}

async function waitForEmbeddings(pool: pg.Pool, model: EmbeddingModel): Promise<void> {
  // synchronous: run the worker until the backlog this seed created is drained,
  // rather than polling a background process - this script is meant to finish.
  for (;;) {
    const stats = await runWorkerOnce(pool, model);
    if (stats.claimed === 0) break;
  }
}

async function runConfiguration(
  run: (query: string) => Promise<{ items: unknown[] }>,
): Promise<Record<string, RankedList>> {
  const results: Record<string, RankedList> = {};
  for (const q of GOLDEN_QUERIES) {
    const { items } = await run(q.text);
    results[q.id] = (items as Array<{ resource: string }>).map((i) => i.resource);
  }
  return results;
}

export interface ConfigurationResult {
  label: string;
  ndcgAt10: number;
  mrr: number;
  recallAt20: number;
}

export interface EvalResult {
  generatedAt: string;
  queryCount: number;
  catalogSize: number;
  configurations: ConfigurationResult[];
}

/** Seeds the catalog, embeds it, runs all three configurations, returns the scored result. Connects/closes its own Catalog + pool against `databaseUrl`. */
export async function runEval(databaseUrl: string): Promise<EvalResult> {
  const catalog = await Catalog.connect(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const model = localEmbeddingModel();

  await seedCatalog(catalog);
  await waitForEmbeddings(pool, model);

  const bm25Only = await runConfiguration((q) => catalog.search(q, { limit: TOP_N, offset: 0 }));
  const denseOnly = await runConfiguration((q) => catalog.denseOnlySearch(model, q, { limit: TOP_N, offset: 0 }));
  const fused = await runConfiguration((q) => catalog.hybridSearch(model, q, { limit: TOP_N, offset: 0 }));

  const rows: ConfigurationResult[] = [
    { label: 'bm25-only', ...omitPerQuery(scoreConfiguration(bm25Only, JUDGMENTS)) },
    { label: 'dense-only', ...omitPerQuery(scoreConfiguration(denseOnly, JUDGMENTS)) },
    { label: 'fused+settlement', ...omitPerQuery(scoreConfiguration(fused, JUDGMENTS)) },
  ];

  await catalog.close();
  await pool.end();

  return {
    generatedAt: new Date().toISOString(),
    queryCount: GOLDEN_QUERIES.length,
    catalogSize: SEED_CATALOG.length,
    configurations: rows,
  };
}

function omitPerQuery(s: { ndcgAt10: number; mrr: number; recallAt20: number }): {
  ndcgAt10: number;
  mrr: number;
  recallAt20: number;
} {
  return { ndcgAt10: s.ndcgAt10, mrr: s.mrr, recallAt20: s.recallAt20 };
}

export function printTable(rows: ConfigurationResult[]): void {
  const fmt = (n: number): string => n.toFixed(3);
  const widest = Math.max(...rows.map((r) => r.label.length), 'configuration'.length);
  const pad = (s: string): string => s.padEnd(widest + 2);
  console.log(pad('configuration') + 'nDCG@10  MRR      Recall@20');
  console.log('-'.repeat(widest + 2 + 26));
  for (const r of rows) {
    console.log(pad(r.label) + `${fmt(r.ndcgAt10)}    ${fmt(r.mrr)}    ${fmt(r.recallAt20)}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');

  console.log(`Seeding ${SEED_CATALOG.length} resources and embedding (loads the local model on first run)...`);
  console.log(`Running ${GOLDEN_QUERIES.length} golden queries against 3 configurations...`);
  const result = await runEval(databaseUrl);

  console.log('');
  printTable(result.configurations);
  console.log('');
  console.log(JSON.stringify(result, null, 2));
}

// Only run when invoked directly (also imported by check-regression.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * Phase 0 diagnosis recorder. Runs the golden-set eval and writes the full
 * result - aggregate, per-query, and per-category - to a versioned file, and
 * prints the fused+settlement per-category table so the weak categories (the
 * ones a reranker should target) are visible in the run log. Reads only
 * DATABASE_URL; no deploy, no pipeline change.
 *
 * Run: DATABASE_URL=postgresql://... pnpm eval:record
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEval, printTable, printCategoryTable } from './runner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../results/golden-latest.json');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');

  const result = await runEval(databaseUrl);

  console.log('');
  printTable(result.configurations);
  const fused = result.configurations.find((c) => c.label === 'fused+settlement');
  if (fused) {
    console.log('\nfused+settlement, by category (lowest MRR = where a reranker should help):');
    printCategoryTable(fused.perCategory);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nwrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

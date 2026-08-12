/**
 * CI entrypoint: runs the eval harness and fails the build if any metric on
 * the "fused+settlement" configuration (the one actually served in
 * production) regresses past REGRESSION_THRESHOLD against baseline.json -
 * the last accepted numbers, committed alongside the code that produced
 * them. Update baseline.json deliberately (a real, reviewed change) when a
 * ranking change is meant to move these numbers, not to silence this check.
 *
 * Run: DATABASE_URL=postgresql://... pnpm check-regression
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runEval, printTable, type EvalResult } from './runner.js';

const REGRESSION_THRESHOLD = 0.02; // absolute drop allowed before failing, per metric

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, '..', 'baseline.json');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL');

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as EvalResult;
  const baselineFused = baseline.configurations.find((c) => c.label === 'fused+settlement');
  if (!baselineFused) throw new Error('baseline.json has no fused+settlement configuration');

  const current = await runEval(databaseUrl);
  const currentFused = current.configurations.find((c) => c.label === 'fused+settlement')!;

  console.log('');
  printTable(current.configurations);
  console.log('');

  const metrics: Array<'ndcgAt10' | 'mrr' | 'recallAt20'> = ['ndcgAt10', 'mrr', 'recallAt20'];
  const regressions = metrics.filter((m) => baselineFused[m] - currentFused[m] > REGRESSION_THRESHOLD);

  if (regressions.length > 0) {
    console.error(`REGRESSION (threshold ${REGRESSION_THRESHOLD}):`);
    for (const m of regressions) {
      console.error(`  ${m}: baseline ${baselineFused[m].toFixed(3)} -> current ${currentFused[m].toFixed(3)}`);
    }
    process.exit(1);
  }

  console.log('No regression past threshold. Current numbers:');
  console.log(JSON.stringify(currentFused, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

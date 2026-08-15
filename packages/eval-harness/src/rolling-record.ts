/**
 * Runs the rolling live-catalog eval and records the result into the site so the
 * "Search quality, measured in CI" panel can read real, committed numbers.
 * Writes the latest run to search-quality.json and appends it to
 * search-quality-history.json (capped), both under site/lib.
 *
 * Meant to run in CI on a schedule: each run commits a fresh point, so the
 * history fills in truthfully over time instead of being fabricated.
 *
 *   DISCOVERY_URL=https://... pnpm rolling:record
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runRolling, type RollingResult } from './rolling.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..'); // packages/eval-harness/src -> repo root
const SITE_LIB = join(REPO_ROOT, 'site', 'lib');
const LATEST_PATH = join(SITE_LIB, 'search-quality.json');
const HISTORY_PATH = join(SITE_LIB, 'search-quality-history.json');
const MAX_HISTORY = 60;

async function main(): Promise<void> {
  const result = await runRolling();

  writeFileSync(LATEST_PATH, JSON.stringify(result, null, 2) + '\n');

  const history: RollingResult[] = existsSync(HISTORY_PATH)
    ? (JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) as RollingResult[])
    : [];
  history.push(result);
  const trimmed = history.slice(-MAX_HISTORY);
  writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2) + '\n');

  console.log(`recorded: ${trimmed.length} point(s) in history`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

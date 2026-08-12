/**
 * The hybrid search pipeline wired to GET /discovery/search: structured
 * constraints -> BM25 (lexical.ts) + dense (dense.ts) in parallel -> fusion
 * by rank position (fusion.ts) -> settlement-history tiebreak (ranking.ts)
 * -> pagination -> wire mapping.
 *
 * Degrades honestly: if the dense arm errors, or the embedding worker has a
 * backlog (pending/processing jobs still queued), results still return -
 * BM25-only, correctly ordered - with partialResults: true so a caller
 * knows the answer isn't the full picture yet. partialResults is only
 * false when the whole pipeline actually ran.
 */
import type pg from 'pg';
import type { EmbeddingModel } from './embedding-model.js';
import { rankLexicalCandidates } from './lexical.js';
import { denseSearch } from './dense.js';
import { extractStructuredConstraints } from './query-constraints.js';
import { reciprocalRankFusion } from './fusion.js';
import { orderByFusedScoreThenSettlementHistory, type SettlementRankable } from './ranking.js';
import { toWire } from '../wire.js';

export interface HybridSearchOpts {
  type?: string;
  limit: number;
  offset: number;
}

export interface HybridSearchResult {
  items: unknown[];
  total: number;
  partialResults: boolean;
}

async function hasEmbeddingBacklog(pool: pg.Pool): Promise<boolean> {
  const res = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM embedding_jobs WHERE status IN ('pending', 'processing')`,
  );
  return (res.rows[0]?.n ?? 0) > 0;
}

export async function hybridSearch(
  pool: pg.Pool,
  model: EmbeddingModel,
  query: string,
  opts: HybridSearchOpts,
): Promise<HybridSearchResult> {
  const constraints = extractStructuredConstraints(query);
  const searchText = constraints.strippedQuery || query;

  const lexical = await rankLexicalCandidates(pool, searchText, {
    type: opts.type,
    network: constraints.network,
  });

  let dense: Awaited<ReturnType<typeof denseSearch>> = [];
  let denseErrored = false;
  try {
    dense = await denseSearch(pool, model, searchText);
  } catch {
    denseErrored = true;
  }

  const backlogged = await hasEmbeddingBacklog(pool);
  const partialResults = denseErrored || backlogged || dense.length === 0;

  const lexicalIds = lexical.map((c) => (c.row.id as number));
  const denseIds = dense.map((c) => c.resourceId);
  const fused = reciprocalRankFusion([lexicalIds, denseIds]);

  // rows already fetched via the lexical arm cover most candidates; any
  // dense-only id (a resource with no lexical match at all) needs its own
  // row fetched for wire mapping + settlement-history data.
  const rowById = new Map(lexical.map((c) => [c.row.id as number, c.row]));
  const missingIds = denseIds.filter((id) => !rowById.has(id));
  if (missingIds.length > 0) {
    const extra = await pool.query(`SELECT * FROM resources WHERE id = ANY($1::bigint[])`, [missingIds]);
    for (const row of extra.rows) rowById.set(row.id as number, row);
  }

  let candidateIds = [...fused.keys()];

  // Structured constraints as hard filters, not a ranking boost: a
  // near-miss on the wrong network/asset/price is excluded outright, not
  // merely ranked lower. Network is already a SQL WHERE clause on the
  // lexical arm; re-applied here too so a dense-only match on the wrong
  // network is also excluded, not just ranked-down.
  candidateIds = candidateIds.filter((id) => {
    const row = rowById.get(id);
    if (!row) return false;
    const accepts = (row.accepts as Array<Record<string, unknown>>) ?? [];
    if (constraints.network && !accepts.some((a) => a.network === constraints.network)) return false;
    if (constraints.asset && !accepts.some((a) => matchesAsset(a.asset, constraints.asset!))) return false;
    if (constraints.maxAmount && !accepts.some((a) => withinMaxAmount(a.amount, constraints.maxAmount!))) {
      return false;
    }
    return true;
  });

  const rankables: SettlementRankable[] = candidateIds.map((id) => {
    const row = rowById.get(id)!;
    return {
      resourceId: id,
      settlementCount: Number(row.settlement_count ?? 0),
      lastUpdated: row.last_updated as string,
    };
  });
  const filteredFused = new Map([...fused].filter(([id]) => candidateIds.includes(id)));
  const ordered = orderByFusedScoreThenSettlementHistory(filteredFused, rankables);

  const total = ordered.length;
  const page = ordered.slice(opts.offset, opts.offset + opts.limit).map((id) => toWire(rowById.get(id)!));

  return { items: page, total, partialResults };
}

function matchesAsset(value: unknown, asset: string): boolean {
  if (typeof value !== 'string') return false;
  if (asset === 'native') return value.toLowerCase() === 'native';
  return value.toLowerCase() === asset.toLowerCase();
}

function withinMaxAmount(value: unknown, maxAmount: string): boolean {
  const amount = Number(value);
  const max = Number(maxAmount);
  if (!Number.isFinite(amount) || !Number.isFinite(max)) return true; // can't compare, don't wrongly exclude
  return amount <= max;
}

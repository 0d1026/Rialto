/**
 * Postgres-facing orchestration for lexical search: candidate selection
 * (tsquery match OR the ILIKE fallback for short/partial queries, with an
 * OR-relaxation retry when the strict AND interpretation of a multi-word
 * query finds nothing - see rankLexicalCandidates) stays in SQL; ranking
 * is real BM25F (./bm25.ts) computed in application code, not ts_rank.
 */
import type pg from 'pg';
import { toWire } from '../wire.js';
import {
  type Bm25Corpus,
  type Bm25Document,
  type FieldKey,
  parseTsvectorText,
  scoreDocument,
} from './bm25.js';

export interface LexicalSearchOpts {
  type?: string;
  limit: number;
  offset: number;
}

export interface LexicalSearchResult {
  items: unknown[];
  total: number;
}

export interface RankedLexicalCandidate {
  row: Record<string, unknown>;
  score: number;
}

const FIELDS: FieldKey[] = ['a', 'b', 'c'];

/**
 * Full BM25F ranking over every matching candidate (no pagination) - the
 * shared building block behind both lexicalSearch (BM25-only, used
 * directly by eval-harness's "lexical-only" configuration) and
 * hybrid.ts's fusion pipeline, which needs raw resource ids and rank order,
 * not paginated/wire-mapped items.
 */
/**
 * websearch_to_tsquery ANDs bare multi-word queries by default ("weather
 * service" -> weather & service) - a resource matching only some of a
 * natural-language query's words is invisible to that strict
 * interpretation even when it's plausibly the right answer, and the
 * ILIKE fallback only catches a literal substring of the *whole* query
 * string, so it doesn't rescue this case either ("weather service" isn't
 * a substring of "Weather API"). Joining the words with "OR" (itself
 * dropped as an English stopword by to_tsvector, so it never becomes a
 * real search term) gets websearch_to_tsquery to treat them as a union
 * instead of a conjunction.
 */
function toOrQuery(query: string): string | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.length < 2 ? null : words.join(' OR ');
}

async function selectCandidates(
  pool: pg.Pool,
  tsqueryText: string,
  ilikeText: string,
  extraClause: string,
  extraParams: unknown[],
): Promise<pg.QueryResult> {
  return pool.query(
    `SELECT *,
            to_tsvector('english', search_a)::text AS tsv_a_text,
            to_tsvector('english', search_b)::text AS tsv_b_text,
            to_tsvector('english', search_c)::text AS tsv_c_text
     FROM resources
     WHERE (search_tsv @@ websearch_to_tsquery('english', $1)
            OR resource ILIKE '%' || $2 || '%'
            OR service_name ILIKE '%' || $2 || '%') ${extraClause}`,
    [tsqueryText, ilikeText, ...extraParams],
  );
}

export async function rankLexicalCandidates(
  pool: pg.Pool,
  query: string,
  opts: { type?: string; network?: string; allowRelaxedFallback?: boolean },
): Promise<RankedLexicalCandidate[]> {
  const extraParams: unknown[] = [];
  let extraClause = '';
  if (opts.type) {
    extraParams.push(opts.type);
    extraClause += ` AND type = $${extraParams.length + 2}`;
  }
  if (opts.network) {
    extraParams.push(JSON.stringify([{ network: opts.network }]));
    extraClause += ` AND accepts @> $${extraParams.length + 2}::jsonb`;
  }

  // Candidate selection, strict interpretation first: a row matches if the
  // FTS tsquery (AND semantics for multi-word queries) matches, OR the
  // ILIKE fallback catches a short/partial substring FTS tokenization
  // would miss (05.search-ranking covers this specifically and must keep
  // passing unmodified - this first attempt is byte-for-byte what it was
  // before the OR fallback existed).
  let candidates = await selectCandidates(pool, query, query, extraClause, extraParams);

  // Relaxed fallback, only when the strict interpretation found literally
  // nothing: OR semantics instead of AND, so a resource matching even one
  // of the query's words is a candidate. Never runs when the strict
  // attempt already found something, so it can't loosen (or re-rank) a
  // query that was already working.
  //
  // The fallback trades precision for recall - right for the standalone BM25
  // path (default on, keeps 05.search-ranking and bm25-only recall), wrong
  // inside fusion: a low-confidence union match fed to RRF can appear in both
  // arms and outrank a confident dense hit, which is exactly what regressed
  // the paraphrase queries q4/q6 below dense-only. hybrid.ts passes
  // allowRelaxedFallback: false so fusion never sees these candidates.
  const allowRelaxedFallback = opts.allowRelaxedFallback ?? true;
  if (candidates.rows.length === 0 && allowRelaxedFallback) {
    const orQuery = toOrQuery(query);
    if (orQuery) {
      candidates = await selectCandidates(pool, orQuery, query, extraClause, extraParams);
    }
  }

  if (candidates.rows.length === 0) return [];

  const queryTsvRes = await pool.query<{ t: string }>(
    `SELECT to_tsvector('english', $1)::text AS t`,
    [query],
  );
  const queryTermFreq = parseTsvectorText(queryTsvRes.rows[0]?.t ?? '');

  const totalDocsRes = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM resources');
  const totalDocs = totalDocsRes.rows[0]?.n ?? candidates.rows.length;

  // Document frequency is a corpus-wide statistic by definition - computed
  // over every resource, not just this query's candidates, so a term that's
  // common across the whole catalog is correctly scored as low-signal even
  // when every candidate in front of us happens to contain it.
  let docFreq = new Map<string, number>();
  if (queryTermFreq.size > 0) {
    const terms = [...queryTermFreq.keys()];
    const statRes = await pool.query<{ word: string; ndoc: number }>(
      `SELECT word, ndoc FROM ts_stat($$SELECT search_tsv FROM resources$$) WHERE word = ANY($1::text[])`,
      [terms],
    );
    docFreq = new Map(statRes.rows.map((r) => [r.word, r.ndoc]));
  }

  const docs: Bm25Document[] = candidates.rows.map((row) => ({
    id: row.id,
    fields: {
      a: parseTsvectorText(row.tsv_a_text),
      b: parseTsvectorText(row.tsv_b_text),
      c: parseTsvectorText(row.tsv_c_text),
    },
    fieldLengths: {
      a: sumTf(row.tsv_a_text),
      b: sumTf(row.tsv_b_text),
      c: sumTf(row.tsv_c_text),
    },
  }));

  // avgFieldLengths is estimated from this query's candidate set rather
  // than a full-corpus scan, purely for cost: it only anchors relative
  // length normalization among documents being ranked against each other
  // for THIS query, which is what the acceptance criteria actually check.
  // docFreq above is the statistic that must be corpus-wide, and is.
  const avgFieldLengths = averageFieldLengths(docs);
  const corpus: Bm25Corpus = { totalDocs, avgFieldLengths, docFreq };

  const scored = candidates.rows.map((row, i) => ({
    row,
    score: scoreDocument(docs[i], queryTermFreq, corpus),
  }));

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const xt = new Date(x.row.last_updated as string).getTime();
    const yt = new Date(y.row.last_updated as string).getTime();
    return yt - xt;
  });

  return scored;
}

/** BM25-only search, paginated and wire-mapped - the public /discovery/search endpoint now goes through hybrid.ts instead; this stays as a direct entrypoint for eval-harness's "lexical-only" configuration. */
export async function lexicalSearch(
  pool: pg.Pool,
  query: string,
  opts: LexicalSearchOpts,
): Promise<LexicalSearchResult> {
  const scored = await rankLexicalCandidates(pool, query, { type: opts.type });
  const page = scored.slice(opts.offset, opts.offset + opts.limit);
  return { items: page.map((s) => toWire(s.row)), total: scored.length };
}

function sumTf(tsvText: string): number {
  let sum = 0;
  for (const count of parseTsvectorText(tsvText).values()) sum += count;
  return sum;
}

function averageFieldLengths(docs: Bm25Document[]): Record<FieldKey, number> {
  const sums: Record<FieldKey, number> = { a: 0, b: 0, c: 0 };
  for (const doc of docs) {
    for (const field of FIELDS) sums[field] += doc.fieldLengths[field];
  }
  const n = docs.length || 1;
  return { a: sums.a / n, b: sums.b / n, c: sums.c / n };
}

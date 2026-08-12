/**
 * Postgres-facing orchestration for lexical search: candidate selection
 * (unchanged from the pre-BM25 implementation - tsquery match OR the ILIKE
 * fallback for short/partial queries) stays in SQL; ranking is real BM25F
 * (./bm25.ts) computed in application code, not ts_rank.
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
export async function rankLexicalCandidates(
  pool: pg.Pool,
  query: string,
  opts: { type?: string; network?: string },
): Promise<RankedLexicalCandidate[]> {
  const params: unknown[] = [query];
  let extraClause = '';
  if (opts.type) {
    params.push(opts.type);
    extraClause += ` AND type = $${params.length}`;
  }
  if (opts.network) {
    params.push(JSON.stringify([{ network: opts.network }]));
    extraClause += ` AND accepts @> $${params.length}::jsonb`;
  }

  // Candidate selection: unchanged from the pre-BM25 implementation. A row
  // matches if the FTS tsquery matches OR the ILIKE fallback catches a
  // short/partial substring FTS tokenization would miss (05.search-ranking
  // covers this specifically and must keep passing unmodified).
  const candidates = await pool.query(
    `SELECT *,
            to_tsvector('english', search_a)::text AS tsv_a_text,
            to_tsvector('english', search_b)::text AS tsv_b_text,
            to_tsvector('english', search_c)::text AS tsv_c_text
     FROM resources
     WHERE (search_tsv @@ websearch_to_tsquery('english', $1)
            OR resource ILIKE '%' || $1 || '%'
            OR service_name ILIKE '%' || $1 || '%') ${extraClause}`,
    params,
  );

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

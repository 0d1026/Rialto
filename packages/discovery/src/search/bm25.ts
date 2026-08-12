/**
 * Real BM25(F) scoring - not Postgres's ts_rank/ts_rank_cd. Postgres's
 * 'english' tsvector dictionary still does tokenization and stemming (that
 * part is genuinely hard to get right and not worth reimplementing); this
 * module owns the actual relevance math on top of it, so k1/b/field-weights
 * are named, tunable constants instead of ts_rank's opaque internal
 * weighting curve.
 *
 * Everything in this file is pure (no DB, no I/O) so it's directly
 * unit-testable against synthetic term-frequency/IDF fixtures - see
 * test/unit/10.bm25-ranking.spec.ts. The Postgres-facing orchestration
 * (fetching candidates, tokenizing via to_tsvector, computing corpus
 * document frequency via ts_stat) lives in ./lexical.ts.
 */

/**
 * Term-frequency saturation point (standard BM25 k1). Higher k1 lets a
 * repeated term keep adding score for longer before diminishing returns
 * kick in; 1.2 is Robertson et al.'s standard default. Not corpus-tuned -
 * packages/eval-harness (stage 4) is what would justify moving this off
 * the default.
 */
export const BM25_K1 = 1.2;

/**
 * Length-normalization strength (standard BM25 b), 0 to 1. 0 ignores
 * document length entirely; 1 fully normalizes by it, so a short field
 * matching a term scores higher than a long one repeating it just as often
 * per-word. 0.75 is the standard default.
 */
export const BM25_B = 0.75;

/**
 * Per-field importance (BM25F, Robertson/Zaragoza/Taylor 2004): a term
 * match in serviceName/tags (field "a") counts for more than the same term
 * appearing only in the description ("b"), which counts for more than a
 * match only in the raw resource URL ("c"). Chosen to make the ordering
 * obviously correct without over-fitting to a query set that doesn't exist
 * yet - eval-harness stage 4 is what would justify retuning these.
 */
export const FIELD_WEIGHTS = { a: 3, b: 1, c: 0.5 } as const;

export type FieldKey = keyof typeof FIELD_WEIGHTS;
const FIELDS: FieldKey[] = ['a', 'b', 'c'];

export interface Bm25Document {
  id: string | number;
  /** lexeme -> term frequency, one map per weighted field */
  fields: Record<FieldKey, Map<string, number>>;
  /** total lexeme occurrences per field, for length normalization */
  fieldLengths: Record<FieldKey, number>;
}

export interface Bm25Corpus {
  totalDocs: number;
  avgFieldLengths: Record<FieldKey, number>;
  /** document frequency per query lexeme, across the whole corpus */
  docFreq: Map<string, number>;
}

/**
 * Standard Robertson/Sparck-Jones IDF, floored at a small positive epsilon
 * so a term appearing in (almost) every document contributes a near-zero
 * weight rather than going negative and actively penalizing a match.
 */
export function idf(docFreq: number, totalDocs: number): number {
  const raw = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  return Math.max(raw, 1e-9);
}

/** BM25F score for one document against query lexemes and their query-side term frequency. */
export function scoreDocument(
  doc: Bm25Document,
  queryTermFreq: Map<string, number>,
  corpus: Bm25Corpus,
): number {
  let score = 0;
  for (const [term, qtf] of queryTermFreq) {
    const df = corpus.docFreq.get(term) ?? 0;
    if (df === 0) continue; // term never appears in the corpus, no signal to give

    let combinedTf = 0;
    for (const field of FIELDS) {
      const tf = doc.fields[field].get(term) ?? 0;
      if (tf === 0) continue;
      const len = doc.fieldLengths[field];
      const avgLen = corpus.avgFieldLengths[field] || 1;
      const normalizedTf = tf / (1 - BM25_B + BM25_B * (len / avgLen));
      combinedTf += FIELD_WEIGHTS[field] * normalizedTf;
    }
    if (combinedTf === 0) continue;

    const weight = idf(df, corpus.totalDocs);
    const saturated = (combinedTf * (BM25_K1 + 1)) / (combinedTf + BM25_K1);
    score += weight * saturated * qtf;
  }
  return score;
}

/**
 * Parses Postgres's `tsvector::text` rendering, e.g. `'cat':1 'dog':2,4`,
 * into a lexeme -> term-frequency map (frequency = position-list length).
 * Handles the escaped-quote form tsvector uses for lexemes containing `'`.
 */
export function parseTsvectorText(text: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!text) return out;
  const re = /'((?:[^'\\]|\\.)*)':((?:\d+,?)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lexeme = m[1].replace(/\\(.)/g, '$1');
    const positions = m[2].split(',').filter(Boolean).length;
    out.set(lexeme, (out.get(lexeme) ?? 0) + positions);
  }
  return out;
}

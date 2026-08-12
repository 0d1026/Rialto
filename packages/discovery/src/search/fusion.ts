/**
 * Reciprocal rank fusion (RRF): combines multiple ranked candidate lists by
 * RANK POSITION only. The input type is deliberately `number[][]` (arrays
 * of resource ids already in rank order) - there is nowhere in this
 * function's signature to pass a BM25 score or a cosine distance, so the
 * "never compare a raw score to a raw distance" rule from the stage 3 spec
 * is enforced by the type, not just by convention.
 */

/** Standard literature default (Cormack, Clarke & Buettcher 2009). Not corpus-tuned - eval-harness (stage 4) is what would justify moving it. */
export const RRF_K = 60;

/**
 * Each element of `rankedLists` is one ranker's candidate ids, best match
 * first. A ranker that doesn't include a given id contributes nothing for
 * it (not a penalty) - this is what makes fusion degrade gracefully to a
 * single ranker's own order when another ranker is empty/unavailable.
 */
export function reciprocalRankFusion(rankedLists: number[][]): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of rankedLists) {
    list.forEach((resourceId, index) => {
      const rank = index + 1;
      const contribution = 1 / (RRF_K + rank);
      scores.set(resourceId, (scores.get(resourceId) ?? 0) + contribution);
    });
  }
  return scores;
}

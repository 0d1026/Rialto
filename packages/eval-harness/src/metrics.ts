/**
 * Standard IR metrics against the graded judgment set (fixtures/judgments.ts).
 * A resource with no judgment entry for a given query is treated as grade 0
 * (not relevant) - see judgments.ts's header for why that's a real judgment
 * here, not an unjudged gap, at this catalog's size.
 */
import type { Judgment } from './fixtures/judgments.js';

export type RankedList = string[]; // resource URLs, best match first

function gradeOf(judgments: Record<string, Judgment>, resource: string): number {
  return judgments[resource] ?? 0;
}

/** Reciprocal rank of the first result with grade >= 1. 0 if none in the list. */
export function reciprocalRank(ranked: RankedList, judgments: Record<string, Judgment>): number {
  for (let i = 0; i < ranked.length; i++) {
    if (gradeOf(judgments, ranked[i]) >= 1) return 1 / (i + 1);
  }
  return 0;
}

/** (# relevant results in the top `k`) / (total # relevant results for this query). 1.0 if the query has no relevant results at all (nothing to recall). */
export function recallAtK(ranked: RankedList, judgments: Record<string, Judgment>, k: number): number {
  const totalRelevant = Object.values(judgments).filter((g) => g >= 1).length;
  if (totalRelevant === 0) return 1;
  const topK = ranked.slice(0, k);
  const found = topK.filter((r) => gradeOf(judgments, r) >= 1).length;
  return found / totalRelevant;
}

/** Standard DCG@k with graded relevance: sum (2^rel - 1) / log2(i + 2), i zero-indexed. */
function dcgAtK(grades: number[], k: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(k, grades.length); i++) {
    sum += (2 ** grades[i] - 1) / Math.log2(i + 2);
  }
  return sum;
}

/** nDCG@k = DCG@k / IDCG@k (DCG of the ideal ordering, i.e. grades sorted descending). 1.0 if IDCG is 0 (no relevant results to rank at all). */
export function ndcgAtK(ranked: RankedList, judgments: Record<string, Judgment>, k: number): number {
  const grades = ranked.map((r) => gradeOf(judgments, r));
  const dcg = dcgAtK(grades, k);
  const idealGrades = Object.values(judgments)
    .filter((g) => g >= 1)
    .sort((a, b) => b - a);
  const idcg = dcgAtK(idealGrades, k);
  if (idcg === 0) return 1;
  return dcg / idcg;
}

export interface QueryMetrics {
  queryId: string;
  ndcgAt10: number;
  reciprocalRank: number;
  recallAt20: number;
}

export interface AggregateMetrics {
  ndcgAt10: number;
  mrr: number;
  recallAt20: number;
  perQuery: QueryMetrics[];
}

export function scoreConfiguration(
  results: Record<string, RankedList>,
  judgmentsByQuery: Record<string, Record<string, Judgment>>,
): AggregateMetrics {
  const perQuery: QueryMetrics[] = [];
  for (const queryId of Object.keys(judgmentsByQuery)) {
    const ranked = results[queryId] ?? [];
    const judgments = judgmentsByQuery[queryId];
    perQuery.push({
      queryId,
      ndcgAt10: ndcgAtK(ranked, judgments, 10),
      reciprocalRank: reciprocalRank(ranked, judgments),
      recallAt20: recallAtK(ranked, judgments, 20),
    });
  }
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  return {
    ndcgAt10: mean(perQuery.map((q) => q.ndcgAt10)),
    mrr: mean(perQuery.map((q) => q.reciprocalRank)),
    recallAt20: mean(perQuery.map((q) => q.recallAt20)),
    perQuery,
  };
}

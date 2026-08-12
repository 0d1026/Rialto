import { describe, expect, it } from 'vitest';
import { ndcgAtK, reciprocalRank, recallAtK } from '../src/metrics.js';

/** Known-answer tests for the metrics themselves - these numbers are the load-bearing claim, so the math must be independently verifiable. */
describe('metrics: known-answer cases', () => {
  const judgments = { a: 3, b: 1, c: 0 } as const;

  it('ndcgAtK is 1.0 for the ideal ordering', () => {
    expect(ndcgAtK(['a', 'b', 'c'], judgments, 10)).toBeCloseTo(1);
  });

  it('ndcgAtK is less than 1.0 when the best result is not ranked first', () => {
    const score = ndcgAtK(['b', 'a', 'c'], judgments, 10);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0);
  });

  it('ndcgAtK is 1.0 (by convention) when the query has no relevant results at all', () => {
    expect(ndcgAtK(['x', 'y'], {}, 10)).toBe(1);
  });

  it('reciprocalRank is 1 when the first result is relevant', () => {
    expect(reciprocalRank(['a', 'z'], judgments)).toBe(1);
  });

  it('reciprocalRank is 1/3 when the first relevant result is third', () => {
    expect(reciprocalRank(['z', 'y', 'a'], judgments)).toBeCloseTo(1 / 3);
  });

  it('reciprocalRank is 0 when nothing relevant appears', () => {
    expect(reciprocalRank(['z', 'y'], judgments)).toBe(0);
  });

  it('recallAtK finds all relevant results within k', () => {
    expect(recallAtK(['a', 'b', 'z'], judgments, 20)).toBe(1);
  });

  it('recallAtK is partial when only some relevant results are within k', () => {
    expect(recallAtK(['a', 'z', 'y'], judgments, 20)).toBeCloseTo(0.5); // found 'a', missed 'b'
  });

  it('recallAtK only counts results within the first k positions', () => {
    expect(recallAtK(['z', 'y', 'a'], judgments, 1)).toBe(0); // 'a' is at position 3, k=1
  });
});

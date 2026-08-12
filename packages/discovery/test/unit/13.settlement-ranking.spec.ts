import { describe, expect, it } from 'vitest';
import { orderByFusedScoreThenSettlementHistory, type SettlementRankable } from '../../src/search/ranking.js';

/**
 * Stage 3: settlement-history ranking is a tiebreak applied AFTER fusion,
 * not a ranking signal in its own right - it only decides between
 * resources fusion couldn't already distinguish.
 */
describe('orderByFusedScoreThenSettlementHistory', () => {
  it('two resources with equal fused rank are ordered by settlement_count, higher first', () => {
    const fused = new Map([
      [1, 0.5],
      [2, 0.5], // same fused score as id 1 - a genuine tie
    ]);
    const resources: SettlementRankable[] = [
      { resourceId: 1, settlementCount: 3, lastUpdated: '2026-01-01T00:00:00Z' },
      { resourceId: 2, settlementCount: 9, lastUpdated: '2026-01-01T00:00:00Z' },
    ];
    const ordered = orderByFusedScoreThenSettlementHistory(fused, resources);
    expect(ordered).toEqual([2, 1]);
  });

  it('when fused score AND settlement_count are both tied, more recent last_updated wins', () => {
    const fused = new Map([
      [1, 0.5],
      [2, 0.5],
    ]);
    const resources: SettlementRankable[] = [
      { resourceId: 1, settlementCount: 5, lastUpdated: '2026-01-01T00:00:00Z' },
      { resourceId: 2, settlementCount: 5, lastUpdated: '2026-06-01T00:00:00Z' },
    ];
    const ordered = orderByFusedScoreThenSettlementHistory(fused, resources);
    expect(ordered).toEqual([2, 1]);
  });

  it('a genuinely higher fused score always wins - settlement history never overrides real relevance difference', () => {
    const fused = new Map([
      [1, 0.9], // clearly more relevant by fusion
      [2, 0.1],
    ]);
    const resources: SettlementRankable[] = [
      // id 2 has a much stronger settlement history, but must still lose -
      // this is a tiebreak, not an override.
      { resourceId: 1, settlementCount: 1, lastUpdated: '2020-01-01T00:00:00Z' },
      { resourceId: 2, settlementCount: 500, lastUpdated: '2026-06-01T00:00:00Z' },
    ];
    const ordered = orderByFusedScoreThenSettlementHistory(fused, resources);
    expect(ordered).toEqual([1, 2]);
  });
});

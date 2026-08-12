/**
 * Settlement-history ranking: applied AFTER fusion, as a tiebreak only.
 * Two resources with genuinely different fused rank keep that order - this
 * never overrides real relevance signal, it only decides between resources
 * fusion itself couldn't distinguish.
 */
export interface SettlementRankable {
  resourceId: number;
  settlementCount: number;
  lastUpdated: string | Date;
}

export function orderByFusedScoreThenSettlementHistory(
  fusedScores: Map<number, number>,
  resources: SettlementRankable[],
): number[] {
  const byId = new Map(resources.map((r) => [r.resourceId, r]));
  const ids = [...fusedScores.keys()];

  ids.sort((a, b) => {
    const scoreA = fusedScores.get(a) ?? 0;
    const scoreB = fusedScores.get(b) ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    const ra = byId.get(a);
    const rb = byId.get(b);
    const countA = ra?.settlementCount ?? 0;
    const countB = rb?.settlementCount ?? 0;
    if (countA !== countB) return countB - countA;

    const updatedA = ra ? new Date(ra.lastUpdated).getTime() : 0;
    const updatedB = rb ? new Date(rb.lastUpdated).getTime() : 0;
    return updatedB - updatedA;
  });

  return ids;
}

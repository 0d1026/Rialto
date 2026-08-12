/** Structural request validation - shape checks before anything touches the chain. */

export function validatePaymentPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'paymentPayload must be an object';
  const p = payload as Record<string, unknown>;
  if (p.x402Version !== 2) return 'paymentPayload.x402Version must be 2';
  if (!p.payload || typeof p.payload !== 'object') return 'paymentPayload.payload missing';
  if (!p.accepted || typeof p.accepted !== 'object') return 'paymentPayload.accepted missing';
  return null;
}

export function validatePaymentRequirements(requirements: unknown): string | null {
  if (!requirements || typeof requirements !== 'object') {
    return 'paymentRequirements must be an object';
  }
  const r = requirements as Record<string, unknown>;
  if (typeof r.scheme !== 'string' || r.scheme.length === 0) {
    return 'paymentRequirements.scheme missing';
  }
  if (typeof r.network !== 'string' || r.network.length === 0) {
    return 'paymentRequirements.network missing';
  }
  if (typeof r.payTo !== 'string' || r.payTo.length === 0) {
    return 'paymentRequirements.payTo missing';
  }
  if (typeof r.amount !== 'string' || r.amount.length === 0) {
    return 'paymentRequirements.amount missing';
  }
  return null;
}

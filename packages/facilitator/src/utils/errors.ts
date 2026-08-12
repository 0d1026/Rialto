import type { CodedError, ErrorCode } from '@rialto/shared';

/**
 * Every rejection this service emits carries a shared error code plus a
 * specific reason - the fix for the ambiguous `unexpected_verify_error` we
 * hit in the wild: an agent must be able to tell "my payment is bad" from
 * "try again later".
 */
export function codedError(code: ErrorCode, reason: string): { error: CodedError } {
  return { error: { code, reason } };
}

/** Classify a thrown error from the chain/library into a shared code. */
export function classifyUpstreamError(err: unknown): CodedError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('timeout')
  ) {
    return { code: 'upstream_unreachable', reason: `Stellar RPC unreachable: ${msg}` };
  }
  if (lower.includes('expired') || lower.includes('expiration')) {
    return { code: 'expired', reason: msg };
  }
  if (lower.includes('trustline')) {
    return { code: 'trustline_missing', reason: msg };
  }
  if (lower.includes('balance') || lower.includes('underfunded')) {
    return { code: 'insufficient_balance', reason: msg };
  }
  if (lower.includes('simulat')) {
    return { code: 'simulation_failed', reason: msg };
  }
  return { code: 'simulation_failed', reason: msg };
}

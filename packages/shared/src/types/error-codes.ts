/**
 * Shared, named rejection reasons - every layer uses one of these, never a
 * free-text message alone. Add by team agreement only.
 */
export const ERROR_CODES = [
  'payload_invalid',
  'expired',
  'simulation_failed',
  'upstream_unreachable',
  'insufficient_balance',
  'trustline_missing',
  'replay_detected',
  'metadata_invalid',
  'route_template_invalid',
  'scheme_unsupported',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CodedError {
  code: ErrorCode;
  /** Specific, human-readable detail - never null, never empty. */
  reason: string;
}

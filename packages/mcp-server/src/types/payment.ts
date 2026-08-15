/**
 * Discriminated union over @x402/core's `PaymentRequirements`, which itself
 * leaves `extra` as an untyped `Record<string, unknown>` (scheme-specific by
 * design). Narrowing it here on `scheme` means a resource server sending
 * `upto`'s `extra` fields under `scheme: "exact"` is a type error at the
 * point paid_call consumes this, not a silent pass-through.
 */

export interface PaymentRequirementsBase {
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
}

export interface ExactPaymentRequirements extends PaymentRequirementsBase {
  scheme: "exact";
  extra?: Record<string, unknown>;
}

/** docs/scheme_upto_stellar.md: settlementContract + areFeesSponsored are the only defined `extra` keys. */
export interface UptoPaymentRequirements extends PaymentRequirementsBase {
  scheme: "upto";
  extra?: {
    settlementContract?: string;
    areFeesSponsored?: boolean;
    [key: string]: unknown;
  };
}

export type PaymentRequirements = ExactPaymentRequirements | UptoPaymentRequirements;

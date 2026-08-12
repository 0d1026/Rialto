import type { PaymentRequirements, SettleResponse } from "@x402/core/types";

/**
 * What an agent gets back to prove a payment happened. Shaping only -
 * `verified` stays `false` here; confirming this transaction actually
 */
export interface SettlementReceipt {
  transaction: string;
  network: string;
  payer?: string;
  scheme: string;
  asset: string;
  amount: string;
  payTo: string;
  resource: string;
  settledAt: string;
  verified: false;
}

/**
 * FacilitatorClient.settle() already throws on `!success`, so a
 * SettleResponse reaching here is guaranteed successful - this just shapes
 * it, no RPC calls, no validation.
 */
export function buildReceipt(
  settleResponse: SettleResponse,
  paymentRequirements: PaymentRequirements,
  resource: string
): SettlementReceipt {
  return {
    transaction: settleResponse.transaction,
    network: settleResponse.network,
    ...(settleResponse.payer !== undefined ? { payer: settleResponse.payer } : {}),
    scheme: paymentRequirements.scheme,
    asset: paymentRequirements.asset,
    // Actual settled amount when the facilitator reports one (schemes like
    // `upto` settle for less than the authorized ceiling); otherwise the
    // requirements' amount is exact by definition of the `exact` scheme.
    amount: settleResponse.amount ?? paymentRequirements.amount,
    payTo: paymentRequirements.payTo,
    resource,
    settledAt: new Date().toISOString(),
    verified: false,
  };
}

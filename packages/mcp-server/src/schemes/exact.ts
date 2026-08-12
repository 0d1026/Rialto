/**
 * The exact scheme, buyer side - wraps @x402/stellar's client implementation.
 * We compose the canonical package, same as packages/facilitator/src/schemes/exact.ts
 * does for the facilitator side; we do not reimplement Stellar transaction signing.
 *
 * Takes a Signer, never a Config or raw key: this module (and schemes/upto.ts
 * once it exists) is written against src/payment/signer.ts's interface, so a
 * wallet-backed signer swaps in later without touching this file - see
 * docs/decisions/0003-signer-boundary.md.
 */

import { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { PaymentPayload, PaymentRequirements, ResourceInfo } from "@x402/core/types";
import type { Signer } from "../payment/signer.js";

export function createExactSchemeClient(signer: Signer): ExactStellarScheme {
  return new ExactStellarScheme(signer);
}

/**
 * Signs `requirements` and assembles the full PaymentPayload the facilitator's
 * /verify and the resource's authenticated retry both expect - the scheme
 * itself only returns the `{x402Version, payload}` slice (the signed part);
 * `accepted`/`resource` are protocol envelope fields the caller supplies.
 */
export async function buildExactPaymentPayload(
  scheme: ExactStellarScheme,
  x402Version: number,
  requirements: PaymentRequirements,
  resource: ResourceInfo
): Promise<PaymentPayload> {
  const signed = await scheme.createPaymentPayload(x402Version, requirements);
  return {
    x402Version: signed.x402Version,
    payload: signed.payload,
    accepted: requirements,
    resource,
  };
}

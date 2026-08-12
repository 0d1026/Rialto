import type { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { FacilitatorClient } from "../clients/facilitator-client.js";
import type {
  ResourceCallInit,
  ResourceClient,
} from "../clients/resource-client.js";
import { ErrorCode } from "../errors/codes.js";
import { McpToolError } from "../errors/mcp-tool-error.js";
import { buildExactPaymentPayload } from "../schemes/exact.js";
import { selectPaymentRequirements } from "./select-payment-requirements.js";
import { buildReceipt, type SettlementReceipt } from "./receipt.js";

/**
 * The orchestrating state machine: discover -> pay -> retry -> settle. Zero
 * network calls of its own - every I/O step goes through resourceClient or
 * facilitatorClient, which is what makes this unit-testable against mocked
 * collaborators instead of a wire.
 */
export interface PaymentFlowDeps {
  resourceClient: Pick<ResourceClient, "requestResource" | "retryWithPayment">;
  facilitatorClient: Pick<FacilitatorClient, "getSupported" | "verify" | "settle">;
  exactScheme: ExactStellarScheme;
}

export interface PaidCallParams {
  url: string;
  init: ResourceCallInit;
}

export interface PaidCallResult {
  status: number;
  body: unknown;
  receipt: SettlementReceipt;
}

export async function runPaymentFlow(
  deps: PaymentFlowDeps,
  params: PaidCallParams
): Promise<PaidCallResult> {
  const initial = await deps.resourceClient.requestResource(params.url, params.init);

  if (initial.kind !== "payment_required") {
    throw new McpToolError(
      ErrorCode.SELLER_DID_NOT_REQUEST_PAYMENT,
      `seller responded ${initial.status} without requesting payment - nothing to pay for`
    );
  }

  const supported = await deps.facilitatorClient.getSupported();
  const requirements = selectPaymentRequirements(initial.paymentRequired.accepts, supported);

  if (requirements.scheme !== "exact") {
    // selectPaymentRequirements only ever returns "exact" today (the sole
    // entry in its IMPLEMENTED_SCHEMES set) - reaching here on a different
    // scheme means that invariant broke, not a live protocol failure. `upto`
    // gets its own branch here once schemes/upto.ts exists.
    throw new McpToolError(
      ErrorCode.INTERNAL_ERROR,
      `no payload builder wired for scheme "${requirements.scheme}"`
    );
  }

  const paymentPayload = await buildExactPaymentPayload(
    deps.exactScheme,
    initial.paymentRequired.x402Version,
    requirements,
    initial.paymentRequired.resource
  );

  await deps.facilitatorClient.verify(paymentPayload, requirements);

  const paid = await deps.resourceClient.retryWithPayment(params.url, params.init, paymentPayload);

  const settleResponse = await deps.facilitatorClient.settle(paymentPayload, requirements);
  const receipt = buildReceipt(settleResponse, requirements, params.url);

  return { status: paid.status, body: paid.body, receipt };
}

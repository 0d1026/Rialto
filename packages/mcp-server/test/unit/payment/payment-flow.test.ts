import { describe, expect, it, vi } from "vitest";
import type { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { PaymentRequired, SupportedResponse } from "@x402/core/types";
import { runPaymentFlow, type PaymentFlowDeps } from "../../../src/payment/payment-flow.js";
import { ErrorCode } from "../../../src/errors/codes.js";
import type {
  PaymentRequiredResult,
  UnpaidResourceResult,
} from "../../../src/clients/resource-client.js";

const paymentRequired: PaymentRequired = {
  x402Version: 2,
  resource: { url: "https://weather.example/forecast" },
  accepts: [
    {
      scheme: "exact",
      network: "stellar:testnet",
      asset: "native",
      amount: "1000",
      payTo: "GABC",
      maxTimeoutSeconds: 60,
      extra: {},
    },
  ],
};

const supported: SupportedResponse = {
  kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }],
  extensions: [],
  signers: {},
};

const paymentRequiredResult: PaymentRequiredResult = {
  kind: "payment_required",
  status: 402,
  paymentRequired,
};

const fakeExactScheme = {
  scheme: "exact",
  createPaymentPayload: vi.fn().mockResolvedValue({
    x402Version: 2,
    payload: { transaction: "signed-xdr-stub" },
  }),
} as unknown as ExactStellarScheme;

function makeDeps(overrides: Partial<PaymentFlowDeps> = {}): PaymentFlowDeps {
  return {
    resourceClient: {
      requestResource: vi.fn().mockResolvedValue(paymentRequiredResult),
      retryWithPayment: vi.fn().mockResolvedValue({ status: 200, body: { forecast: "sunny" } }),
    },
    facilitatorClient: {
      getSupported: vi.fn().mockResolvedValue(supported),
      verify: vi.fn().mockResolvedValue({ isValid: true }),
      settle: vi.fn().mockResolvedValue({
        success: true,
        transaction: "tx-abc",
        network: "stellar:testnet",
      }),
    },
    exactScheme: fakeExactScheme,
    ...overrides,
  };
}

describe("runPaymentFlow", () => {
  it("happy path: discover, pay, retry, settle, receipt", async () => {
    const deps = makeDeps();

    const result = await runPaymentFlow(deps, {
      url: "https://weather.example/forecast",
      init: { method: "GET" },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ forecast: "sunny" });
    expect(result.receipt).toMatchObject({
      transaction: "tx-abc",
      network: "stellar:testnet",
      scheme: "exact",
      payTo: "GABC",
      amount: "1000",
      verified: false,
    });

    expect(deps.resourceClient.retryWithPayment).toHaveBeenCalledWith(
      "https://weather.example/forecast",
      { method: "GET" },
      expect.objectContaining({ x402Version: 2 })
    );
  });

  it("seller doesn't request payment: throws SELLER_DID_NOT_REQUEST_PAYMENT without calling the facilitator", async () => {
    const unpaid: UnpaidResourceResult = { kind: "unpaid", status: 200, body: { forecast: "free" } };
    const deps = makeDeps({
      resourceClient: {
        requestResource: vi.fn().mockResolvedValue(unpaid),
        retryWithPayment: vi.fn(),
      },
    });

    await expect(
      runPaymentFlow(deps, { url: "https://weather.example/forecast", init: { method: "GET" } })
    ).rejects.toMatchObject({ code: ErrorCode.SELLER_DID_NOT_REQUEST_PAYMENT });

    expect(deps.facilitatorClient.getSupported).not.toHaveBeenCalled();
  });

  it("no acceptable payment option: throws before ever building or verifying a payload", async () => {
    const deps = makeDeps({
      facilitatorClient: {
        getSupported: vi.fn().mockResolvedValue({
          kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:pubnet" }],
          extensions: [],
          signers: {},
        }),
        verify: vi.fn(),
        settle: vi.fn(),
      },
    });

    await expect(
      runPaymentFlow(deps, { url: "https://weather.example/forecast", init: { method: "GET" } })
    ).rejects.toMatchObject({ code: ErrorCode.NO_ACCEPTABLE_PAYMENT_OPTION });

    expect(deps.facilitatorClient.verify).not.toHaveBeenCalled();
  });

  it("verify rejected: throws FACILITATOR_VERIFY_REJECTED without ever retrying against the seller", async () => {
    const deps = makeDeps({
      facilitatorClient: {
        getSupported: vi.fn().mockResolvedValue(supported),
        verify: vi.fn().mockRejectedValue(
          Object.assign(new Error("insufficient_funds"), { code: ErrorCode.FACILITATOR_VERIFY_REJECTED })
        ),
        settle: vi.fn(),
      },
    });

    await expect(
      runPaymentFlow(deps, { url: "https://weather.example/forecast", init: { method: "GET" } })
    ).rejects.toMatchObject({ code: ErrorCode.FACILITATOR_VERIFY_REJECTED });

    expect(deps.resourceClient.retryWithPayment).not.toHaveBeenCalled();
    expect(deps.facilitatorClient.settle).not.toHaveBeenCalled();
  });

  it("settle failed: the seller already served the resource, but the flow still surfaces the failure", async () => {
    const deps = makeDeps({
      facilitatorClient: {
        getSupported: vi.fn().mockResolvedValue(supported),
        verify: vi.fn().mockResolvedValue({ isValid: true }),
        settle: vi.fn().mockRejectedValue(
          Object.assign(new Error("sequence_number_conflict"), { code: ErrorCode.FACILITATOR_SETTLE_FAILED })
        ),
      },
    });

    await expect(
      runPaymentFlow(deps, { url: "https://weather.example/forecast", init: { method: "GET" } })
    ).rejects.toMatchObject({ code: ErrorCode.FACILITATOR_SETTLE_FAILED });

    expect(deps.resourceClient.retryWithPayment).toHaveBeenCalled();
  });
});

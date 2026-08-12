import { describe, expect, it } from "vitest";
import type { PaymentRequirements, SupportedResponse } from "@x402/core/types";
import { selectPaymentRequirements } from "../../../src/payment/select-payment-requirements.js";
import { ErrorCode } from "../../../src/errors/codes.js";

function requirement(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: "stellar:testnet",
    asset: "native",
    amount: "1000",
    payTo: "GABC",
    maxTimeoutSeconds: 60,
    extra: {},
    ...overrides,
  };
}

function supported(kinds: SupportedResponse["kinds"]): SupportedResponse {
  return { kinds, extensions: [], signers: {} };
}

describe("selectPaymentRequirements", () => {
  it("picks the sole settleable, implementable entry", () => {
    const accepts = [requirement()];
    const result = selectPaymentRequirements(
      accepts,
      supported([{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }])
    );
    expect(result).toEqual(accepts[0]);
  });

  it("prefers exact over upto when both are settleable and implementable", () => {
    const uptoOption = requirement({ scheme: "upto", network: "stellar:testnet" });
    const exactOption = requirement({ scheme: "exact", network: "stellar:testnet" });
    const result = selectPaymentRequirements(
      [uptoOption, exactOption],
      supported([
        { x402Version: 2, scheme: "upto", network: "stellar:testnet" },
        { x402Version: 2, scheme: "exact", network: "stellar:testnet" },
      ])
    );
    expect(result).toBe(exactOption);
  });

  it("filters out entries whose network the facilitator doesn't settle", () => {
    const testnet = requirement({ network: "stellar:testnet" });
    const pubnet = requirement({ network: "stellar:pubnet" });
    const result = selectPaymentRequirements(
      [pubnet, testnet],
      supported([{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }])
    );
    expect(result).toBe(testnet);
  });

  it("throws NO_ACCEPTABLE_PAYMENT_OPTION when nothing matches the facilitator's supported kinds", () => {
    const accepts = [requirement({ network: "stellar:pubnet" })];
    try {
      selectPaymentRequirements(
        accepts,
        supported([{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }])
      );
      expect.unreachable("expected selectPaymentRequirements to throw");
    } catch (err) {
      expect(err).toMatchObject({ code: ErrorCode.NO_ACCEPTABLE_PAYMENT_OPTION });
    }
  });

  it("throws UNSUPPORTED_SCHEME when the facilitator could settle it but this buyer can't sign it", () => {
    const accepts = [requirement({ scheme: "upto" })];
    try {
      selectPaymentRequirements(
        accepts,
        supported([{ x402Version: 2, scheme: "upto", network: "stellar:testnet" }])
      );
      expect.unreachable("expected selectPaymentRequirements to throw");
    } catch (err) {
      expect(err).toMatchObject({ code: ErrorCode.UNSUPPORTED_SCHEME });
    }
  });

  it("distinguishes the two failure modes: facilitator-unsettleable vs buyer-unimplemented", () => {
    // upto is settleable by the facilitator but not implementable by this buyer yet -
    // must be UNSUPPORTED_SCHEME, not NO_ACCEPTABLE_PAYMENT_OPTION.
    const accepts = [requirement({ scheme: "upto", network: "stellar:pubnet" })];
    try {
      selectPaymentRequirements(
        accepts,
        supported([{ x402Version: 2, scheme: "upto", network: "stellar:pubnet" }])
      );
      expect.unreachable("expected selectPaymentRequirements to throw");
    } catch (err) {
      expect(err).toMatchObject({ code: ErrorCode.UNSUPPORTED_SCHEME });
    }
  });
});

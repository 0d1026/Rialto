import { describe, expect, it, vi } from "vitest";
import { createEd25519Signer } from "@x402/stellar";
import type { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { PaymentRequirements, ResourceInfo } from "@x402/core/types";
import { buildExactPaymentPayload, createExactSchemeClient } from "../../../src/schemes/exact.js";

// A syntactically valid, throwaway testnet keypair - never funded, never reused.
const TEST_SECRET = "SAHAC5R564VVHBZKNQIHQAPPI6GIQDYZGKTYZECHTTRSWA67D7NGZJLA";

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "stellar:testnet",
  asset: "native",
  amount: "1000",
  payTo: "GABC",
  maxTimeoutSeconds: 60,
  extra: {},
};

const resourceInfo: ResourceInfo = { url: "https://weather.example/forecast" };

describe("createExactSchemeClient", () => {
  it("builds a client scheme around the given signer", () => {
    const signer = createEd25519Signer(TEST_SECRET, "stellar:testnet");
    const scheme = createExactSchemeClient(signer);
    expect(scheme.scheme).toBe("exact");
  });
});

describe("buildExactPaymentPayload", () => {
  it("assembles the full PaymentPayload envelope around the scheme's signed payload", async () => {
    const fakeScheme = {
      createPaymentPayload: vi.fn().mockResolvedValue({
        x402Version: 2,
        payload: { transaction: "signed-xdr-stub" },
      }),
    } as unknown as ExactStellarScheme;

    const result = await buildExactPaymentPayload(fakeScheme, 2, requirements, resourceInfo);

    expect(fakeScheme.createPaymentPayload).toHaveBeenCalledWith(2, requirements);
    expect(result).toEqual({
      x402Version: 2,
      payload: { transaction: "signed-xdr-stub" },
      accepted: requirements,
      resource: resourceInfo,
    });
  });

});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { ResourceClient } from "../../../src/clients/resource-client.js";
import { ErrorCode } from "../../../src/errors/codes.js";
import type { Config } from "../../../src/config.js";

const config: Config = {
  DISCOVERY_URL: "http://discovery.test",
  FACILITATOR_URL: "http://facilitator.test",
  NETWORK: "stellar:testnet",
  RIALTO_SERVICE_TIMEOUT_MS: 2_000,
  FACILITATOR_SERVICE_TIMEOUT_MS: 20_000,
  SELLER_REQUEST_TIMEOUT_MS: 10_000,
  MCP_TRANSPORT: "stdio",
};

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

describe("ResourceClient.requestResource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns paid:false with the seller's live accepts[] on a 402, decoded from the real PAYMENT-REQUIRED header - not discovery's cache", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired) },
      })
    );

    const client = new ResourceClient(config);
    const result = await client.requestResource("https://weather.example/forecast", { method: "GET" });

    expect(result.kind).toBe("payment_required");
    expect(result.status).toBe(402);
    if (result.kind === "payment_required") {
      expect(result.paymentRequired.accepts).toEqual(paymentRequired.accepts);
    } else {
      throw new Error("expected a 402 PaymentRequiredResult");
    }
  });

  it("throws SELLER_UNREACHABLE on a 402 with no decodable payment-required declaration", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 402 }));

    const client = new ResourceClient(config);
    await expect(
      client.requestResource("https://weather.example/forecast", { method: "GET" })
    ).rejects.toMatchObject({ code: ErrorCode.SELLER_UNREACHABLE });
  });

  it("returns paid:false with status/body as-is when the seller doesn't request payment", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ forecast: "sunny" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const client = new ResourceClient(config);
    const result = await client.requestResource("https://weather.example/forecast", { method: "GET" });

    expect(result).toEqual({ kind: "unpaid", status: 200, body: { forecast: "sunny" } });
  });

  it("throws SELLER_UNREACHABLE when the network request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const client = new ResourceClient(config);
    await expect(
      client.requestResource("https://weather.example/forecast", { method: "GET" })
    ).rejects.toMatchObject({ code: ErrorCode.SELLER_UNREACHABLE });
  });
});

describe("ResourceClient.retryWithPayment", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the payment as a PAYMENT-SIGNATURE header (x402 v2) and returns the seller's paid response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ forecast: "sunny" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      accepted: paymentRequired.accepts[0]!,
      payload: { transaction: "signed-xdr-stub" },
    };

    const client = new ResourceClient(config);
    const result = await client.retryWithPayment(
      "https://weather.example/forecast",
      { method: "GET" },
      paymentPayload
    );

    expect(result).toEqual({ status: 200, body: { forecast: "sunny" } });
    const [, requestInit] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const headers = new Headers(requestInit.headers);
    expect(headers.get("PAYMENT-SIGNATURE")).toBeTruthy();
    expect(headers.get("X-PAYMENT")).toBeNull();
  });
});

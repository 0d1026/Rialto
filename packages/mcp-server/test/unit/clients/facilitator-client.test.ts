import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { FacilitatorClient } from "../../../src/clients/facilitator-client.js";
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "stellar:testnet",
  asset: "native",
  amount: "1000",
  payTo: "GABC",
  maxTimeoutSeconds: 60,
  extra: {},
};

const paymentPayload: PaymentPayload = {
  x402Version: 2,
  accepted: requirements,
  payload: { transaction: "signed-xdr-stub" },
};

describe("FacilitatorClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getSupported() returns the parsed SupportedResponse", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }],
        extensions: [],
        signers: {},
      })
    );

    const client = new FacilitatorClient(config);
    const result = await client.getSupported();

    expect(result.kinds).toEqual([{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }]);
    const [firstCall] = fetchMock.mock.calls;
    const requestUrl = new URL(firstCall?.[0] as string | URL);
    expect(requestUrl.pathname).toBe("/supported");
  });

  it("sends the configured API key as a Bearer token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kinds: [], extensions: [], signers: {} }));

    const client = new FacilitatorClient({ ...config, FACILITATOR_API_KEY: "secret-key" });
    await client.getSupported();

    const [, requestInit] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const headers = new Headers(requestInit.headers);
    expect(headers.get("authorization")).toBe("Bearer secret-key");
  });

  it("sends no authorization header when no API key is configured", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kinds: [], extensions: [], signers: {} }));

    const client = new FacilitatorClient(config);
    await client.getSupported();

    const [, requestInit] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const headers = new Headers(requestInit.headers);
    expect(headers.get("authorization")).toBeNull();
  });

  it("verify() resolves with the VerifyResponse when isValid is true", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { isValid: true, payer: "GABC" }));

    const client = new FacilitatorClient(config);
    const result = await client.verify(paymentPayload, requirements);

    expect(result).toEqual({ isValid: true, payer: "GABC" });
    const [firstCall, requestInit] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const requestUrl = new URL(firstCall);
    expect(requestUrl.pathname).toBe("/verify");
    expect(JSON.parse(requestInit.body as string)).toEqual({ paymentPayload, paymentRequirements: requirements });
  });

  it("verify() throws FACILITATOR_VERIFY_REJECTED with the facilitator's own reason when isValid is false", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { isValid: false, invalidReason: "insufficient_funds" })
    );

    const client = new FacilitatorClient(config);
    await expect(client.verify(paymentPayload, requirements)).rejects.toMatchObject({
      code: ErrorCode.FACILITATOR_VERIFY_REJECTED,
      message: "insufficient_funds",
    });
  });

  it("throws FACILITATOR_UNAVAILABLE on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("internal error", { status: 503 }));

    const client = new FacilitatorClient(config);
    await expect(client.getSupported()).rejects.toMatchObject({
      code: ErrorCode.FACILITATOR_UNAVAILABLE,
    });
  });

  it("throws FACILITATOR_UNAVAILABLE when the network request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const client = new FacilitatorClient(config);
    await expect(client.getSupported()).rejects.toMatchObject({
      code: ErrorCode.FACILITATOR_UNAVAILABLE,
    });
  });

  it("settle() resolves with the SettleResponse when success is true", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, transaction: "tx-abc", network: "stellar:testnet" })
    );

    const client = new FacilitatorClient(config);
    const result = await client.settle(paymentPayload, requirements);

    expect(result).toEqual({ success: true, transaction: "tx-abc", network: "stellar:testnet" });
    const [firstCall, requestInit] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(new URL(firstCall).pathname).toBe("/settle");
    expect(JSON.parse(requestInit.body as string)).toEqual({ paymentPayload, paymentRequirements: requirements });
  });

  it("settle() throws FACILITATOR_SETTLE_FAILED with the facilitator's own reason when success is false", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: false, errorReason: "sequence_number_conflict", transaction: "", network: "stellar:testnet" })
    );

    const client = new FacilitatorClient(config);
    await expect(client.settle(paymentPayload, requirements)).rejects.toMatchObject({
      code: ErrorCode.FACILITATOR_SETTLE_FAILED,
      message: "sequence_number_conflict",
    });
  });
});

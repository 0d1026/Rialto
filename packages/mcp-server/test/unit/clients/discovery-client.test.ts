import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoveryClient } from "../../../src/clients/discovery-client.js";
import { ErrorCode } from "../../../src/errors/codes.js";
import { McpToolError } from "../../../src/errors/mcp-tool-error.js";
import type { Config } from "../../../src/config.js";
import type { DiscoveryResource } from "../../../src/types/discovery.js";

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

function resource(overrides: Partial<DiscoveryResource> = {}): DiscoveryResource {
  return {
    resource: "https://weather.example/forecast",
    type: "http",
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "stellar:testnet",
        payTo: "GABC123",
        asset: "USDC",
        amount: "1000",
      },
    ],
    lastUpdated: "2026-08-01T00:00:00.000Z",
    metadata: { provenance: "observed-settlement", settlementCount: 3 },
    ...overrides,
  };
}

describe("DiscoveryClient.search", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a discovery search response to ResourceSummary results", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        resources: [
          resource({
            serviceName: "Weather API",
            description: "Hourly forecasts",
            tags: ["weather"],
          }),
        ],
        partialResults: false,
        pagination: { limit: 20, cursor: "next-cursor" },
      })
    );

    const client = new DiscoveryClient(config);
    const result = await client.search({ query: "weather" });

    expect(result).toEqual({
      results: [
        {
          resource: "https://weather.example/forecast",
          type: "http",
          name: "Weather API",
          description: "Hourly forecasts",
          tags: ["weather"],
          network: "stellar:testnet",
          settlementCount: 3,
        },
      ],
      cursor: "next-cursor",
      partialResults: false,
    });
  });

  it("sends query, limit, and cursor as query params", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        resources: [],
        partialResults: false,
        pagination: null,
      })
    );

    const client = new DiscoveryClient(config);
    await client.search({ query: "weather api", limit: 5, cursor: "abc" });

    const [firstCall] = fetchMock.mock.calls;
    const requestUrl = new URL(firstCall?.[0] as string | URL);
    expect(requestUrl.pathname).toBe("/discovery/search");
    expect(requestUrl.searchParams.get("query")).toBe("weather api");
    expect(requestUrl.searchParams.get("limit")).toBe("5");
    expect(requestUrl.searchParams.get("cursor")).toBe("abc");
  });

  it("returns null cursor when discovery omits pagination (last page)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        resources: [resource()],
        partialResults: false,
        pagination: null,
      })
    );

    const client = new DiscoveryClient(config);
    const result = await client.search({ query: "weather" });

    expect(result.cursor).toBeNull();
  });

  it("falls back to toolName, then resource, when serviceName is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        resources: [resource({ toolName: "get_forecast" }), resource({ resource: "https://bare.example/x" })],
        partialResults: false,
        pagination: null,
      })
    );

    const client = new DiscoveryClient(config);
    const result = await client.search({ query: "weather" });

    expect(result.results[0]?.name).toBe("get_forecast");
    expect(result.results[1]?.name).toBe("https://bare.example/x");
  });

  it("omits description in the summary when discovery doesn't return one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        resources: [resource()],
        partialResults: false,
        pagination: null,
      })
    );

    const client = new DiscoveryClient(config);
    const result = await client.search({ query: "weather" });

    expect(result.results[0]).not.toHaveProperty("description");
  });

  it("folds network into the query text, since discovery parses it out of the query itself", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        resources: [],
        partialResults: false,
        pagination: null,
      })
    );

    const client = new DiscoveryClient(config);
    await client.search({ query: "weather api", network: "stellar:pubnet" });

    const [firstCall] = fetchMock.mock.calls;
    const requestUrl = new URL(firstCall?.[0] as string | URL);
    expect(requestUrl.searchParams.get("query")).toBe("weather api stellar:pubnet");
  });

  it("throws DISCOVERY_INVALID_QUERY on a 400 response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: "payload_invalid", reason: "query parameter is required" } })
    );

    const client = new DiscoveryClient(config);
    await expect(client.search({ query: "" })).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_INVALID_QUERY,
      message: "query parameter is required",
    });
  });

  it("throws DISCOVERY_UNAVAILABLE on a non-2xx, non-400 response", async () => {
    fetchMock.mockResolvedValue(new Response("internal error", { status: 503 }));

    const client = new DiscoveryClient(config);
    await expect(client.search({ query: "weather" })).rejects.toBeInstanceOf(McpToolError);
    await expect(client.search({ query: "weather" })).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_UNAVAILABLE,
    });
  });

  it("throws DISCOVERY_UNAVAILABLE when the network request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const client = new DiscoveryClient(config);
    await expect(client.search({ query: "weather" })).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_UNAVAILABLE,
    });
  });
});

describe("DiscoveryClient.getResource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a discovery resource response to ResourceDetail, exact scheme", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        item: resource({
          serviceName: "Weather API",
          description: "Hourly forecasts",
          tags: ["weather"],
          routeTemplate: "/forecast",
        }),
      })
    );

    const client = new DiscoveryClient(config);
    const result = await client.getResource({ resource: "https://weather.example/forecast" });

    expect(result).toEqual({
      resource: "https://weather.example/forecast",
      type: "http",
      name: "Weather API",
      description: "Hourly forecasts",
      tags: ["weather"],
      routeTemplate: "/forecast",
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "stellar:testnet",
          payTo: "GABC123",
          asset: "USDC",
          amount: "1000",
        },
      ],
      lastUpdated: "2026-08-01T00:00:00.000Z",
      provenance: "observed-settlement",
      settlementCount: 3,
    });
  });

  it("maps an upto-scheme resource, preserving its extra fields", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        x402Version: 2,
        item: resource({
          accepts: [
            {
              scheme: "upto",
              network: "stellar:testnet",
              payTo: "GABC123",
              asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
              amount: "10000000",
              maxTimeoutSeconds: 60,
              extra: {
                areFeesSponsored: true,
                settlementContract: "CABCDEF",
              },
            },
          ],
        }),
      })
    );

    const client = new DiscoveryClient(config);
    const result = await client.getResource({ resource: "https://weather.example/forecast" });

    expect(result.accepts).toEqual([
      {
        scheme: "upto",
        network: "stellar:testnet",
        payTo: "GABC123",
        asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
        amount: "10000000",
        maxTimeoutSeconds: 60,
        extra: {
          areFeesSponsored: true,
          settlementContract: "CABCDEF",
        },
      },
    ]);
  });

  it("sends resource and toolName as query params", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { x402Version: 2, item: resource() }));

    const client = new DiscoveryClient(config);
    await client.getResource({ resource: "https://weather.example/forecast", toolName: "get_forecast" });

    const [firstCall] = fetchMock.mock.calls;
    const requestUrl = new URL(firstCall?.[0] as string | URL);
    expect(requestUrl.pathname).toBe("/discovery/resource");
    expect(requestUrl.searchParams.get("resource")).toBe("https://weather.example/forecast");
    expect(requestUrl.searchParams.get("toolName")).toBe("get_forecast");
  });

  it("throws DISCOVERY_RESOURCE_NOT_FOUND on a 404 response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: { code: "resource_not_found", reason: "no matching resource" } })
    );

    const client = new DiscoveryClient(config);
    await expect(
      client.getResource({ resource: "https://missing.example/x" })
    ).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_RESOURCE_NOT_FOUND,
    });
  });

  it("throws DISCOVERY_UNAVAILABLE on a non-2xx, non-404 response", async () => {
    fetchMock.mockResolvedValue(new Response("internal error", { status: 503 }));

    const client = new DiscoveryClient(config);
    await expect(
      client.getResource({ resource: "https://weather.example/forecast" })
    ).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_UNAVAILABLE,
    });
  });

  it("throws DISCOVERY_UNAVAILABLE when the network request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const client = new DiscoveryClient(config);
    await expect(
      client.getResource({ resource: "https://weather.example/forecast" })
    ).rejects.toMatchObject({
      code: ErrorCode.DISCOVERY_UNAVAILABLE,
    });
  });
});

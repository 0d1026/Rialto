import type { Config } from "../config.js";
import { ErrorCode } from "../errors/codes.js";
import { McpToolError } from "../errors/mcp-tool-error.js";
import type {
  DiscoveryErrorBody,
  DiscoveryResource,
  DiscoverySearchParams,
  DiscoverySearchResponse,
} from "../types/discovery.js";

export interface ResourceSummary {
  resource: string;
  type: string;
  name: string;
  description?: string;
  tags: string[];
  network: string | null;
  settlementCount: number;
}

export interface SearchResult {
  results: ResourceSummary[];
  cursor: string | null;
  partialResults: boolean;
}

function toSummary(r: DiscoveryResource): ResourceSummary {
  const name = r.serviceName ?? r.toolName ?? r.resource;
  return {
    resource: r.resource,
    type: r.type,
    name,
    ...(r.description !== undefined ? { description: r.description } : {}),
    tags: r.tags ?? [],
    network: r.accepts[0]?.network ?? null,
    settlementCount: r.metadata.settlementCount,
  };
}

/**
 * Talks to @rialto/discovery over HTTP. The only layer allowed to touch the
 * network for discovery data - tools/ call this, never fetch directly.
 */
export class DiscoveryClient {
  constructor(private readonly config: Config) {}

  async search(params: DiscoverySearchParams): Promise<SearchResult> {
    const url = new URL("/discovery/search", this.config.DISCOVERY_URL);
    // Discovery has no network query param - it parses a "stellar:testnet"
    // / "stellar:pubnet" token out of the query text itself and applies it
    // as a real SQL hard filter (search/query-constraints.ts), so folding
    // it into the query here gets a correctly-paginated filtered result
    // set instead of truncating a page client-side after the fact.
    const query = params.network ? `${params.query} ${params.network}` : params.query;
    url.searchParams.set("query", query);
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    if (params.cursor) url.searchParams.set("cursor", params.cursor);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.RIALTO_SERVICE_TIMEOUT_MS
    );

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw new McpToolError(
        ErrorCode.DISCOVERY_UNAVAILABLE,
        `discovery search request failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 400) {
      const body = (await response.json().catch(() => null)) as DiscoveryErrorBody | null;
      throw new McpToolError(
        ErrorCode.DISCOVERY_INVALID_QUERY,
        body?.error?.reason ?? "discovery rejected the search query"
      );
    }

    if (!response.ok) {
      throw new McpToolError(
        ErrorCode.DISCOVERY_UNAVAILABLE,
        `discovery search returned ${response.status}`
      );
    }

    let body: DiscoverySearchResponse;
    try {
      body = (await response.json()) as DiscoverySearchResponse;
    } catch (err) {
      throw new McpToolError(
        ErrorCode.DISCOVERY_UNAVAILABLE,
        "discovery search returned invalid JSON",
        err
      );
    }

    return {
      results: body.resources.map(toSummary),
      cursor: body.pagination?.cursor ?? null,
      partialResults: body.partialResults,
    };
  }
}

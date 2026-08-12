/** Request/response types for the public discovery endpoints. */

export interface DiscoveryListQuery {
  type?: 'http' | 'mcp';
  payTo?: string;
  scheme?: string;
  network?: string;
  extensions?: string[];
  limit?: number;
  offset?: number;
}

export interface DiscoveryListResponse {
  x402Version: 2;
  items: unknown[];
  pagination: { limit: number; offset: number; total: number };
}

export interface DiscoverySearchQuery {
  query: string;
  type?: 'http' | 'mcp';
  limit?: number;
  cursor?: string;
}

export interface DiscoverySearchResponse {
  x402Version: 2;
  resources: unknown[];
  partialResults: boolean;
  pagination: { limit: number; cursor: string | null } | null;
}

export interface DiscoveryGetResourceQuery {
  resource: string;
  /** Disambiguates an MCP resource exposing multiple tools; rows key on (resource, toolName). */
  toolName?: string;
}

export interface DiscoveryGetResourceResponse {
  x402Version: 2;
  item: unknown;
}

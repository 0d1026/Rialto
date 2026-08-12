/**
 * Wire types for @rialto/discovery's HTTP surface. Mirrored from
 * packages/discovery/src/router.ts (route contract) and src/wire.ts
 * (DB row -> wire mapping) - those two files are the source of truth,
 * not this one.
 */

export interface DiscoveryAccept {
  scheme: string;
  network: string;
  payTo: string;
  asset: string;
  amount: string;
}

export interface DiscoveryResourceMetadata {
  provenance: string;
  source?: string;
  settlementCount: number;
}

export interface DiscoveryResource {
  resource: string;
  type: string;
  x402Version: number;
  accepts: DiscoveryAccept[];
  lastUpdated: string;
  metadata: DiscoveryResourceMetadata;
  toolName?: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
  routeTemplate?: string;
  extensions?: Record<string, unknown>;
}

export interface DiscoverySearchResponse {
  x402Version: number;
  resources: DiscoveryResource[];
  partialResults: boolean;
  /** Absent (not present at all) once the last page has been reached. */
  pagination: { limit: number; cursor: string } | null;
}

export interface DiscoveryErrorBody {
  error: { code: string; reason: string };
}

export interface DiscoverySearchParams {
  query: string;
  limit?: number;
  cursor?: string;
  /**
   * Discovery's /discovery/search has no network query param - it parses a
   * "stellar:testnet"/"stellar:pubnet" token out of the query text itself
   * and applies it as a SQL hard filter (search/query-constraints.ts). The
   * client folds this into the outgoing query string rather than filtering
   * the response after the fact.
   */
  network?: "stellar:testnet" | "stellar:pubnet";
}

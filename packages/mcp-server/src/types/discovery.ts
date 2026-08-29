/**
 * Wire types for @rialto/discovery's HTTP surface. Mirrored from
 * packages/discovery/src/router.ts (route contract) and src/wire.ts
 * (DB row -> wire mapping) - those two files are the source of truth,
 * not this one.
 */

import type { PaymentRequirements } from "./payment.js";

/**
 * Discovery's `accepts` entries are exactly x402 PaymentRequirements. Note:
 * discovery's ingest pipeline (packages/discovery's /internal/settlement-events
 * handler) doesn't currently accept or store `extra`/`maxTimeoutSeconds` on
 * an accepts entry, so in practice those fields are absent on every resource
 * until that pipeline is extended - they're typed here because the wire
 * contract (and the `accepts` JSONB column) already allows them.
 */
export type DiscoveryAccept = PaymentRequirements;

export interface DiscoveryResourceMetadata {
  provenance: string;
  source?: string;
  settlementCount: number;
  ownerBound?: boolean;
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

export interface DiscoveryGetResourceResponse {
  x402Version: number;
  item: DiscoveryResource;
}

export interface DiscoveryGetResourceParams {
  resource: string;
  /** Disambiguates an MCP resource exposing multiple tools; rows key on (resource, toolName). */
  toolName?: string;
}

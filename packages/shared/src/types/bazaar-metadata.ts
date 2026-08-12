/**
 * The discovery-extension metadata shape: seller declares it in the 402,
 * the client echoes it in the payment payload, the facilitator passes it
 * through, discovery validates and indexes it. Mirrors the wire fields of
 * the upstream Bazaar spec's DiscoveryResource inputs.
 */
export interface BazaarMetadata {
  type: 'http' | 'mcp';
  x402Version: number;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
  routeTemplate?: string;
  /** MCP only - the tool this payment invoked; catalog key is (resource, toolName). */
  toolName?: string;
  extensions?: Record<string, unknown>;
}

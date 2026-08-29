/**
 * Shared DB-row -> wire mapping. Its own module (not catalog.ts) so
 * search/lexical.ts can reuse it without a circular import back into
 * catalog.ts, which imports lexicalSearch from search/lexical.ts.
 */

/** Map a DB row to the Bazaar wire shape (DiscoveryResource). */
export function toWire(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    resource: row.resource,
    type: row.type,
    x402Version: row.x402_version,
    accepts: row.accepts,
    lastUpdated: row.last_updated,
    metadata: {
      provenance: row.provenance,
      source: row.source ?? undefined,
      settlementCount: row.settlement_count,
      ownerBound: row.bound_pay_to != null,
    },
  };
  if (row.tool_name) out.toolName = row.tool_name;
  if (row.description) out.description = row.description;
  if (row.mime_type) out.mimeType = row.mime_type;
  if (row.service_name) out.serviceName = row.service_name;
  if (row.tags) out.tags = row.tags;
  if (row.icon_url) out.iconUrl = row.icon_url;
  if (row.route_template) out.routeTemplate = row.route_template;
  if (row.extensions) out.extensions = row.extensions;
  return out;
}

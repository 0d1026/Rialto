/**
 * Catalog integrity gauntlet - field-level soft-drop rules from the Bazaar spec
 * (specs/extensions/bazaar.md). Applied to EVERY entry regardless of provenance:
 * observed-settlement entries arrive pre-validated by @x402/extensions, but
 * ingested and registered entries come from outside and get the full treatment.
 *
 * Spec behaviors implemented here (verified against the upstream spec text):
 * - serviceName: printable ASCII, max 32 chars, else DROP the field
 * - tags: max 5, each printable ASCII <= 32 chars, case-insensitive dedupe,
 *   invalid entries dropped individually
 * - iconUrl: absolute http/https, <= 2048 chars, no userinfo, no IP-literal /
 *   loopback / decimal / hex hostnames, else DROP the field
 * - routeTemplate: non-empty, starts with '/', charset ^/[a-zA-Z0-9_/:.\-~%]+$,
 *   no '..', no '://', percent-decoded BEFORE traversal checks; invalid -> DROP
 *   (fall back to the concrete URL path)
 * - only an invalid envelope rejects the whole entry
 */

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;
const ROUTE_TEMPLATE = /^\/[a-zA-Z0-9_/:.\-~%]+$/;

export function cleanServiceName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > 32) return undefined;
  if (!PRINTABLE_ASCII.test(value)) return undefined;
  return value;
}

export function cleanTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of value) {
    if (typeof tag !== 'string') continue;
    if (tag.length === 0 || tag.length > 32) continue;
    if (!PRINTABLE_ASCII.test(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === 5) break;
  }
  return out.length > 0 ? out : undefined;
}

function isForbiddenHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  // IPv4 literal (incl. loopback), pure-decimal, and hex forms
  if (/^\d+$/.test(h)) return true;
  if (/^0x[0-9a-f]+$/.test(h)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  // IPv6 literal
  if (h.startsWith('[') || h.includes(':')) return true;
  return false;
}

export function cleanIconUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;
  let host = url.hostname;
  try {
    host = decodeURIComponent(host);
  } catch {
    return undefined;
  }
  if (isForbiddenHost(host)) return undefined;
  return value;
}

export function cleanRouteTemplate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  // percent-decode BEFORE traversal/scheme checks, per spec
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  if (!decoded.startsWith('/')) return undefined;
  if (decoded.includes('..')) return undefined;
  if (decoded.includes('://')) return undefined;
  if (!ROUTE_TEMPLATE.test(value)) return undefined;
  return value;
}

export interface CleanEntryInput {
  resource: unknown;
  type: unknown;
  x402Version: unknown;
  accepts: unknown;
  description?: unknown;
  mimeType?: unknown;
  serviceName?: unknown;
  tags?: unknown;
  iconUrl?: unknown;
  routeTemplate?: unknown;
  toolName?: unknown;
  extensions?: unknown;
}

export interface CleanEntry {
  resource: string;
  type: 'http' | 'mcp';
  toolName: string | null;
  x402Version: number;
  accepts: unknown[];
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  iconUrl?: string;
  routeTemplate?: string;
  extensions?: Record<string, unknown>;
}

export type CleanResult =
  | { ok: true; entry: CleanEntry; dropped: string[] }
  | { ok: false; reason: string };

/** Envelope-level validation rejects; field-level problems soft-drop. */
export function cleanEntry(input: CleanEntryInput): CleanResult {
  if (typeof input.resource !== 'string' || input.resource.length === 0) {
    return { ok: false, reason: 'resource_missing' };
  }
  if (input.type !== 'http' && input.type !== 'mcp') {
    return { ok: false, reason: 'type_invalid' };
  }
  if (!Array.isArray(input.accepts) || input.accepts.length === 0) {
    return { ok: false, reason: 'accepts_missing' };
  }
  const version = Number(input.x402Version);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'x402version_invalid' };
  }
  const toolName =
    input.type === 'mcp' && typeof input.toolName === 'string' && input.toolName.length > 0
      ? input.toolName
      : null;
  if (input.type === 'mcp' && toolName === null) {
    return { ok: false, reason: 'mcp_toolname_missing' };
  }

  const dropped: string[] = [];
  const keep = <T>(name: string, raw: unknown, cleaned: T | undefined): T | undefined => {
    if (raw !== undefined && raw !== null && cleaned === undefined) dropped.push(name);
    return cleaned;
  };

  const entry: CleanEntry = {
    resource: input.resource,
    type: input.type,
    toolName,
    x402Version: version,
    accepts: input.accepts,
    description:
      typeof input.description === 'string' && input.description.length > 0
        ? input.description.slice(0, 4096)
        : undefined,
    mimeType: typeof input.mimeType === 'string' ? input.mimeType.slice(0, 128) : undefined,
    serviceName: keep('serviceName', input.serviceName, cleanServiceName(input.serviceName)),
    tags: keep('tags', input.tags, cleanTags(input.tags)),
    iconUrl: keep('iconUrl', input.iconUrl, cleanIconUrl(input.iconUrl)),
    routeTemplate: keep('routeTemplate', input.routeTemplate, cleanRouteTemplate(input.routeTemplate)),
    extensions:
      input.extensions && typeof input.extensions === 'object'
        ? (input.extensions as Record<string, unknown>)
        : undefined,
  };
  return { ok: true, entry, dropped };
}

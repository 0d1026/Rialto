/**
 * Registry of external x402 discovery endpoints to federate from. Each source
 * is generic: a name, the catalog URL to pull, a pager (how to page its list),
 * and an adapter (how to map its item shape onto our CleanEntryInput). Adding a
 * new x402 facilitator is one more entry here, not new sync code.
 *
 * Most spec-compliant endpoints share the `{items:[{resource,type,x402Version,
 * accepts,...}]}` shape (standardAdapter). Endpoints that deviate get a small
 * adapter — GoPlausible uses `resourceUrl`/`method`; AlgoVoi is v1-style with
 * the amount inside `accepts`.
 */
import type { CleanEntryInput } from '../validation.js';

export interface FederationSource {
  name: string;
  /** base origin recorded in federation_peers */
  origin: string;
  /** the discovery list URL (also the provenance `source` on ingested rows) */
  catalogUrl: string;
  /** fetch one page of raw items; returns [] when exhausted */
  fetchPage(offset: number, limit: number): Promise<Record<string, unknown>[]>;
  /** map a raw item to catalog input; null to skip a malformed entry */
  adapter(item: Record<string, unknown>): CleanEntryInput | null;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Standard pager: `{items|resources:[...]}` with `limit`/`offset` query params. */
function itemsPager(baseUrl: string) {
  return async (offset: number, limit: number): Promise<Record<string, unknown>[]> => {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const body = await getJson(`${baseUrl}${sep}limit=${limit}&offset=${offset}`);
    return (body.items ?? body.resources ?? []) as Record<string, unknown>[];
  };
}

/** Spec / CDP shape: fields map through as-is. */
function standardAdapter(it: any): CleanEntryInput | null {
  if (typeof it.resource !== 'string') return null;
  return {
    resource: it.resource,
    type: it.type ?? 'http',
    x402Version: it.x402Version ?? 1,
    accepts: it.accepts,
    description: it.description,
    mimeType: it.mimeType,
    serviceName: it.serviceName,
    tags: it.tags,
    iconUrl: it.iconUrl,
    extensions: it.extensions,
  };
}

/** v1-style with a top-level `resource` and the amount inside `accepts` (AlgoVoi). */
function v1Adapter(it: any): CleanEntryInput | null {
  const accepts = Array.isArray(it.accepts) ? it.accepts : [];
  if (typeof it.resource !== 'string' || accepts.length === 0) return null;
  const first = accepts[0] ?? {};
  return {
    resource: it.resource,
    type: typeof it.type === 'string' ? it.type : 'http',
    x402Version: 1,
    accepts,
    description: typeof first.description === 'string' ? first.description : it.description,
    mimeType: typeof first.mimeType === 'string' ? first.mimeType : it.mimeType,
  };
}

/** GoPlausible shape: `resourceUrl` + `method`, amount inside `accepts`. */
function goPlausibleAdapter(it: any): CleanEntryInput | null {
  const accepts = Array.isArray(it.accepts) ? it.accepts : [];
  if (typeof it.resourceUrl !== 'string' || accepts.length === 0) return null;
  return {
    resource: it.resourceUrl,
    type: 'http',
    x402Version: 1,
    accepts,
    description: typeof it.description === 'string' ? it.description : undefined,
    mimeType: typeof it.mimeType === 'string' ? it.mimeType : undefined,
  };
}

const CDP_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources';
const GOPLAUSIBLE_URL = 'https://facilitator.goplausible.xyz/discovery/resources?includeTestnets=true';
const ALGOVOI_URL = 'https://api.algovoi.co.uk/discovery/resources';

export const FEDERATION_SOURCES: FederationSource[] = [
  {
    name: 'CDP Bazaar',
    origin: 'https://api.cdp.coinbase.com',
    catalogUrl: CDP_URL,
    fetchPage: itemsPager(CDP_URL),
    adapter: standardAdapter,
  },
  {
    name: 'GoPlausible',
    origin: 'https://facilitator.goplausible.xyz',
    catalogUrl: GOPLAUSIBLE_URL,
    fetchPage: itemsPager(GOPLAUSIBLE_URL),
    adapter: goPlausibleAdapter,
  },
  {
    name: 'AlgoVoi',
    origin: 'https://api.algovoi.co.uk',
    catalogUrl: ALGOVOI_URL,
    fetchPage: itemsPager(ALGOVOI_URL),
    adapter: v1Adapter,
  },
];

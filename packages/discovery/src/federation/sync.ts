/**
 * Multi-source federation sync. Pulls each registered peer's current catalog and
 * runs every entry through Catalog.add, which upserts on the (resource, tool)
 * key - so re-pulling an unchanged entry refreshes it in place and the catalog
 * count only rises for genuinely new listings. Reports per-peer counts plus the
 * net new listings across the whole run (countAfter - countBefore).
 */
import type { Catalog } from '../catalog.js';
import { FEDERATION_SOURCES, type FederationSource } from './sources.js';

export interface PeerSyncResult {
  name: string;
  reachable: boolean;
  seen: number;
  upserted: number;
  rejected: number;
  error?: string;
}

export interface SyncResult {
  ranAt: string;
  countBefore: number;
  countAfter: number;
  newListings: number;
  peers: PeerSyncResult[];
}

const PAGE = 50;
const MAX_PAGES = 400; // safety cap against a runaway pager (~20k entries/peer)

export async function syncPeer(catalog: Catalog, source: FederationSource): Promise<PeerSyncResult> {
  const r: PeerSyncResult = {
    name: source.name,
    reachable: false,
    seen: 0,
    upserted: 0,
    rejected: 0,
  };
  try {
    await catalog.registerPeer(source.name, source.origin, source.catalogUrl);
    for (let page = 0; page < MAX_PAGES; page++) {
      const items = await source.fetchPage(page * PAGE, PAGE);
      r.reachable = true;
      if (items.length === 0) break;
      for (const raw of items) {
        r.seen++;
        const input = source.adapter(raw);
        if (!input) {
          r.rejected++;
          continue;
        }
        const res = await catalog.add(input, 'ingested', source.catalogUrl);
        if (res.ok) r.upserted++;
        else r.rejected++;
      }
      if (items.length < PAGE) break;
    }
    await catalog.markPeerIngested(source.origin);
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
  }
  return r;
}

export async function syncAll(
  catalog: Catalog,
  sources: FederationSource[] = FEDERATION_SOURCES,
): Promise<SyncResult> {
  const countBefore = await catalog.count();
  const peers: PeerSyncResult[] = [];
  for (const source of sources) {
    peers.push(await syncPeer(catalog, source));
  }
  const countAfter = await catalog.count();
  return {
    ranAt: new Date().toISOString(),
    countBefore,
    countAfter,
    newListings: countAfter - countBefore,
    peers,
  };
}

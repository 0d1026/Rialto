import { RIALTO } from '@/lib/rialto';

export const dynamic = 'force-dynamic';

/**
 * Federation proof for the /try page: the registered peers, plus a few catalog
 * entries that were actually ingested FROM a peer (provenance "ingested" whose
 * source matches a peer's catalog URL). Everything here is verifiable, the peer
 * exposes its own catalog URL and each entry shows the source it came from.
 */
export async function GET(): Promise<Response> {
  try {
    const [peersRes, listRes] = await Promise.all([
      fetch(`${RIALTO.discoveryUrl}/federation/peers`, {
        signal: AbortSignal.timeout(20_000),
      }).then((r) => r.json()),
      fetch(`${RIALTO.discoveryUrl}/discovery/resources?limit=100`, {
        signal: AbortSignal.timeout(30_000),
      }).then((r) => r.json()),
    ]);

    const peers: { name: string; base_url: string; catalog_url: string }[] =
      peersRes?.peers ?? [];
    const peerSources = new Set(peers.map((p) => p.catalog_url));

    const items: any[] = listRes?.items ?? [];
    const matches = items.filter(
      (it) =>
        it?.metadata?.provenance === 'ingested' && peerSources.has(it?.metadata?.source),
    );
    const nonSmoke = matches.filter((it) => !String(it.resource).includes('smoke'));
    const examples = (nonSmoke.length ? nonSmoke : matches).slice(0, 2).map((it) => ({
      resource: it.resource as string,
      source: it.metadata.source as string,
    }));

    return Response.json({ peers, ingestedCount: matches.length, examples });
  } catch {
    return Response.json({ peers: [], ingested: [] }, { status: 502 });
  }
}

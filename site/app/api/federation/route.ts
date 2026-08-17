import { RIALTO } from '@/lib/rialto';

export const dynamic = 'force-dynamic';

/**
 * Federation proof for the /try page: the registered peers, the live index size
 * (the catalog is federated - nearly every listing is ingested from a peer), and
 * a few real ingested entries showing the exact source they came from. Everything
 * here is verifiable: the peer exposes its own catalog URL and each entry links
 * back to it.
 */
const isTestResource = (u: string): boolean => /smoke|test/i.test(u);

export async function GET(): Promise<Response> {
  try {
    const [peersRes, listRes, healthRes] = await Promise.all([
      fetch(`${RIALTO.discoveryUrl}/federation/peers`, {
        signal: AbortSignal.timeout(20_000),
      }).then((r) => r.json()),
      fetch(`${RIALTO.discoveryUrl}/discovery/resources?limit=100`, {
        signal: AbortSignal.timeout(30_000),
      }).then((r) => r.json()),
      fetch(`${RIALTO.discoveryUrl}/health`, {
        signal: AbortSignal.timeout(20_000),
      })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    const peers: { name: string; base_url: string; catalog_url: string }[] =
      peersRes?.peers ?? [];
    const peerName = new Map(peers.map((p) => [p.catalog_url, p.name]));

    const items: any[] = listRes?.items ?? [];
    const ingested = items.filter(
      (it) =>
        it?.metadata?.provenance === 'ingested' && peerName.has(it?.metadata?.source),
    );
    const clean = ingested.filter((it) => !isTestResource(String(it.resource)));
    const examples = (clean.length ? clean : ingested).slice(0, 3).map((it) => ({
      resource: it.resource as string,
      source: it.metadata.source as string,
      peer: peerName.get(it.metadata.source) ?? 'peer',
    }));

    // Live index size. The catalog is ~100% federated (provenance "ingested"),
    // so the total is the honest "federated from independent catalogs" number.
    const indexSize = Number(healthRes?.resources ?? listRes?.pagination?.total ?? 0);

    return Response.json({ peers, indexSize, examples });
  } catch {
    return Response.json({ peers: [], indexSize: 0, examples: [] }, { status: 502 });
  }
}

import { RIALTO } from '@/lib/rialto';

export const dynamic = 'force-dynamic';

/** Live facilitator capabilities and federation peers, fetched server-side. */
export async function GET(): Promise<Response> {
  const [supported, peers, health] = await Promise.allSettled([
    fetch(`${RIALTO.facilitatorUrl}/supported`, {
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.json()),
    fetch(`${RIALTO.discoveryUrl}/federation/peers`, {
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.json()),
    fetch(`${RIALTO.discoveryUrl}/health`, {
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.json()),
  ]);

  const peerList = peers.status === 'fulfilled' ? (peers.value?.peers ?? []) : [];

  return Response.json({
    facilitatorUrl: RIALTO.facilitatorUrl,
    discoveryUrl: RIALTO.discoveryUrl,
    supported: supported.status === 'fulfilled' ? supported.value : null,
    peers: peerList,
    resourcesIndexed:
      health.status === 'fulfilled' ? Number(health.value?.resources ?? 0) : 0,
    peerCount: peerList.length,
    facilitatorLive: supported.status === 'fulfilled' && !!supported.value?.kinds?.length,
  });
}

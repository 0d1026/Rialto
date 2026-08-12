import { describe, expect, it } from 'vitest';

/**
 * [LIVE] Proof-of-liveness for the deployed discovery service - the same
 * role the settled testnet tx hash plays for the facilitator. Posts one
 * real settlement event to the live ingestion endpoint, then confirms it is
 * findable via the live /discovery/search shortly after.
 *
 * Requires:
 *   LIVE_DISCOVERY_URL   - base URL of the deployed discovery service
 *   LIVE_INGEST_TOKEN     - bearer token for /internal/settlement-events, if the
 *                          deployment has INGEST_TOKEN configured (omit if open)
 *
 * Run with: pnpm test:live
 */
const baseUrl = process.env.LIVE_DISCOVERY_URL;
const ingestToken = process.env.LIVE_INGEST_TOKEN;

describe.skipIf(!baseUrl)('[LIVE] discovery: ingest -> search against the real deployment', () => {
  it('a real settlement posted to the live ingestion endpoint is findable via live search', async () => {
    if (!baseUrl) return;

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resourceUrl = `https://live-check.rialto.example.com/api/probe-${uniqueSuffix}`;
    const serviceName = `LiveProbe-${uniqueSuffix}`;

    const event = {
      txHash: `live-probe-${uniqueSuffix}`,
      network: 'stellar:testnet',
      scheme: 'exact',
      payTo: 'GLIVEPROBE',
      amount: '1',
      asset: 'native',
      resource: resourceUrl,
      settledAt: new Date().toISOString(),
      bazaarMetadata: {
        type: 'http',
        x402Version: 2,
        description: 'Automated liveness probe - safe to ignore in the catalog',
        serviceName,
        tags: ['live-probe'],
      },
    };

    const ingestRes = await fetch(new URL('/internal/settlement-events', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ingestToken ? { authorization: `Bearer ${ingestToken}` } : {}),
      },
      body: JSON.stringify(event),
    });
    expect(ingestRes.status).toBe(202);
    const ingestBody = await ingestRes.json();
    expect(ingestBody.cataloged).toBe(true);

    // brief settle window before querying search
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const searchUrl = new URL('/discovery/search', baseUrl);
    searchUrl.searchParams.set('query', serviceName);
    const searchRes = await fetch(searchUrl);
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    const found = (searchBody.resources as Array<{ resource: string }>).find(
      (r) => r.resource === resourceUrl,
    );
    expect(found).toBeDefined();

    // eslint-disable-next-line no-console
    console.log(
      `[LIVE] proof-of-liveness: resource=${resourceUrl} txHash=${event.txHash} settledAt=${event.settledAt}`,
    );
  });
});

import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { RIALTO, explorerTx } from '@/lib/rialto';

export const dynamic = 'force-dynamic';

/**
 * One-click funded demo. Runs the full path a paying agent takes against the
 * live facilitator and discovery, using a disposable testnet key held only in
 * the server environment. Each hop is timed and returned so the page can draw
 * the run as a track with the real elapsed time under each node.
 *
 * Rate limited per IP (visible to the client) so a single sponsor key cannot be
 * drained, which is itself one of the sponsor-economics guarantees we claim.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function rateLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return { ok: false, remaining: 0 };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true, remaining: Math.max(0, MAX_PER_WINDOW - recent.length) };
}

async function getJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function fetchResource(): Promise<any | null> {
  const r = await getJson(
    `${RIALTO.discoveryUrl}/discovery/resource?resource=${encodeURIComponent(RIALTO.demoResource)}`,
  );
  return r.status === 200 ? (r.body?.item ?? null) : null;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.DEMO_PAYER_SECRET;
  if (!secret) {
    return Response.json({ error: 'demo payer is not configured' }, { status: 503 });
  }
  const ip =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const rl = rateLimit(ip);
  const rateInfo = { limit: MAX_PER_WINDOW, remaining: rl.remaining, windowHours: 1 };
  if (!rl.ok) {
    return Response.json(
      { error: 'rate limit reached, try again within the hour', rateLimit: rateInfo },
      { status: 429 },
    );
  }

  const steps: { key: string; label: string; ms: number }[] = [];
  let failedStep: string | null = null;

  try {
    const signer = createEd25519Signer(secret);

    // 1) discover
    let t = Date.now();
    failedStep = 'discover';
    const search = await getJson(
      `${RIALTO.discoveryUrl}/discovery/search?query=weather&limit=3`,
    );
    const discovered = (search.body?.resources ?? [])
      .slice(0, 3)
      .map((r: any) => r.resource as string);
    const baseline = await fetchResource();
    const baseCount = Number(baseline?.metadata?.settlementCount ?? 0);
    steps.push({ key: 'discover', label: 'Discover', ms: Date.now() - t });

    const requirements = {
      scheme: 'exact',
      network: RIALTO.network,
      payTo: RIALTO.demoPayee,
      asset: RIALTO.usdc,
      amount: RIALTO.demoAmount,
      maxTimeoutSeconds: 120,
      resource: RIALTO.demoResource,
      description: 'Rialto live demo seller: market insights endpoint',
      mimeType: 'application/json',
      extra: { areFeesSponsored: true },
    };

    // 2) sign the SEP-41 authorization
    t = Date.now();
    failedStep = 'sign';
    const client = new ExactStellarScheme(signer, { url: RIALTO.rpcUrl });
    const signed = await client.createPaymentPayload(2, requirements as any);
    steps.push({ key: 'sign', label: 'Sign', ms: Date.now() - t });

    const paymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: RIALTO.network,
      payload: signed.payload,
      accepted: requirements,
      resource: {
        url: RIALTO.demoResource,
        description: requirements.description,
        mimeType: requirements.mimeType,
      },
      extensions: {
        bazaar: {
          info: { input: { type: 'http', method: 'GET' } },
          schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: { input: { type: 'object' }, output: { type: 'object' } },
            required: ['input'],
          },
        },
      },
    };

    // 3) settle on the live facilitator (verifies + submits to Stellar)
    t = Date.now();
    failedStep = 'settle';
    const settle = await getJson(`${RIALTO.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
    });
    if (!settle.body?.success) {
      return Response.json(
        {
          error: 'settlement failed',
          detail: settle.body?.errorReason ?? settle.body,
          failedStep: 'settle',
          steps,
          rateLimit: rateInfo,
        },
        { status: 502 },
      );
    }
    const txHash: string = settle.body.transaction;
    steps.push({ key: 'settle', label: 'Settle on Stellar', ms: Date.now() - t });

    // 4) listed: wait for the catalog to record this settlement
    t = Date.now();
    failedStep = 'listed';
    let item: any = null;
    for (let i = 0; i < 20; i++) {
      const current = await fetchResource();
      if (
        current?.metadata?.provenance === 'observed-settlement' &&
        Number(current.metadata.settlementCount) > baseCount
      ) {
        item = current;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    steps.push({ key: 'listed', label: 'Listed', ms: Date.now() - t });

    return Response.json({
      ok: Boolean(item),
      network: RIALTO.network,
      payer: signer.address,
      payee: RIALTO.demoPayee,
      resource: RIALTO.demoResource,
      amountAtomic: RIALTO.demoAmount,
      discovered,
      txHash,
      explorer: explorerTx(txHash),
      baseCount,
      newCount: Number(item?.metadata?.settlementCount ?? baseCount),
      provenance: item?.metadata?.provenance ?? null,
      steps,
      rateLimit: rateInfo,
    });
  } catch (err) {
    return Response.json(
      {
        error: 'demo failed',
        detail: err instanceof Error ? err.message : String(err),
        failedStep,
        steps,
        rateLimit: rateInfo,
      },
      { status: 500 },
    );
  }
}

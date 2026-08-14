/**
 * End-to-end demo against the live Rialto deployment.
 *
 * Runs the full path a paying agent takes and shows the feedback loop that
 * closes back into discovery:
 *
 *   1. discover   query the live discovery API for real services
 *   2. quote      a seller states its 402 terms (exact, testnet USDC)
 *   3. pay        the payer signs the SEP-41 authorization for those terms
 *   4. settle     the live facilitator verifies and settles on testnet, then
 *                 posts a settlement event to discovery
 *   5. observe    the demo resource now appears in the catalog with
 *                 provenance "observed-settlement" and an incremented count
 *
 * The payer signs only the authorization entry; the facilitator is the fee
 * payer, so the payer spends no XLM. Config is read from the environment.
 *   DISCOVERY_URL        live discovery base url
 *   FACILITATOR_URL      live facilitator base url
 *   RPC_URL              soroban RPC (default testnet public)
 *   NETWORK              CAIP-2 network (default stellar:testnet)
 *   USDC_CONTRACT        SEP-41 token id (default canonical testnet USDC)
 *   PAYER_SECRET         S... payer, signs the authorization
 *   PAYEE_PUBLIC         G... seller receiving payment
 */
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';

const DISCOVERY_URL = (process.env.DISCOVERY_URL || 'https://rialto-production-97c9.up.railway.app').replace(/\/$/, '');
const FACILITATOR_URL = (process.env.FACILITATOR_URL || 'https://facilitator-production-0beb.up.railway.app').replace(/\/$/, '');
const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.NETWORK || 'stellar:testnet';
const USDC = process.env.USDC_CONTRACT || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const PAYER_SECRET = requireEnv('PAYER_SECRET');
const PAYEE_PUBLIC = requireEnv('PAYEE_PUBLIC');

const RESOURCE_URL = 'https://demo-seller.rialto.dev/insights';
const AMOUNT = '100000';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

function step(n, title) {
  console.log(`\n[${n}] ${title}`);
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  const signer = createEd25519Signer(PAYER_SECRET);

  step(1, 'discover: query the live discovery API');
  const search = await getJson(`${DISCOVERY_URL}/discovery/search?query=weather&limit=3`);
  const hits = search.body?.resources ?? [];
  console.log(`    ${hits.length} live results for "weather":`);
  for (const r of hits.slice(0, 3)) console.log(`      - ${r.resource}`);

  step(2, 'quote: seller states its 402 terms');
  const requirements = {
    scheme: 'exact',
    network: NETWORK,
    payTo: PAYEE_PUBLIC,
    asset: USDC,
    amount: AMOUNT,
    maxTimeoutSeconds: 120,
    resource: RESOURCE_URL,
    description: 'Rialto live demo seller: market insights endpoint',
    mimeType: 'application/json',
    extra: { areFeesSponsored: true },
  };
  console.log(`    ${AMOUNT} atomic USDC to ${PAYEE_PUBLIC} for ${RESOURCE_URL}`);

  step(3, 'pay: payer signs the SEP-41 authorization for those terms');
  const client = new ExactStellarScheme(signer, { url: RPC_URL });
  const signed = await client.createPaymentPayload(2, requirements);
  const paymentPayload = {
    x402Version: 2,
    scheme: 'exact',
    network: NETWORK,
    payload: signed.payload,
    accepted: requirements,
    resource: {
      url: RESOURCE_URL,
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
  console.log(`    authorization signed by ${signer.address}`);

  const baseline = await fetchResource();
  const baseCount = Number(baseline?.metadata?.settlementCount ?? 0);

  step(4, 'settle: live facilitator verifies and settles on testnet');
  const settle = await getJson(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
  });
  if (!settle.body?.success) {
    console.error('    settle failed:', JSON.stringify(settle.body));
    process.exit(1);
  }
  const txHash = settle.body.transaction;
  console.log(`    settled tx ${txHash}`);
  console.log(`    https://stellar.expert/explorer/testnet/tx/${txHash}`);

  step(5, 'observe: the catalog records the payment');
  let item = null;
  for (let i = 0; i < 20; i++) {
    const current = await fetchResource();
    if (current?.metadata?.provenance === 'observed-settlement' &&
      Number(current.metadata.settlementCount) > baseCount) {
      item = current;
      break;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  if (!item) {
    console.error('    settlement did not reach the catalog within the wait window');
    process.exit(1);
  }
  const meta = item.metadata;
  console.log(`    resource:        ${item.resource}`);
  console.log(`    provenance:      ${meta.provenance}`);
  console.log(`    settlementCount: ${baseCount} -> ${meta.settlementCount}`);

  console.log('\nPASS: discover -> pay -> settle -> catalog feedback loop');
  process.exit(0);
}

async function fetchResource() {
  const r = await getJson(`${DISCOVERY_URL}/discovery/resource?resource=${encodeURIComponent(RESOURCE_URL)}`);
  return r.status === 200 ? r.body?.item ?? null : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

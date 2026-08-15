/**
 * A minimal, real x402 v2 seller for manual/local testing of paid_call -
 * this repo has no runnable example seller yet (examples/, packages/seller-sdk
 * are still skeletons per the root README), so there's nothing real to
 * pay against otherwise. Same protocol logic as
 * test/live/fixtures/local-seller.ts, packaged as something you run
 * standalone and point paid_call at.
 *
 * Does NOT call a facilitator's /verify or /settle itself: Rialto's own
 * paid_call does that directly against the live 402 this server declares
 * (see packages/discovery/README.md's cataloging-integrity note on not
 * trusting a seller's own claims) - a spec-compliant seller only needs to
 * declare a real 402 and serve content once a payment signature shows up,
 * which is all this does.
 *
 * Usage:
 *   PAY_TO=<a Stellar G-address to receive payment> npx tsx scripts/local-seller.ts
 *
 * Env vars:
 *   PORT                    - default 4099
 *   NETWORK                 - default stellar:testnet
 *   PAY_TO                  - required: the G-address that gets paid
 *   ASSET                   - default: native XLM's testnet Soroban Asset Contract
 *   AMOUNT                  - default "100" (100 stroops = 0.00001 XLM)
 *   AREAS_FEES_SPONSORED    - default "true" - must match what your facilitator's
 *                             /supported actually advertises, or the exact-scheme
 *                             client will reject the payload before ever calling it
 *   DISCOVERY_URL            - default http://localhost:4030. If reachable, this
 *                             script auto-catalogs itself on startup (a fabricated
 *                             settlement event) so search_resources/get_resource/
 *                             paid_call can find it immediately - paid_call resolves
 *                             its `resource` argument through discovery, so an
 *                             uncataloged seller is invisible to it no matter how
 *                             real the seller itself is.
 */
import { createServer } from "node:http";
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from "@x402/core/http";
import type { Network, PaymentRequirements } from "@x402/core/types";

const PORT = Number(process.env.PORT ?? 4099);
const NETWORK = (process.env.NETWORK ?? "stellar:testnet") as Network;
const PAY_TO = process.env.PAY_TO;
const ASSET =
  process.env.ASSET ??
  // native XLM's Stellar Asset Contract on testnet
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const AMOUNT = process.env.AMOUNT ?? "100";
const AREAS_FEES_SPONSORED = (process.env.AREAS_FEES_SPONSORED ?? "true") === "true";
const DISCOVERY_URL = process.env.DISCOVERY_URL ?? "http://localhost:4030";

if (!PAY_TO) {
  console.error("PAY_TO is required - a Stellar G-address to receive the payment.");
  console.error("Generate one the same way as any other test key - see docs/decisions/0003-signer-boundary.md.");
  process.exit(1);
}

async function main(): Promise<void> {
  let resourceUrl = "";

  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: NETWORK,
    asset: ASSET,
    amount: AMOUNT,
    payTo: PAY_TO!,
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: AREAS_FEES_SPONSORED },
  };

  const server = createServer((req, res) => {
    const paymentSignature = req.headers["payment-signature"];

    if (typeof paymentSignature !== "string") {
      console.log(`[local-seller] ${req.method} ${req.url} -> 402 (no payment attached)`);
      res.writeHead(402, {
        "content-type": "application/json",
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
          x402Version: 2,
          resource: { url: resourceUrl },
          accepts: [requirements],
        }),
      });
      res.end(JSON.stringify({ message: "payment required" }));
      return;
    }

    try {
      decodePaymentSignatureHeader(paymentSignature);
    } catch {
      console.log(`[local-seller] ${req.method} ${req.url} -> 400 (undecodable PAYMENT-SIGNATURE)`);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "malformed payment signature" }));
      return;
    }

    console.log(`[local-seller] ${req.method} ${req.url} -> 200 (payment attached, serving content)`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "paid content", servedAt: new Date().toISOString() }));
  });

  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  resourceUrl = `http://127.0.0.1:${PORT}/forecast`;

  console.log(`[local-seller] listening at ${resourceUrl}`);
  console.log(`[local-seller] requires: ${AMOUNT} of ${ASSET} on ${NETWORK}, paid to ${PAY_TO}`);

  const settlementEvent = {
    txHash: `local-seller-bootstrap-${Date.now()}`,
    network: NETWORK,
    scheme: "exact",
    payTo: PAY_TO,
    amount: AMOUNT,
    asset: ASSET,
    resource: resourceUrl,
    settledAt: new Date().toISOString(),
    bazaarMetadata: {
      type: "http",
      x402Version: 2,
      description: "Local example seller for manual paid_call testing",
      serviceName: "LocalSellerExample",
      tags: ["example", "local"],
    },
  };

  try {
    const res = await fetch(new URL("/internal/settlement-events", DISCOVERY_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settlementEvent),
    });
    if (res.ok) {
      console.log(`[local-seller] auto-cataloged in discovery at ${DISCOVERY_URL} - findable via search_resources/get_resource now`);
    } else {
      console.log(`[local-seller] discovery at ${DISCOVERY_URL} responded ${res.status} - catalog it manually (see below)`);
    }
  } catch {
    console.log(`[local-seller] could not reach discovery at ${DISCOVERY_URL} - catalog it manually once it's up:`);
  }

  console.log(`
[local-seller] manual catalog command, if needed:
curl -X POST ${DISCOVERY_URL}/internal/settlement-events \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify(settlementEvent)}'
`);

  console.log(`[local-seller] paid_call target: resource="${resourceUrl}"`);
}

main();

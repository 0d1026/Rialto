import { afterAll, describe, expect, it } from "vitest";
import { createEd25519Signer } from "@x402/stellar";
import type { PaymentRequirements } from "@x402/core/types";
import { ResourceClient } from "../../src/clients/resource-client.js";
import { FacilitatorClient } from "../../src/clients/facilitator-client.js";
import { createExactSchemeClient } from "../../src/schemes/exact.js";
import { runPaymentFlow } from "../../src/payment/payment-flow.js";
import type { Config } from "../../src/config.js";
import { startLocalSeller, type LocalSeller } from "./fixtures/local-seller.js";

/**
 * [LIVE] paid_call against real testnet: a real signer signs a real
 * PaymentPayload, a real facilitator verifies and settles it on
 * stellar:testnet, and a real (locally-run, spec-minimal) seller serves
 * paid content in exchange - the one path never exercised by the unit
 * suite, which mocks every collaborator by design.
 *
 * Runs at the payment-flow.ts level, not through the full MCP tool/stdio
 * stack or discovery cataloging - that wrapper layer (schema validation,
 * DiscoveryClient.getResource resolving a URL) is already covered by unit
 * tests and manual Inspector runs; what's never been proven against real
 * infrastructure is the money-moving path itself: sign -> verify -> retry
 * -> settle -> receipt.
 *
 * Requires:
 *   LIVE_FACILITATOR_URL         - a running facilitator (real testnet signer)
 *   LIVE_BUYER_STELLAR_PRIVATE_KEY - a funded stellar:testnet keypair's secret,
 *                                    never committed - export it in your shell
 *   LIVE_MERCHANT_STELLAR_ADDRESS  - a funded (or at least existing) stellar:testnet
 *                                    G-address to receive the payment
 *
 * Run with: pnpm test:live
 */
const facilitatorUrl = process.env.LIVE_FACILITATOR_URL;
const buyerSecret = process.env.LIVE_BUYER_STELLAR_PRIVATE_KEY;
const merchantAddress = process.env.LIVE_MERCHANT_STELLAR_ADDRESS;

const ready = Boolean(facilitatorUrl && buyerSecret && merchantAddress);

describe.skipIf(!ready)("[LIVE] paid_call: real signing, real facilitator, real testnet settlement", () => {
  let seller: LocalSeller;

  afterAll(async () => {
    await seller?.close();
  });

  it("signs, verifies, retries, and settles a real exact-scheme payment on stellar:testnet", async () => {
    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "stellar:testnet",
      // The exact scheme pays SEP-41 (Soroban) tokens, not classic assets -
      // "native" isn't a valid asset id here. This is the well-known,
      // deterministic Stellar Asset Contract wrapping native XLM on
      // testnet (Asset.native().contractId(testnetPassphrase) via
      // @stellar/stellar-sdk) - discovered by actually running this test,
      // not assumed up front.
      asset: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      // 100 stroops (0.00001 XLM) - smallest amount worth round-tripping, real money either way.
      amount: "100",
      payTo: merchantAddress!,
      maxTimeoutSeconds: 60,
      // Must match what the facilitator actually offers (its /supported
      // response's kinds[].extra) - the client-side scheme validates this,
      // discovered by running against the real facilitator rather than
      // assumed. A real seller would echo this from the facilitator it
      // points at; this fixture stands in for that.
      extra: { areFeesSponsored: true },
    };

    seller = await startLocalSeller(requirements);

    const config: Config = {
      DISCOVERY_URL: "http://localhost:4030",
      FACILITATOR_URL: facilitatorUrl!,
      NETWORK: "stellar:testnet",
      // Real Soroban RPC round trips, not unit-test speeds.
      RIALTO_SERVICE_TIMEOUT_MS: 25_000,
      FACILITATOR_SERVICE_TIMEOUT_MS: 25_000,
      SELLER_REQUEST_TIMEOUT_MS: 25_000,
      MCP_TRANSPORT: "stdio",
    };

    const resourceClient = new ResourceClient(config);
    const facilitatorClient = new FacilitatorClient(config);
    const signer = createEd25519Signer(buyerSecret!, "stellar:testnet");
    const exactScheme = createExactSchemeClient(signer);

    const result = await runPaymentFlow(
      { resourceClient, facilitatorClient, exactScheme },
      { url: seller.url, init: { method: "GET" } }
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ message: "paid content" });

    expect(result.receipt.network).toBe("stellar:testnet");
    expect(result.receipt.scheme).toBe("exact");
    expect(result.receipt.payTo).toBe(merchantAddress);
    expect(result.receipt.amount).toBe("100");
    expect(result.receipt.verified).toBe(false);
    expect(result.receipt.transaction).toMatch(/^[0-9a-f]{64}$/);
  });
});

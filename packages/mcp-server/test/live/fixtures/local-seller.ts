import { createServer, type Server } from "node:http";
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";

/**
 * A minimal, real x402 v2 seller for the live paid_call test - this repo
 * has no runnable example seller yet (examples/, packages/seller-sdk are
 * skeletons), so the live test needs something real to pay against.
 *
 * Deliberately does NOT call a facilitator's /verify or /settle itself:
 * Rialto's own payment-flow.ts calls those directly (the buyer-side
 * integrity boundary - see docs/discovery.md and packages/discovery/README.md
 * on not trusting a seller's own claims), so a spec-compliant seller only
 * needs to (1) declare a real 402 with real accepts[], and (2) serve
 * content once *a* payment signature is attached - this fixture does
 * exactly that and nothing more.
 */
export interface LocalSeller {
  url: string;
  requirements: PaymentRequirements;
  close: () => Promise<void>;
}

export async function startLocalSeller(requirements: PaymentRequirements): Promise<LocalSeller> {
  let resolvedUrl = "";

  const server: Server = createServer((req, res) => {
    const paymentSignature = req.headers["payment-signature"];

    if (typeof paymentSignature !== "string") {
      const body = JSON.stringify({ message: "payment required" });
      res.writeHead(402, {
        "content-type": "application/json",
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
          x402Version: 2,
          resource: { url: resolvedUrl },
          accepts: [requirements],
        }),
      });
      res.end(body);
      return;
    }

    // Decode to prove the header round-trips as a real x402 payload, not to
    // gate on it - verification is the facilitator's job, done by the buyer
    // directly, not by this fixture pretending to be a resource server SDK.
    decodePaymentSignatureHeader(paymentSignature);

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "paid content", servedAt: new Date().toISOString() }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("local seller failed to bind a port");
  }
  resolvedUrl = `http://127.0.0.1:${address.port}/forecast`;

  return {
    url: resolvedUrl,
    requirements,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

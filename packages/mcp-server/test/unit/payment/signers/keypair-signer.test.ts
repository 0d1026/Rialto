import { describe, expect, it } from "vitest";
import { createKeypairSigner } from "../../../../src/payment/signers/keypair-signer.js";
import type { Config } from "../../../../src/config.js";

// A syntactically valid, throwaway testnet keypair - never funded, never reused.
const TEST_SECRET = "SAHAC5R564VVHBZKNQIHQAPPI6GIQDYZGKTYZECHTTRSWA67D7NGZJLA";

const baseConfig: Config = {
  DISCOVERY_URL: "http://discovery.test",
  FACILITATOR_URL: "http://facilitator.test",
  NETWORK: "stellar:testnet",
  RIALTO_SERVICE_TIMEOUT_MS: 2_000,
  FACILITATOR_SERVICE_TIMEOUT_MS: 20_000,
  SELLER_REQUEST_TIMEOUT_MS: 10_000,
  MCP_TRANSPORT: "stdio",
};

describe("createKeypairSigner", () => {
  it("returns undefined when no key is configured - no throw at boot time", () => {
    expect(createKeypairSigner(baseConfig)).toBeUndefined();
  });

  it("returns a Signer built from the configured key when present", () => {
    const signer = createKeypairSigner({ ...baseConfig, BUYER_STELLAR_PRIVATE_KEY: TEST_SECRET });
    expect(signer).toBeDefined();
    expect(signer?.address).toMatch(/^G/);
    expect(typeof signer?.signAuthEntry).toBe("function");
  });
});

import { defineConfig } from "vitest/config";

// Separate config for the [LIVE] suite, mirroring packages/discovery's:
// real testnet, real running facilitator, real signing - generous timeout
// for actual Soroban RPC round trips instead of unit-test speeds.
export default defineConfig({
  test: {
    include: ["test/live/**/*.spec.ts"],
    testTimeout: 30_000,
  },
});

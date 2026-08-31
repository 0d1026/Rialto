import { Keypair } from '@stellar/stellar-sdk';
import { defineConfig } from 'vitest/config';

// Env is intentionally evaluated at module load in the production service.
process.env.FACILITATOR_STELLAR_PRIVATE_KEY ??= Keypair.random().secret();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
});

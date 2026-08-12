import { defineConfig } from 'vitest/config';

// Separate config for the [LIVE] suite: no local Postgres global setup, it
// talks to a real deployed instance over HTTP instead.
export default defineConfig({
  test: {
    include: ['test/live/**/*.spec.ts'],
    testTimeout: 20_000,
  },
});

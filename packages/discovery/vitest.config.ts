import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { LOG_LEVEL: 'silent' },
    globalSetup: ['./test/setup/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Every DB-backed spec shares one Postgres instance and truncates the
    // same tables between tests (test/setup/db.ts). Running spec files in
    // parallel both races CREATE TABLE IF NOT EXISTS on first connect
    // (Postgres's IF NOT EXISTS isn't atomic against concurrent DDL,
    // producing "duplicate key value violates ... pg_class_relname_nsp_index")
    // and lets one file's reset wipe another file's fixtures mid-test.
    fileParallelism: false,
    server: {
      // 08.regression-route-template.spec.ts imports @rialto/facilitator's
      // TS source directly (the only cross-package import in this suite,
      // deliberate: see that file's header comment). Without this, Vite
      // treats the workspace-linked package as an external, un-transformed
      // node_modules dependency and the .ts source never gets compiled.
      deps: {
        inline: [/@rialto\/facilitator/],
      },
    },
  },
});

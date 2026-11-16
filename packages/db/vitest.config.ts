import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // PGlite-backed tests that round-trip megabytes run close to vitest's 5 s test and 10 s hook
    // defaults on CI runners. A per-test timeout argument still overrides these.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: [
      {
        find: /^@semianalysisai\/inferencex-constants$/,
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
      {
        find: /^@semianalysisai\/inferencex-constants\//,
        replacement: `${path.resolve(__dirname, '../constants/src')}/`,
      },
    ],
  },
});

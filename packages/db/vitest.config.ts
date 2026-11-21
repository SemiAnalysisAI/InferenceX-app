import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/lib/test-pglite-template.ts'],
    // PGlite files are CPU-bound; one worker per vCPU starved them past the 5 s test timeout.
    maxWorkers: '50%',
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

import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@semianalysisai/inferencex-constants': path.resolve(__dirname, '../constants/src/index.ts'),
      '@semianalysisai/inferencex-db': path.resolve(__dirname, '../db/src'),
    },
  },
});

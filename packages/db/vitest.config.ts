import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@semianalysisai/inferencex-constants': path.resolve(__dirname, '../constants/src/index.ts'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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

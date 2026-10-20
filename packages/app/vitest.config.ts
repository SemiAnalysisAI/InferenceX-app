import { defineConfig } from 'vitest/config';
import path from 'path';

import { DEPLOYMENT_FLAG_NAMES } from './src/lib/config/deployment-flags';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup-local-storage.ts'],
    // test:unit loads the root .env; deployment values there must not change the defaults tests assert.
    env: Object.fromEntries(
      [...DEPLOYMENT_FLAG_NAMES, 'INFERENCEX_SOURCE_REPOS'].map((name) => [name, '']),
    ),
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/scripts/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: [
        'src/lib/d3-chart/layers/scatter-points.ts',
        'src/lib/d3-chart/layers/test-helpers.ts',
        'src/lib/d3-chart/D3Chart/D3Chart.tsx',
        'src/lib/d3-chart/D3Chart/useD3ChartRenderer.ts',
        'src/lib/d3-chart/D3Chart/layer-renderer.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/index.ts',
        '**/types.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

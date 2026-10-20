import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup-local-storage.ts'],
    // test:unit loads the root .env; extra source repos there must not change the lookups tests assert.
    env: { INFERENCEX_SOURCE_REPOS: '' },
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

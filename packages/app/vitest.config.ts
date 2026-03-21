import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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

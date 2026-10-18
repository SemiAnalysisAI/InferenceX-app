/**
 * Runs the unit suite with `hermiteInterpolate` swapped for the Handwired network
 * (src/lib/handwired/hermite-circuit.ts), including the calls made inside
 * interpolation.ts itself. Experimental, not part of CI:
 *
 *   bun run test:unit:handwired
 */
import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vitest.config';

const TARGET = /components\/calculator\/interpolation\.ts$/u;

export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      {
        name: 'handwired-hermite-swap',
        enforce: 'pre',
        transform(code, id) {
          if (!TARGET.test(id)) return null;
          const renamed = code.replace(
            'export function hermiteInterpolate(',
            'function hermiteInterpolateJs(',
          );
          if (renamed === code)
            throw new Error('handwired swap: hermiteInterpolate signature not found');
          return `${renamed}
import { hermiteInterpolateHandwired as __hw } from '@/lib/handwired/hermite-circuit';
export function hermiteInterpolate(xs: number[], ys: number[], m: number[], x: number): number {
  return __hw(xs, ys, m, x);
}
void hermiteInterpolateJs;
`;
        },
      },
    ],
  }),
);

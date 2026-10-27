import { expect, it } from 'vitest';
import { sizeAxisTicks } from './ubenchx-transform';

it('spaces binary-size labels independently of dense sample clusters', () => {
  expect(sizeAxisTicks(8, 17179869184)).toEqual([
    8, 256, 8192, 262144, 8388608, 268435456, 17179869184,
  ]);
  expect(sizeAxisTicks(4096, 4096)).toEqual([4096]);
  expect(() => sizeAxisTicks(0, 1024)).toThrow('Invalid');
});

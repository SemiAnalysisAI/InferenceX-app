import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { pointLabelText } from './point-label';

const point = { tp: 8, ep: 1, physicalChips: 4, conc: 16 } as InferenceData;

describe('independent point annotations', () => {
  it.each([
    [false, false, false, ''],
    [true, false, false, '4'],
    [false, true, false, 'TP8'],
    [true, true, false, '4\nTP8'],
    [false, false, true, 'C=16'],
    [true, false, true, '4\nC=16'],
    [false, true, true, 'TP8\nC=16'],
    [true, true, true, '4\nTP8\nC=16'],
  ] as const)(
    'GPU count=%s, parallelism=%s, concurrency=%s',
    (gpuCount, parallelism, concurrency, expected) => {
      expect(pointLabelText(point, gpuCount, parallelism, concurrency)).toBe(expected);
    },
  );
});

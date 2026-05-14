import { describe, expect, it } from 'vitest';

import { MAX_COMPARISON_GPUS, normalizeComparisonGpuList } from './normalize-comparison-gpus';

describe('normalizeComparisonGpuList', () => {
  it('returns empty for empty input', () => {
    expect(normalizeComparisonGpuList([])).toEqual([]);
  });

  it('dedupes and preserves order', () => {
    expect(normalizeComparisonGpuList(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it(`caps at ${MAX_COMPARISON_GPUS} distinct keys`, () => {
    expect(normalizeComparisonGpuList(['w', 'x', 'y', 'z', 'extra'])).toEqual(['w', 'x', 'y', 'z']);
  });

  it('skips empty strings', () => {
    expect(normalizeComparisonGpuList(['', 'h100', ''])).toEqual(['h100']);
  });
});

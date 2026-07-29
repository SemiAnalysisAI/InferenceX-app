import { describe, expect, it } from 'vitest';

import { chunkDerivedAgenticMetricIds } from './use-derived-agentic-metrics';

describe('chunkDerivedAgenticMetricIds', () => {
  it('keeps every id while respecting the API limit', () => {
    const ids = Array.from({ length: 401 }, (_, index) => index + 1);
    const chunks = chunkDerivedAgenticMetricIds(ids);

    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 1]);
    expect(chunks.flat()).toEqual(ids);
  });
});

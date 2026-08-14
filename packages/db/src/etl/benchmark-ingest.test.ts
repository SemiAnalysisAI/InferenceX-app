import { describe, expect, it } from 'vitest';

import { benchmarkPointIngestKey } from './benchmark-ingest';

const point = (recipeFingerprint: string | null) => ({
  configId: 7,
  benchmarkType: 'single_turn' as const,
  isl: 8192,
  osl: 1024,
  conc: 12,
  offloadMode: 'off',
  recipeFingerprint,
});

describe('benchmarkPointIngestKey', () => {
  it('keeps recipes at the same config and concurrency distinct', () => {
    expect(
      benchmarkPointIngestKey(
        point('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      ),
    ).not.toBe(
      benchmarkPointIngestKey(
        point('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      ),
    );
  });

  it('keeps one stable legacy identity for null fingerprints', () => {
    expect(benchmarkPointIngestKey(point(null))).toBe(benchmarkPointIngestKey(point(null)));
  });
});

import { describe, expect, it } from 'vitest';
import {
  bucketQuantile,
  presentHarnesses,
  topShares,
} from '@/lib/agentic-workload-explorer/harness-profile';

describe('bucketQuantile', () => {
  it('interpolates geometrically inside the bucket holding the quantile', () => {
    const rows = [
      { bucket: 30, count: 1 },
      { bucket: 40, count: 1 },
    ];
    expect(bucketQuantile(rows, 10, 0.5)).toBeCloseTo(10 ** 3.1);
    expect(bucketQuantile(rows, 10, 0.75)).toBeCloseTo(10 ** 4.05);
    expect(bucketQuantile([], 10, 0.5)).toBeNull();
  });
});

describe('topShares', () => {
  it('keeps the largest keys and folds the rest', () => {
    const out = topShares(
      [
        { key: 'a', count: 1 },
        { key: null, count: 6 },
        { key: 'b', count: 3 },
      ],
      2,
    );
    expect(out).toEqual([
      { key: null, count: 6, share: 0.6 },
      { key: 'b', count: 3, share: 0.3 },
      { key: 'other', count: 1, share: 0.1 },
    ]);
  });
});

describe('presentHarnesses', () => {
  it('returns harnesses in canonical order', () => {
    expect(
      presentHarnesses([{ harness: 'other' }, { harness: 'pi' }, { harness: 'claude-code' }]),
    ).toEqual(['claude-code', 'pi', 'other']);
  });
});

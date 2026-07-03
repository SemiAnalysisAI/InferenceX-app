import { describe, it, expect } from 'vitest';

import {
  buildComparisonDates,
  dedupeRowsToLatestPerConfig,
  filterByGPU,
  flipRooflineDirection,
} from './useChartData';

interface DedupeInput {
  id: number;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  precision: string;
  offload_mode?: string | null;
  date: string;
}

const drow = (over: Partial<DedupeInput> = {}): DedupeInput => ({
  id: 1,
  hardware: 'b300',
  framework: 'vllm',
  spec_method: 'none',
  disagg: false,
  precision: 'fp4',
  offload_mode: 'off',
  date: '2026-06-01',
  ...over,
});

describe('dedupeRowsToLatestPerConfig', () => {
  it('keeps only the latest date within a single series', () => {
    const rows = [
      drow({ id: 1, date: '2026-06-01' }),
      drow({ id: 2, date: '2026-06-03' }),
      drow({ id: 3, date: '2026-06-02' }),
    ];
    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([2]);
  });

  it('keeps BOTH offload variants even when they were ingested on different dates', () => {
    // The regression: offload=on sweep landed LATER than offload=off. Without
    // offload in the key, the on-variant's newer date would win the shared group
    // and silently drop the (older) off-variant series entirely.
    const rows = [
      drow({ id: 1, offload_mode: 'off', date: '2026-06-01' }),
      drow({ id: 2, offload_mode: 'on', date: '2026-06-05' }),
    ];
    const kept = dedupeRowsToLatestPerConfig(rows)
      .map((r) => r.offload_mode)
      .toSorted();
    expect(kept).toEqual(['off', 'on']);
  });

  it('still dedupes each offload variant to its own latest date', () => {
    const rows = [
      drow({ id: 1, offload_mode: 'off', date: '2026-06-01' }),
      drow({ id: 2, offload_mode: 'off', date: '2026-06-04' }),
      drow({ id: 3, offload_mode: 'on', date: '2026-06-02' }),
      drow({ id: 4, offload_mode: 'on', date: '2026-06-05' }),
    ];
    expect(
      dedupeRowsToLatestPerConfig(rows)
        .map((r) => r.id)
        .toSorted(),
    ).toEqual([2, 4]);
  });

  it('normalizes a missing offload_mode to "off" (matches the SQL lineKey)', () => {
    // A row with no offload_mode collides with an explicit offload=off row of the
    // same config — both are the "off" series, so latest-date dedup applies.
    const rows = [
      drow({ id: 1, offload_mode: undefined, date: '2026-06-01' }),
      drow({ id: 2, offload_mode: 'off', date: '2026-06-03' }),
    ];
    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([2]);
  });
});

describe('buildComparisonDates', () => {
  it('returns empty when no GPUs selected (comparison disabled)', () => {
    expect(
      buildComparisonDates([], ['2026-03-01'], { startDate: '', endDate: '' }, '2026-03-01'),
    ).toEqual([]);
  });

  it('excludes the main run date from comparisons', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-03-01', '2026-02-01'],
      { startDate: '', endDate: '' },
      '2026-03-01',
    );
    expect(result).toEqual(['2026-02-01']);
  });

  it('deduplicates dates appearing in both range and explicit list', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-03-01'],
      { startDate: '2026-02-01', endDate: '2026-03-01' },
      undefined,
    );
    expect(result).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('skips date range when only start is set', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-02-01'],
      { startDate: '2026-01-01', endDate: '' },
      undefined,
    );
    expect(result).toEqual(['2026-02-01']);
  });
});

describe('filterByGPU', () => {
  it('passes through all data when no GPUs selected', () => {
    expect(filterByGPU([{ hwKey: 'h100' }, { hwKey: 'a100' }], [], {})).toHaveLength(2);
  });

  it('resolves aliases to canonical GPU key', () => {
    const data = [{ hwKey: 'h100-sxm' }];
    const result = filterByGPU(data, ['h100'], { 'h100-sxm': 'h100' });
    expect(result).toHaveLength(1);
  });

  it('matches both direct keys and aliases in same dataset', () => {
    const data = [{ hwKey: 'h100' }, { hwKey: 'h100-sxm' }, { hwKey: 'a100' }];
    const result = filterByGPU(data, ['h100'], { 'h100-sxm': 'h100' });
    expect(result.map((d) => d.hwKey)).toEqual(['h100', 'h100-sxm']);
  });

  it('excludes when neither key nor alias matches', () => {
    expect(filterByGPU([{ hwKey: 'unknown' }], ['h100'], {})).toHaveLength(0);
  });
});

describe('flipRooflineDirection', () => {
  it('flips left/right while preserving upper/lower', () => {
    expect(flipRooflineDirection('upper_left')).toBe('upper_right');
    expect(flipRooflineDirection('lower_right')).toBe('lower_left');
  });

  it('double flip is identity', () => {
    for (const dir of ['upper_left', 'upper_right', 'lower_left', 'lower_right'] as const) {
      expect(flipRooflineDirection(flipRooflineDirection(dir))).toBe(dir);
    }
  });
});

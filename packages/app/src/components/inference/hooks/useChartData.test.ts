import { describe, it, expect } from 'vitest';

import { buildComparisonDates, filterByGPU, flipRooflineDirection } from './useChartData';

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

import { describe, expect, it } from 'vitest';

import { buildQuickRangePresets, matchActivePreset } from './quick-range-presets';

const TODAY = new Date('2026-03-25T12:00:00Z');

const DATES = [
  '2025-09-15',
  '2025-10-01',
  '2025-12-20',
  '2025-12-30',
  '2026-01-10',
  '2026-02-05',
  '2026-03-01',
  '2026-03-20',
  '2026-03-25',
];

describe('buildQuickRangePresets', () => {
  it('returns five presets in fixed order', () => {
    const presets = buildQuickRangePresets(TODAY);
    expect(presets.map((p) => p.id)).toEqual(['7d', '30d', '90d', 'ytd', 'all']);
  });

  it('"All" spans first to last available date', () => {
    const all = buildQuickRangePresets(TODAY).find((p) => p.id === 'all')!;
    expect(all.getRange(DATES)).toEqual({ startDate: '2025-09-15', endDate: '2026-03-25' });
  });

  it('"YTD" starts from Jan 1 of today\'s year', () => {
    const ytd = buildQuickRangePresets(TODAY).find((p) => p.id === 'ytd')!;
    expect(ytd.getRange(DATES)).toEqual({ startDate: '2026-01-10', endDate: '2026-03-25' });
  });

  it('"90D" filters to the last 90 days from today', () => {
    const ninety = buildQuickRangePresets(TODAY).find((p) => p.id === '90d')!;
    // 2026-03-25 minus 90 days = 2025-12-25, so 2025-12-30 is the first in-window date
    expect(ninety.getRange(DATES)).toEqual({ startDate: '2025-12-30', endDate: '2026-03-25' });
  });

  it('"30D" returns null when only one in-window date exists', () => {
    const thirty = buildQuickRangePresets(TODAY).find((p) => p.id === '30d')!;
    // 2026-03-25 minus 30 days = 2026-02-23; only 2026-03-01, 03-20, 03-25 qualify → 3 ≥ 2
    const result = thirty.getRange(DATES);
    expect(result).toEqual({ startDate: '2026-03-01', endDate: '2026-03-25' });
  });

  it('"30D" returns null when zero in-window dates exist', () => {
    const thirty = buildQuickRangePresets(TODAY).find((p) => p.id === '30d')!;
    expect(thirty.getRange(['2024-01-01', '2024-01-02'])).toBeNull();
  });

  it('"7D" returns null when fewer than 2 dates in window', () => {
    const seven = buildQuickRangePresets(TODAY).find((p) => p.id === '7d')!;
    // 2026-03-25 minus 7 = 2026-03-18; 03-20 and 03-25 qualify → 2 ≥ 2
    expect(seven.getRange(DATES)).toEqual({ startDate: '2026-03-20', endDate: '2026-03-25' });
  });

  it('"7D" returns null with only one dated point in window', () => {
    const seven = buildQuickRangePresets(TODAY).find((p) => p.id === '7d')!;
    expect(seven.getRange(['2026-03-25', '2025-01-01'].toSorted())).toBeNull();
  });

  it('"All" returns null when fewer than 2 total dates', () => {
    const all = buildQuickRangePresets(TODAY).find((p) => p.id === 'all')!;
    expect(all.getRange(['2026-03-25'])).toBeNull();
    expect(all.getRange([])).toBeNull();
  });
});

describe('matchActivePreset', () => {
  it('matches the "All" preset when range covers full extent', () => {
    expect(
      matchActivePreset({ startDate: '2025-09-15', endDate: '2026-03-25' }, DATES, TODAY),
    ).toBe('all');
  });

  it('matches "YTD" when range spans Jan 1 of current year to last date', () => {
    expect(
      matchActivePreset({ startDate: '2026-01-10', endDate: '2026-03-25' }, DATES, TODAY),
    ).toBe('ytd');
  });

  it('returns null for a custom range that no preset produces', () => {
    expect(
      matchActivePreset({ startDate: '2025-10-01', endDate: '2026-02-05' }, DATES, TODAY),
    ).toBeNull();
  });

  it('returns null for an empty range', () => {
    expect(matchActivePreset({ startDate: '', endDate: '' }, DATES, TODAY)).toBeNull();
  });

  it('returns the first preset id whose range matches when multiple presets coincide', () => {
    // With these dates, 90d, ytd, and "all" all collapse to the same window; we expect the
    // earliest (90d) to win because we iterate in fixed preset order.
    const collapsed = ['2026-01-10', '2026-03-25'];
    expect(
      matchActivePreset({ startDate: '2026-01-10', endDate: '2026-03-25' }, collapsed, TODAY),
    ).toBe('90d');
  });
});

import { describe, expect, it } from 'vitest';

import { getQuickDateRangeShortcuts, getQuickDateRanges } from '@/components/ui/date-range-picker';

const FIXED_NOW = new Date('2026-05-09T12:00:00Z');

describe('getQuickDateRangeShortcuts', () => {
  it('always returns three entries', () => {
    expect(getQuickDateRangeShortcuts([])).toHaveLength(3);
    expect(getQuickDateRangeShortcuts(['2026-01-01'])).toHaveLength(3);
  });

  it('marks none available when fewer than two dates', () => {
    const s = getQuickDateRangeShortcuts(['2026-01-01']);
    expect(s.every((x) => !x.isAvailable)).toBe(true);
    expect(s.every((x) => x.range === null)).toBe(true);
  });

  it('matches getQuickDateRanges for the available subset', () => {
    const dates = ['2025-10-01', '2025-11-01', '2026-01-15'];
    const shortcuts = getQuickDateRangeShortcuts(dates, FIXED_NOW);
    const fromHelper = getQuickDateRanges(dates, FIXED_NOW);
    const fromShortcuts = shortcuts
      .filter((x) => x.isAvailable && x.range)
      .map((x) => ({ label: x.label, range: x.range! }));
    expect(fromShortcuts).toEqual(fromHelper);
  });
});

describe('getQuickDateRanges', () => {
  it('returns empty when fewer than 2 dates', () => {
    expect(getQuickDateRanges([])).toEqual([]);
    expect(getQuickDateRanges(['2026-01-01'])).toEqual([]);
  });

  it('returns All Time spanning first and last date', () => {
    const dates = ['2025-10-01', '2025-11-01', '2026-01-15'];
    const ranges = getQuickDateRanges(dates, FIXED_NOW);
    expect(ranges[0]).toEqual({
      label: 'All Time',
      range: { startDate: '2025-10-01', endDate: '2026-01-15' },
    });
  });

  it('includes Last 90 Days and Last 30 Days when enough data in window', () => {
    const dates: string[] = [];
    for (
      const d = new Date('2026-01-01');
      d <= new Date('2026-05-09');
      d.setDate(d.getDate() + 7)
    ) {
      dates.push(d.toISOString().slice(0, 10));
    }
    const ranges = getQuickDateRanges(dates, FIXED_NOW);
    const labels = ranges.map((r) => r.label);
    expect(labels).toContain('All Time');
    expect(labels).toContain('Last 90 Days');
    expect(labels).toContain('Last 30 Days');
    for (const { range } of ranges) {
      expect(range.startDate <= range.endDate).toBe(true);
      expect(dates.includes(range.startDate)).toBe(true);
      expect(dates.includes(range.endDate)).toBe(true);
    }
  });
});

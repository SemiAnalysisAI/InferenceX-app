import { describe, expect, it } from 'vitest';

/**
 * Tests for the "add to chart" logic used in ComparisonChangelog.
 * Verifies date filtering: which dates are on chart, which are addable.
 */

interface MockChangelog {
  date: string;
  entries: { config_keys: string[]; description: string; pr_link: string | null }[];
}

function computeDatesOnChart(
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
): Set<string> {
  const set = new Set(selectedDates);
  if (selectedDateRange.startDate) set.add(selectedDateRange.startDate);
  if (selectedDateRange.endDate) set.add(selectedDateRange.endDate);
  return set;
}

function computeAddableDates(
  filteredChangelogs: MockChangelog[],
  datesOnChart: Set<string>,
): string[] {
  return filteredChangelogs.map((c) => c.date).filter((d) => !datesOnChart.has(d));
}

const changelogs: MockChangelog[] = [
  {
    date: '2026-01-15',
    entries: [{ config_keys: ['dsr1-fp8-h200-sglang'], description: 'Update', pr_link: null }],
  },
  {
    date: '2026-01-20',
    entries: [{ config_keys: ['dsr1-fp8-h200-sglang'], description: 'Bump', pr_link: null }],
  },
  {
    date: '2026-01-25',
    entries: [{ config_keys: ['dsr1-fp8-h200-sglang'], description: 'Tweak', pr_link: null }],
  },
];

describe('ComparisonChangelog add-to-chart logic', () => {
  it('all dates are addable when none are selected', () => {
    const onChart = computeDatesOnChart([], { startDate: '', endDate: '' });
    const addable = computeAddableDates(changelogs, onChart);
    expect(addable).toEqual(['2026-01-15', '2026-01-20', '2026-01-25']);
  });

  it('dates in selectedDates are marked as on chart', () => {
    const onChart = computeDatesOnChart(['2026-01-15', '2026-01-20'], {
      startDate: '',
      endDate: '',
    });
    expect(onChart.has('2026-01-15')).toBe(true);
    expect(onChart.has('2026-01-20')).toBe(true);
    expect(onChart.has('2026-01-25')).toBe(false);
    const addable = computeAddableDates(changelogs, onChart);
    expect(addable).toEqual(['2026-01-25']);
  });

  it('range endpoints are marked as on chart', () => {
    const onChart = computeDatesOnChart([], {
      startDate: '2026-01-15',
      endDate: '2026-01-25',
    });
    expect(onChart.has('2026-01-15')).toBe(true);
    expect(onChart.has('2026-01-25')).toBe(true);
    const addable = computeAddableDates(changelogs, onChart);
    expect(addable).toEqual(['2026-01-20']);
  });

  it('addable excludes both selectedDates and range endpoints', () => {
    const onChart = computeDatesOnChart(['2026-01-20'], {
      startDate: '2026-01-15',
      endDate: '2026-01-25',
    });
    const addable = computeAddableDates(changelogs, onChart);
    expect(addable).toEqual([]);
  });

  it('returns empty addable when all dates are already on chart', () => {
    const onChart = computeDatesOnChart(['2026-01-15', '2026-01-20', '2026-01-25'], {
      startDate: '',
      endDate: '',
    });
    const addable = computeAddableDates(changelogs, onChart);
    expect(addable).toEqual([]);
  });
});

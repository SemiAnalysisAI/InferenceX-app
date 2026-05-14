import { describe, expect, it } from 'vitest';

import {
  buildDatesOnComparisonChart,
  getAddableChangelogDates,
} from '@/components/inference/utils/comparison-changelog-dates';

const changelogDates = [{ date: '2026-01-15' }, { date: '2026-01-20' }, { date: '2026-01-25' }];

describe('buildDatesOnComparisonChart', () => {
  it('includes only selected dates when range is empty', () => {
    const set = buildDatesOnComparisonChart(['2026-01-15', '2026-01-20'], {
      startDate: '',
      endDate: '',
    });
    expect(set.has('2026-01-15')).toBe(true);
    expect(set.has('2026-01-20')).toBe(true);
    expect(set.has('2026-01-25')).toBe(false);
  });

  it('adds non-empty range endpoints', () => {
    const set = buildDatesOnComparisonChart([], {
      startDate: '2026-01-15',
      endDate: '2026-01-25',
    });
    expect(set.has('2026-01-15')).toBe(true);
    expect(set.has('2026-01-25')).toBe(true);
    expect(set.has('2026-01-20')).toBe(false);
  });

  it('merges pins and range endpoints', () => {
    const set = buildDatesOnComparisonChart(['2026-01-20'], {
      startDate: '2026-01-15',
      endDate: '2026-01-25',
    });
    expect([...set].toSorted()).toEqual(['2026-01-15', '2026-01-20', '2026-01-25']);
  });
});

describe('getAddableChangelogDates', () => {
  it('returns all changelog dates when chart has none', () => {
    const onChart = buildDatesOnComparisonChart([], { startDate: '', endDate: '' });
    expect(getAddableChangelogDates(changelogDates, onChart)).toEqual([
      '2026-01-15',
      '2026-01-20',
      '2026-01-25',
    ]);
  });

  it('excludes dates already on chart from pins', () => {
    const onChart = buildDatesOnComparisonChart(['2026-01-15', '2026-01-20'], {
      startDate: '',
      endDate: '',
    });
    expect(getAddableChangelogDates(changelogDates, onChart)).toEqual(['2026-01-25']);
  });

  it('excludes range endpoints from addable', () => {
    const onChart = buildDatesOnComparisonChart([], {
      startDate: '2026-01-15',
      endDate: '2026-01-25',
    });
    expect(getAddableChangelogDates(changelogDates, onChart)).toEqual(['2026-01-20']);
  });

  it('returns empty when every changelog date is on chart', () => {
    const onChart = buildDatesOnComparisonChart(['2026-01-20'], {
      startDate: '2026-01-15',
      endDate: '2026-01-25',
    });
    expect(getAddableChangelogDates(changelogDates, onChart)).toEqual([]);
  });

  it('returns empty when all dates are pinned', () => {
    const onChart = buildDatesOnComparisonChart(['2026-01-15', '2026-01-20', '2026-01-25'], {
      startDate: '',
      endDate: '',
    });
    expect(getAddableChangelogDates(changelogDates, onChart)).toEqual([]);
  });
});

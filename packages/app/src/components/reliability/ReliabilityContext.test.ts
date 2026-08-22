import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReliabilityRow } from '@/lib/api';

import { aggregateByDateRange } from './ReliabilityContext';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function row(hardware: string, date: string, n_success = 1, total = 2): ReliabilityRow {
  return { hardware, date, n_success, total };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('aggregateByDateRange', () => {
  it('preserves the existing fixture totals and rounded rates in every window', () => {
    const result = aggregateByDateRange([
      row('a', '2026-08-20T12:00:00.000Z', 3, 4),
      row('a', '2026-08-17T12:00:00.000Z', 1, 2),
      row('a', '2026-08-17T11:59:59.999Z', 2, 2),
      row('a', '2026-08-13T12:00:00.000Z', 0, 2),
      row('a', '2026-07-21T12:00:00.000Z', 4, 4),
      row('a', '2026-05-22T12:00:00.000Z', 1, 4),
      row('a', '2026-05-22T11:59:59.999Z', 2, 4),
      row('b', '2026-08-19T12:00:00.000Z', 5, 10),
      row('zero-total', '2026-08-20T12:00:00.000Z', 0, 0),
    ]);

    expect(result).toEqual({
      'last-3-days': {
        a: { rate: 66.67, total: 6, n_success: 4 },
        b: { rate: 50, total: 10, n_success: 5 },
      },
      'last-7-days': {
        a: { rate: 60, total: 10, n_success: 6 },
        b: { rate: 50, total: 10, n_success: 5 },
      },
      'last-month': {
        a: { rate: 71.43, total: 14, n_success: 10 },
        b: { rate: 50, total: 10, n_success: 5 },
      },
      'last-3-months': {
        a: { rate: 61.11, total: 18, n_success: 11 },
        b: { rate: 50, total: 10, n_success: 5 },
      },
      'all-time': {
        a: { rate: 59.09, total: 22, n_success: 13 },
        b: { rate: 50, total: 10, n_success: 5 },
      },
    });
  });

  it('includes exact cutoffs and excludes dates one millisecond before them', () => {
    const result = aggregateByDateRange([
      row('exact-3', '2026-08-17T12:00:00.000Z'),
      row('before-3', '2026-08-17T11:59:59.999Z'),
      row('date-only-3', '2026-08-17'),
      row('exact-7', '2026-08-13T12:00:00.000Z'),
      row('before-7', '2026-08-13T11:59:59.999Z'),
      row('exact-30', '2026-07-21T12:00:00.000Z'),
      row('before-30', '2026-07-21T11:59:59.999Z'),
      row('exact-90', '2026-05-22T12:00:00.000Z'),
      row('before-90', '2026-05-22T11:59:59.999Z'),
    ]);

    expect(Object.keys(result['last-3-days'])).toEqual(['exact-3']);
    expect(Object.keys(result['last-7-days'])).toEqual([
      'exact-3',
      'before-3',
      'date-only-3',
      'exact-7',
    ]);
    expect(Object.keys(result['last-month'])).toEqual([
      'exact-3',
      'before-3',
      'date-only-3',
      'exact-7',
      'before-7',
      'exact-30',
    ]);
    expect(Object.keys(result['last-3-months'])).toEqual([
      'exact-3',
      'before-3',
      'date-only-3',
      'exact-7',
      'before-7',
      'exact-30',
      'before-30',
      'exact-90',
    ]);
    expect(Object.keys(result['all-time'])).toEqual([
      'exact-3',
      'before-3',
      'date-only-3',
      'exact-7',
      'before-7',
      'exact-30',
      'before-30',
      'exact-90',
      'before-90',
    ]);
  });
});

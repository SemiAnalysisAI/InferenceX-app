import { describe, expect, it } from 'vitest';

import type { ReliabilityRow } from '@/lib/api';

import { aggregateByDateRange, DEFAULT_RELIABILITY_RANGE, RELIABILITY_RANGES } from './aggregate';

const DAY_MS = 86_400_000;
// Fixed reference clock so bucket membership is deterministic.
const NOW = new Date('2026-08-27T12:00:00Z').getTime();

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString().slice(0, 10);
}

function row(hardware: string, date: string, n_success: number, total: number): ReliabilityRow {
  return { hardware, date, n_success, total };
}

describe('aggregateByDateRange', () => {
  it('exposes the dashboard presets with last-3-months as default', () => {
    expect(RELIABILITY_RANGES).toEqual([
      'last-3-days',
      'last-7-days',
      'last-month',
      'last-3-months',
      'all-time',
    ]);
    expect(DEFAULT_RELIABILITY_RANGE).toBe('last-3-months');
  });

  it('buckets rows into every range at or after their date', () => {
    const rows = [
      row('b200_trtllm', daysAgo(1), 9, 10),
      row('b200_trtllm', daysAgo(5), 5, 10),
      row('b200_trtllm', daysAgo(20), 10, 10),
      row('b200_trtllm', daysAgo(60), 0, 10),
      row('b200_trtllm', daysAgo(200), 10, 10),
    ];
    const result = aggregateByDateRange(rows, NOW);

    expect(result['last-3-days'].b200_trtllm).toEqual({ rate: 90, n_success: 9, total: 10 });
    expect(result['last-7-days'].b200_trtllm).toEqual({ rate: 70, n_success: 14, total: 20 });
    expect(result['last-month'].b200_trtllm).toEqual({ rate: 80, n_success: 24, total: 30 });
    expect(result['last-3-months'].b200_trtllm).toEqual({ rate: 60, n_success: 24, total: 40 });
    expect(result['all-time'].b200_trtllm).toEqual({ rate: 68, n_success: 34, total: 50 });
  });

  it('rounds success rates to 2 decimal places', () => {
    const result = aggregateByDateRange([row('h200_sxm', daysAgo(1), 1, 3)], NOW);
    expect(result['all-time'].h200_sxm.rate).toBe(33.33);
  });

  it('omits hardware with zero totals and keeps hardware separate', () => {
    const result = aggregateByDateRange(
      [row('h200_sxm', daysAgo(1), 1, 1), row('mi355x_sglang', daysAgo(1), 0, 0)],
      NOW,
    );
    expect(result['all-time'].h200_sxm).toBeDefined();
    expect(result['all-time'].mi355x_sglang).toBeUndefined();
  });

  it('excludes rows older than the range cutoff', () => {
    const result = aggregateByDateRange([row('h200_sxm', daysAgo(10), 5, 10)], NOW);
    expect(result['last-7-days'].h200_sxm).toBeUndefined();
    expect(result['last-month'].h200_sxm).toEqual({ rate: 50, n_success: 5, total: 10 });
  });

  it('returns empty buckets for empty input', () => {
    const result = aggregateByDateRange([], NOW);
    for (const range of RELIABILITY_RANGES) {
      expect(result[range]).toEqual({});
    }
  });
});

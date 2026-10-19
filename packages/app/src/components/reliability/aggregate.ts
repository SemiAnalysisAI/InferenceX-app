import type { ReliabilityRow } from '@/lib/api/api';

import type { DateRangeSuccessRateData } from './types';

export const RELIABILITY_RANGES = [
  'last-3-days',
  'last-7-days',
  'last-month',
  'last-3-months',
  'all-time',
] as const;

export type ReliabilityRange = (typeof RELIABILITY_RANGES)[number];

export const DEFAULT_RELIABILITY_RANGE: ReliabilityRange = 'last-3-months';

const DAY_MS = 86_400_000;

const RANGE_CUTOFF_DAYS: Readonly<Record<ReliabilityRange, number | null>> = {
  'last-3-days': 3,
  'last-7-days': 7,
  'last-month': 30,
  'last-3-months': 90,
  'all-time': null,
};

export function aggregateByDateRange(
  rows: ReliabilityRow[],
  nowMs: number = Date.now(),
): DateRangeSuccessRateData {
  const cutoffs = RELIABILITY_RANGES.map((range) => {
    const days = RANGE_CUTOFF_DAYS[range];
    return [range, days === null ? null : nowMs - days * DAY_MS] as const;
  });
  const aggregates = Object.fromEntries(
    RELIABILITY_RANGES.map((range) => [
      range,
      {} as Record<string, { n_success: number; total: number }>,
    ]),
  ) as Record<ReliabilityRange, Record<string, { n_success: number; total: number }>>;

  for (const row of rows) {
    const rowTime = new Date(row.date).getTime();
    for (const [range, cutoff] of cutoffs) {
      if (cutoff !== null && rowTime < cutoff) continue;
      aggregates[range][row.hardware] ??= { n_success: 0, total: 0 };
      const stats = aggregates[range][row.hardware];
      stats.n_success += row.n_success;
      stats.total += row.total;
    }
  }

  const result: DateRangeSuccessRateData = {};
  for (const range of RELIABILITY_RANGES) {
    result[range] = {};
    for (const [hardware, stats] of Object.entries(aggregates[range])) {
      if (stats.total === 0) continue;
      result[range][hardware] = {
        rate: Math.round((stats.n_success / stats.total) * 10000) / 100,
        total: stats.total,
        n_success: stats.n_success,
      };
    }
  }

  return result;
}

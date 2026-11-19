import { describe, expect, it } from 'vitest';

import type { ReliabilityRow } from '@/lib/api/api';

import reliabilityFixture from '../../../cypress/fixtures/api/reliability.json';
import { aggregateByDateRange } from './aggregate';
import { sumReliabilityByDay } from './daily-totals';

const DAY_MS = 86_400_000;
const rawRows: ReliabilityRow[] = reliabilityFixture;

describe('sumReliabilityByDay', () => {
  it('gives the dashboard the same per-range rates as the raw rows', () => {
    const daily = sumReliabilityByDay(rawRows);
    expect(daily.length).toBeLessThan(rawRows.length / 2);

    const latest = Math.max(...rawRows.map((row) => Date.parse(row.date)));
    for (const daysAfterLatest of [0.5, 2, 4, 8, 31, 95, 400]) {
      const now = latest + daysAfterLatest * DAY_MS;
      expect(aggregateByDateRange(daily, now)).toEqual(aggregateByDateRange(rawRows, now));
    }
  });

  it('sums per date and GPU and drops only days that add nothing', () => {
    const rows: ReliabilityRow[] = [
      { hardware: 'h100', date: '2026-01-02', n_success: 3, total: 4 },
      { hardware: 'h200', date: '2026-01-02', n_success: 1, total: 1 },
      { hardware: 'h100', date: '2026-01-02', n_success: 0, total: 2 },
      { hardware: 'h100', date: '2026-01-01', n_success: 1, total: 0 },
      { hardware: 'b200', date: '2026-01-01', n_success: 0, total: 0 },
    ];
    expect(sumReliabilityByDay(rows)).toEqual([
      { hardware: 'h100', date: '2026-01-02', n_success: 3, total: 6 },
      { hardware: 'h200', date: '2026-01-02', n_success: 1, total: 1 },
      { hardware: 'h100', date: '2026-01-01', n_success: 1, total: 0 },
    ]);
    expect(rows[0]).toEqual({ hardware: 'h100', date: '2026-01-02', n_success: 3, total: 4 });
  });
});

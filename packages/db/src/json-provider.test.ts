import { describe, expect, it } from 'vitest';

import { compareBenchmarkRecency } from './json-provider.js';

/**
 * `compareBenchmarkRecency` is the shared dedup ordering used by both the SQL
 * date-filtered query (ORDER BY br.date DESC, wr.run_started_at DESC NULLS LAST)
 * and the JSON provider's getLatestBenchmarks. A negative result means `a` sorts
 * before `b`, so `a` is the more-recent record kept by DISTINCT ON.
 *
 * Regression guard for the same-day multi-run bug: when a config is swept more
 * than once on the same calendar day, the later sweep (greater run_started_at)
 * must win — otherwise the earlier run's points shadow the re-sweep on the chart.
 */
describe('compareBenchmarkRecency', () => {
  const later = '2026-06-14T06:43:25Z';
  const earlier = '2026-06-14T04:08:16Z';

  it('orders a more recent calendar day first regardless of run_started_at', () => {
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-13', earlier, later)).toBeLessThan(0);
    expect(compareBenchmarkRecency('2026-06-13', '2026-06-14', later, earlier)).toBeGreaterThan(0);
  });

  it('tiebreaks same-day sweeps by run_started_at (latest sweep wins)', () => {
    // a = later sweep → a should sort first (negative).
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-14', later, earlier)).toBeLessThan(0);
    // a = earlier sweep → a should sort after (positive).
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-14', earlier, later)).toBeGreaterThan(0);
  });

  it('sorts a null run_started_at last on a same-day tie', () => {
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-14', null, earlier)).toBeGreaterThan(0);
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-14', earlier, null)).toBeLessThan(0);
  });

  it('treats equal date and equal run_started_at as a tie', () => {
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-14', later, later)).toBe(0);
    expect(compareBenchmarkRecency('2026-06-14', '2026-06-14', null, null)).toBe(0);
  });

  it('keeps the latest sweep first when sorting a same-day candidate list', () => {
    interface Row {
      run: string;
      started: string | null;
    }
    const rows: Row[] = [
      { run: 'old', started: earlier },
      { run: 'new', started: later },
      { run: 'unknown', started: null },
    ];
    rows.sort((a, b) => compareBenchmarkRecency('2026-06-14', '2026-06-14', a.started, b.started));
    expect(rows.map((r) => r.run)).toEqual(['new', 'old', 'unknown']);
  });
});

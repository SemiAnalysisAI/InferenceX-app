import { describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';
import { getAllBenchmarksForHistory, getLatestBenchmarks } from './benchmarks.js';

/**
 * A {@link DbClient} stand-in that records every SQL template it is handed and
 * resolves to an empty result set. Lets us assert on the *generated SQL* without
 * a live database — in particular that the read path never names the optional
 * `workers` column directly.
 *
 * Joining the template's static segments with a ` ? ` placeholder reconstructs
 * the literal SQL (interpolated values like model keys / dates become `?`),
 * which is all we need to substring-match the column selection.
 */
function makeRecordingSql(): { sql: DbClient; sqlText: () => string } {
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    queries.push(strings.join(' ? '));
    return Promise.resolve([]);
  }) as DbClient;
  return { sql, sqlText: () => queries.join('\n') };
}

/**
 * Regression guard for the #405 fallout: the read queries must surface `workers`
 * via `to_jsonb(row) -> 'workers'`, NOT a bare `br.workers` / `lb.workers`. A bare
 * column reference fails to plan ("column \"workers\" does not exist") when migration
 * 006 hasn't been applied, which 500s every cache-miss request to /api/v1/benchmarks.
 * The to_jsonb form returns null for the absent column and lets the endpoint keep
 * serving everything else.
 */
describe('benchmark read queries — workers column tolerance', () => {
  it('getLatestBenchmarks (no-date / materialized-view branch) does not reference lb.workers directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getLatestBenchmarks(sql, 'dsr1');
    const text = sqlText();
    expect(text).toContain("to_jsonb(lb) -> 'workers'");
    expect(text).not.toMatch(/\blb\.workers\b/u);
  });

  it('getLatestBenchmarks (date-filtered / base-table branch) does not reference br.workers directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getLatestBenchmarks(sql, 'dsr1', '2026-01-01');
    const text = sqlText();
    expect(text).toContain("to_jsonb(br) -> 'workers'");
    expect(text).not.toMatch(/\bbr\.workers\b/u);
  });

  it('getAllBenchmarksForHistory does not reference br.workers directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getAllBenchmarksForHistory(sql, 'dsr1', 1024, 1024);
    const text = sqlText();
    expect(text).toContain("to_jsonb(br) -> 'workers'");
    expect(text).not.toMatch(/\bbr\.workers\b/u);
  });
});

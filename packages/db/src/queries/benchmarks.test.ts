import { describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';
import {
  getAllBenchmarksForHistory,
  getBenchmarksForRun,
  getLatestBenchmarks,
} from './benchmarks.js';

/**
 * A {@link DbClient} stand-in that records every SQL template it is handed and
 * resolves to an empty result set. Lets us assert on the *generated SQL* without
 * a live database — in particular that the read path never names the optional
 * `kv_transfer_lib` column directly.
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
 * Regression guard for the migration-008 rollout (same failure mode as the
 * migration-006 `workers` rollout, PR #405): migrations are applied manually
 * (pnpm admin:db:migrate), separately from the Vercel deploy, so read queries
 * must surface `kv_transfer_lib` via `to_jsonb(row) ->> 'kv_transfer_lib'`,
 * NOT a bare `br.kv_transfer_lib` / `lb.kv_transfer_lib`. A bare column
 * reference fails to plan ("column does not exist") on a pre-migration DB,
 * which 500s every cache-miss request to /api/v1/benchmarks and blanks the
 * dashboard. The to_jsonb form returns null for the absent column and behaves
 * identically once the column exists.
 */
describe('benchmark read queries — kv_transfer_lib column tolerance', () => {
  it('getLatestBenchmarks (no-date / materialized-view branch) does not reference lb.kv_transfer_lib directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getLatestBenchmarks(sql, 'dsr1');
    const text = sqlText();
    expect(text).toContain("to_jsonb(lb) ->> 'kv_transfer_lib'");
    expect(text).not.toMatch(/\blb\.kv_transfer_lib\b/u);
  });

  it('getLatestBenchmarks (date-filtered / base-table branch) does not reference br.kv_transfer_lib directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getLatestBenchmarks(sql, 'dsr1', '2026-01-01');
    const text = sqlText();
    expect(text).toContain("to_jsonb(br) ->> 'kv_transfer_lib'");
    expect(text).not.toMatch(/\bbr\.kv_transfer_lib\b/u);
  });

  it('getBenchmarksForRun does not reference br.kv_transfer_lib directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getBenchmarksForRun(sql, 'dsr1', 123456);
    const text = sqlText();
    expect(text).toContain("to_jsonb(br) ->> 'kv_transfer_lib'");
    expect(text).not.toMatch(/\bbr\.kv_transfer_lib\b/u);
  });

  it('getAllBenchmarksForHistory does not reference br.kv_transfer_lib directly', async () => {
    const { sql, sqlText } = makeRecordingSql();
    await getAllBenchmarksForHistory(sql, 'dsr1', 1024, 1024);
    const text = sqlText();
    expect(text).toContain("to_jsonb(br) ->> 'kv_transfer_lib'");
    expect(text).not.toMatch(/\bbr\.kv_transfer_lib\b/u);
  });
});

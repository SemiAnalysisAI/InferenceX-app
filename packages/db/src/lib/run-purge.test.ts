import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import type { Sql } from '../etl/db-utils';
import { deleteStaleAvailability, purgeBenchmarkResults, purgeRuns } from './run-purge';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';
import {
  type Row,
  type Snapshot,
  seedRunFixture,
  snapshotRunTables,
  withoutRows,
} from './test-run-fixture';

let db: PGlite;
let sql: PgliteSql;
let before: Snapshot;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await seedRunFixture(db);
  before = await snapshotRunTables(db);
});

const availabilityKey = (row: Row) =>
  `${row.framework}/${row.spec_method}/${row.isl}/${row.osl}/${row.benchmark_type}/${row.date}`;

// Production callers hand these functions a transaction the same way.
const inTransaction = (fn: (tx: Sql) => Promise<void>) =>
  sql.begin((tx) => fn(tx as unknown as Sql));
const purge = (ids: number[]) => inTransaction((tx) => purgeRuns(tx, ids));

async function rowCounts(): Promise<Record<string, number>> {
  const snapshot = await snapshotRunTables(db);
  return Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, rows.length]));
}

const availabilityRow = (overrides: Row = {}): Row => ({
  model: 'dsr1',
  isl: 1024,
  osl: 1024,
  precision: 'fp4',
  hardware: 'b200',
  framework: 'sglang',
  spec_method: 'none',
  disagg: false,
  date: '2026-09-01',
  ...overrides,
});

describe('purgeRuns', () => {
  it('deletes exactly the target run and what only it referenced', async () => {
    await purge([1]);

    const removed = new Set([
      'vllm/none/8192/1024/single_turn/2026-09-01',
      'sglang/mtp/null/null/agentic_traces/2026-09-01',
    ]);
    expect(await snapshotRunTables(db)).toEqual(
      withoutRows(before, {
        workflow_runs: (r) => r.id === 1,
        benchmark_results: (r) => r.workflow_run_id === 1,
        run_stats: (r) => r.workflow_run_id === 1,
        eval_results: (r) => r.workflow_run_id === 1,
        eval_samples: (r) => r.eval_result_id === 1,
        changelog_entries: (r) => r.workflow_run_id === 1,
        server_logs: (r) => r.id === 1,
        agentic_trace_replay: (r) => r.id === 1,
        availability: (r) => removed.has(availabilityKey(r)),
        gpu_metric_series: (r) => r.workflow_run_id === 1,
        benchmark_result_gpu_metrics: (r) => r.series_id === 1,
        run_datasets: (r) => r.workflow_run_id === 1,
      }),
    );
  });

  it('removes exact row counts from each table', async () => {
    const start = await rowCounts();
    await purge([1]);
    const end = await rowCounts();
    expect(
      Object.fromEntries(Object.keys(start).map((table) => [table, start[table] - end[table]])),
    ).toEqual({
      configs: 0,
      workflow_runs: 1,
      benchmark_results: 5,
      run_stats: 1,
      eval_results: 1,
      eval_samples: 2,
      changelog_entries: 1,
      server_logs: 1,
      agentic_trace_replay: 1,
      availability: 2,
      gpu_metric_series: 1,
      benchmark_result_gpu_metrics: 2,
      run_datasets: 1,
    });
  });

  it('is idempotent', async () => {
    await purge([1]);
    const once = await snapshotRunTables(db);
    await purge([1]);
    expect(await snapshotRunTables(db)).toEqual(once);
  });

  it('changes nothing for an empty target or ids that match no run', async () => {
    await purge([]);
    await purge([999, 10]);
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('keeps shared availability, logs and traces until the last run holding them goes', async () => {
    await purge([1, 3]);
    const after = await snapshotRunTables(db);
    expect(after.server_logs).toEqual([]);
    expect(after.agentic_trace_replay).toEqual([]);
    // Run 2 still holds the c1 1024/1024 key on 2026-09-01, run 4 the 2026-09-02 key.
    expect(after.availability.map(availabilityKey).toSorted()).toEqual([
      'sglang/none/1024/1024/single_turn/2026-09-01',
      'sglang/none/1024/1024/single_turn/2026-09-02',
    ]);
    expect(after.workflow_runs.map((r) => r.id)).toEqual([2, 4]);
  });

  it('rolls back every delete when a later statement fails', async () => {
    await expect(
      inTransaction(async (tx) => {
        await purgeRuns(tx, [1]);
        throw new Error('later failure');
      }),
    ).rejects.toThrow('later failure');
    expect(await snapshotRunTables(db)).toEqual(before);
  });
});

describe('purgeBenchmarkResults', () => {
  it('deletes only the named points and keeps the run, its series and shared logs', async () => {
    await inTransaction((tx) => purgeBenchmarkResults(tx, [2, 3]));

    expect(await snapshotRunTables(db)).toEqual(
      withoutRows(before, {
        benchmark_results: (r) => r.id === 2 || r.id === 3,
        benchmark_result_gpu_metrics: (r) => r.benchmark_result_id === 2,
        availability: (r) => availabilityKey(r) === 'vllm/none/8192/1024/single_turn/2026-09-01',
      }),
    );
  });

  it('changes nothing for no ids', async () => {
    await inTransaction((tx) => purgeBenchmarkResults(tx, []));
    expect(await snapshotRunTables(db)).toEqual(before);
  });
});

describe('deleteStaleAvailability', () => {
  it('changes nothing for no keys', async () => {
    await deleteStaleAvailability(sql, []);
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('keeps a key that a successful benchmark row still holds', async () => {
    await deleteStaleAvailability(sql, [
      availabilityRow(),
      availabilityRow({ isl: null, osl: null }),
    ]);
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('deletes a key held only by an errored row, and only that date and framework', async () => {
    // Run 1 still holds the key, so nothing goes until its row is deleted.
    await deleteStaleAvailability(sql, [availabilityRow({ framework: 'vllm', isl: 8192 })]);
    expect(await snapshotRunTables(db)).toEqual(before);

    await db.exec('DELETE FROM benchmark_results WHERE id = 3');
    await deleteStaleAvailability(sql, [availabilityRow({ framework: 'vllm', isl: 8192 })]);
    const after = await snapshotRunTables(db);
    expect(after.availability.map(availabilityKey).toSorted()).toEqual(
      before.availability
        .map(availabilityKey)
        .filter((k) => k !== 'vllm/none/8192/1024/single_turn/2026-09-01')
        .toSorted(),
    );
  });

  it('matches null isl and osl as equal, not as unknown', async () => {
    await db.exec('DELETE FROM benchmark_results WHERE id = 4');
    await deleteStaleAvailability(sql, [
      availabilityRow({ spec_method: 'mtp', isl: null, osl: null }),
    ]);
    const after = await snapshotRunTables(db);
    expect(after.availability.map(availabilityKey)).not.toContain(
      'sglang/mtp/null/null/agentic_traces/2026-09-01',
    );
    expect(after.availability).toHaveLength(before.availability.length - 1);
  });

  it('ignores keys with no availability row', async () => {
    await deleteStaleAvailability(sql, [
      availabilityRow({ model: 'nope' }),
      availabilityRow({ date: '2020-01-01' }),
    ]);
    expect(await snapshotRunTables(db)).toEqual(before);
  });
});

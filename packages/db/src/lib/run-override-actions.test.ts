import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import type { ConfigParams } from '../etl/config-cache';
import type {
  BenchmarkPointBackfill,
  ChangelogBackfill,
  PurgedBenchmarkPoint,
  RunFrameworkOverride,
} from '../etl/run-overrides';
import {
  applyBenchmarkPointBackfillToDatabase,
  applyChangelogBackfill,
  applyConclusions,
  applyRunFrameworkOverride,
  previewBenchmarkPointBackfill,
  previewBenchmarkPointPurge,
  previewChangelogBackfill,
  previewConclusions,
  previewPurge,
  previewRunFrameworkOverride,
  purgeBenchmarkPoints,
  purgeWorkflowRuns,
} from './run-override-actions';
import { migratedPglite, pgliteDriverSql, type PgliteSql } from './test-pglite';
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
  sql = await pgliteDriverSql(db);
  spyOn(console, 'log').mockImplementation(() => {});
}, 30_000);

afterAll(async () => {
  await sql?.end();
  await db?.close();
});

beforeEach(async () => {
  await seedRunFixture(db);
  before = await snapshotRunTables(db);
});

const availabilityKey = (row: Row) =>
  `${row.framework}/${row.spec_method}/${row.isl}/${row.osl}/${row.benchmark_type}/${row.date}`;

/** Every table equals `expected` except `table`, whose rows are returned for a closer look. */
async function onlyChanged(table: keyof Snapshot, expected: Snapshot = before): Promise<Row[]> {
  const after = await snapshotRunTables(db);
  expect({ ...after, [table]: [] }).toEqual({ ...expected, [table]: [] });
  return after[table];
}

describe('conclusion overrides', () => {
  const overrides = new Map([
    [1000, 'success'],
    [999, 'success'],
  ]);

  it('previews every attempt of the exact run id and writes nothing', async () => {
    const stale = await previewConclusions(sql, overrides);
    expect(stale.map((s) => [Number(s.githubRunId), s.current, s.expected])).toEqual([
      [1000, 'failure', 'success'],
      [1000, 'failure', 'success'],
    ]);
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('patches only the target run and is idempotent', async () => {
    await applyConclusions(sql, await previewConclusions(sql, overrides));
    const runs = await onlyChanged('workflow_runs');
    expect(runs.map((r) => [r.id, r.conclusion])).toEqual([
      [1, 'success'],
      [2, 'success'],
      [3, 'failure'],
      [4, 'failure'],
    ]);
    expect(await previewConclusions(sql, overrides)).toEqual([]);
  });

  it('does nothing without overrides', async () => {
    expect(await previewConclusions(sql, new Map())).toEqual([]);
  });
});

describe('run purge', () => {
  it('previews exact counts for the whole run or chosen attempts without writing', async () => {
    const whole = await previewPurge(sql, 1000);
    expect(whole).toMatchObject({ bmk: 6, logs: 2, stats: 1, evals: 1, changelogs: 1 });
    expect(whole?.wrIds.map(Number)).toEqual([1, 2]);

    const first = await previewPurge(sql, 1000, new Set([1]));
    expect(first).toMatchObject({ bmk: 5, logs: 2, stats: 1, evals: 1, changelogs: 1 });
    expect(first?.wrIds.map(Number)).toEqual([1]);

    const neighbour = await previewPurge(sql, 10000);
    expect(neighbour?.wrIds.map(Number)).toEqual([3]);
    expect(await previewPurge(sql, 100000)).toBeNull();
    expect(await previewPurge(sql, 1000, new Set([3]))).toBeNull();
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('purges only the previewed attempt and then finds nothing to do', async () => {
    const target = await previewPurge(sql, 1000, new Set([1]));
    await purgeWorkflowRuns(sql, target!.wrIds);

    const after = await snapshotRunTables(db);
    expect(after.workflow_runs.map((r) => r.id)).toEqual([2, 3, 4]);
    expect(after.benchmark_results.map((r) => r.id as number).toSorted((a, b) => a - b)).toEqual([
      6, 7, 8, 9, 10,
    ]);
    expect(await previewPurge(sql, 1000, new Set([1]))).toBeNull();
    const remaining = await previewPurge(sql, 1000);
    expect(remaining?.wrIds.map(Number)).toEqual([2]);
  });
});

describe('benchmark point purge', () => {
  const point: PurgedBenchmarkPoint = {
    githubRunId: 1000,
    runAttempt: 1,
    configId: 1,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 32,
    offloadMode: 'on',
    recipeFingerprint: 'recipe-a',
  };

  it('matches the exact run, attempt and recipe without writing', async () => {
    expect(await previewBenchmarkPointPurge(sql, point)).toEqual({ resultIds: [5] });
    expect(await previewBenchmarkPointPurge(sql, { ...point, githubRunId: 10000 })).toEqual({
      resultIds: [8],
    });
    expect(await previewBenchmarkPointPurge(sql, { ...point, recipeFingerprint: null })).toBeNull();
    expect(await previewBenchmarkPointPurge(sql, { ...point, runAttempt: 2 })).toBeNull();
    expect(await previewBenchmarkPointPurge(sql, { ...point, githubRunId: 100 })).toBeNull();
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('deletes the point, keeps the trace and availability another run shares, and is idempotent', async () => {
    const target = await previewBenchmarkPointPurge(sql, point);
    await purgeBenchmarkPoints(sql, target!.resultIds);

    expect(await snapshotRunTables(db)).toEqual(
      withoutRows(before, { benchmark_results: (r) => r.id === 5 }),
    );
    expect(await previewBenchmarkPointPurge(sql, point)).toBeNull();
  });
});

describe('changelog backfill', () => {
  const backfill: ChangelogBackfill = {
    id: 'test-changelog',
    reason: 'test',
    githubRunId: 1000,
    runAttempt: 1,
    baseRef: 'base',
    headRef: 'head',
    set: { description: 'fixed', appendOnly: true },
  };

  it('previews the one matching row without writing', async () => {
    const target = await previewChangelogBackfill(sql, backfill);
    expect(target).toMatchObject({ changelogId: 1, workflowRunId: 1 });
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('refuses a run attempt without exactly one changelog row', async () => {
    await expect(previewChangelogBackfill(sql, { ...backfill, runAttempt: 2 })).rejects.toThrow(
      'expected exactly one changelog row, found 0',
    );
  });

  it('patches the changelog row and its run only, then reports it applied', async () => {
    await applyChangelogBackfill(sql, (await previewChangelogBackfill(sql, backfill))!);

    const after = await snapshotRunTables(db);
    const expected = {
      ...before,
      changelog_entries: before.changelog_entries.map((r) =>
        r.id === 1 ? { ...r, description: 'fixed', append_only: true } : r,
      ),
      workflow_runs: before.workflow_runs.map((r) =>
        r.id === 1 ? { ...r, append_only: true } : r,
      ),
    };
    expect(after).toEqual(expected);
    expect(await previewChangelogBackfill(sql, backfill)).toBeNull();
  });
});

describe('benchmark point backfill', () => {
  const vllm: ConfigParams = {
    hardware: 'b200',
    framework: 'vllm',
    model: 'dsr1',
    precision: 'fp4',
    specMethod: 'none',
    disagg: false,
    isMultinode: false,
    prefillTp: 8,
    prefillEp: 1,
    prefillDpAttn: false,
    prefillNumWorkers: 0,
    decodeTp: 8,
    decodeEp: 1,
    decodeDpAttn: false,
    decodeNumWorkers: 0,
    numPrefillGpu: 8,
    numDecodeGpu: 8,
  };
  const specBackfill: BenchmarkPointBackfill = {
    id: 'test-spec',
    reason: 'test',
    githubRunId: 1000,
    runAttempt: 1,
    config: vllm,
    benchmarkType: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 4,
    offloadMode: 'off',
    set: { specMethod: 'mtp' },
  };

  it('previews the single source row without writing', async () => {
    expect(await previewBenchmarkPointBackfill(sql, specBackfill)).toMatchObject({
      resultId: 3,
      sourceSpecMethod: 'none',
      date: '2026-09-01',
    });
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('refuses a key that matches no row', async () => {
    await expect(previewBenchmarkPointBackfill(sql, { ...specBackfill, conc: 5 })).rejects.toThrow(
      'expected exactly one source or desired benchmark row, found 0',
    );
  });

  it('moves the row to the new spec method and swaps its availability key', async () => {
    await applyBenchmarkPointBackfillToDatabase(
      sql,
      (await previewBenchmarkPointBackfill(sql, specBackfill))!,
    );

    const after = await snapshotRunTables(db);
    const [created] = after.configs.filter((c) => c.id === 4);
    expect(created).toMatchObject({ framework: 'vllm', spec_method: 'mtp' });
    expect(after.benchmark_results).toEqual(
      before.benchmark_results.map((r) => (r.id === 3 ? { ...r, config_id: 4 } : r)),
    );
    // Row 10 still holds the old key but errored, so the old key goes.
    expect(after.availability.map(availabilityKey).toSorted()).toEqual(
      [
        ...before.availability
          .map(availabilityKey)
          .filter((k) => k !== 'vllm/none/8192/1024/single_turn/2026-09-01'),
        'vllm/mtp/8192/1024/single_turn/2026-09-01',
      ].toSorted(),
    );
    expect({ ...after, configs: [], benchmark_results: [], availability: [] }).toEqual({
      ...before,
      configs: [],
      benchmark_results: [],
      availability: [],
    });
    expect(await previewBenchmarkPointBackfill(sql, specBackfill)).toBeNull();
  });

  it('patches the target run only when another run has the identical point', async () => {
    const offload: BenchmarkPointBackfill = {
      ...specBackfill,
      id: 'test-offload',
      config: { ...vllm, framework: 'sglang' },
      isl: 1024,
      conc: 4,
      set: { offloadMode: 'on' },
    };
    await applyBenchmarkPointBackfillToDatabase(
      sql,
      (await previewBenchmarkPointBackfill(sql, offload))!,
    );

    const rows = await onlyChanged('benchmark_results');
    expect(rows).toEqual(
      before.benchmark_results.map((r) =>
        r.id === 1
          ? {
              ...r,
              offload_mode: 'on',
              metrics: { ...(r.metrics as Row), offload_mode: 'on' },
            }
          : r,
      ),
    );
    expect(await previewBenchmarkPointBackfill(sql, offload)).toBeNull();
  });
});

describe('run framework override', () => {
  const override: RunFrameworkOverride = {
    id: 'test-framework',
    reason: 'test',
    githubRunId: 1000,
    from: 'sglang',
    to: 'vllm',
  };

  it('previews per-config counts and changelog rewrites without writing', async () => {
    const target = await previewRunFrameworkOverride(sql, override);
    expect(target?.wrIds.map(Number)).toEqual([1, 2]);
    expect(target?.configs).toEqual([
      { sourceConfigId: 1, benchmarkRows: 4, evalRows: 1 },
      { sourceConfigId: 3, benchmarkRows: 1, evalRows: 0 },
    ]);
    expect(target?.changelogs).toEqual([
      { changelogId: 1, configKeys: ['dsr1-fp4-b200-vllm', 'dsr1-fp4-b200-vllm'] },
    ]);
    expect(await snapshotRunTables(db)).toEqual(before);
  });

  it('skips a run that is not in the database', async () => {
    expect(await previewRunFrameworkOverride(sql, { ...override, githubRunId: 100000 })).toBeNull();
  });

  it('moves only the run rows off a config other runs share, then reports it applied', async () => {
    await applyRunFrameworkOverride(sql, (await previewRunFrameworkOverride(sql, override))!);

    const after = await snapshotRunTables(db);
    // c1 sglang/none merges into the existing c2 vllm/none. c3 sglang/mtp needs a new config.
    const created = after.configs.filter((c) => !before.configs.some((b) => b.id === c.id));
    expect(created).toEqual([expect.objectContaining({ framework: 'vllm', spec_method: 'mtp' })]);
    const mtp = created[0].id as number;
    const moved: Record<number, number> = { 1: 2, 2: 2, 4: mtp, 5: 2, 6: 2 };
    expect(after.benchmark_results).toEqual(
      before.benchmark_results.map((r) =>
        moved[r.id as number] ? { ...r, config_id: moved[r.id as number] } : r,
      ),
    );
    expect(after.eval_results).toEqual(
      before.eval_results.map((r) => (r.id === 1 ? { ...r, config_id: 2 } : r)),
    );
    expect(after.changelog_entries).toEqual(
      before.changelog_entries.map((r) =>
        r.id === 1 ? { ...r, config_keys: ['dsr1-fp4-b200-vllm', 'dsr1-fp4-b200-vllm'] } : r,
      ),
    );
    // Run 3 still serves the sglang keys on 2026-09-01; only the mtp key was the target's alone.
    expect(after.availability.map(availabilityKey).toSorted()).toEqual(
      [
        ...before.availability
          .map(availabilityKey)
          .filter((k) => k !== 'sglang/mtp/null/null/agentic_traces/2026-09-01'),
        'vllm/none/1024/1024/single_turn/2026-09-01',
        'vllm/none/null/null/agentic_traces/2026-09-01',
        'vllm/mtp/null/null/agentic_traces/2026-09-01',
      ].toSorted(),
    );
    const untouched = { configs: [], benchmark_results: [], eval_results: [] };
    expect({
      ...after,
      ...untouched,
      changelog_entries: [],
      availability: [],
    }).toEqual({ ...before, ...untouched, changelog_entries: [], availability: [] });

    expect(await previewRunFrameworkOverride(sql, override)).toBeNull();
  });

  it('writes nothing when a moved row would collide with one already under the new framework', async () => {
    await db.exec(`INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type,
      date, isl, osl, conc, metrics, offload_mode)
      VALUES (11, 1, 2, 'single_turn', '2026-09-01', 1024, 1024, 4, '{}', 'off')`);
    const seeded = await snapshotRunTables(db);

    const target = await previewRunFrameworkOverride(sql, override);
    await expect(applyRunFrameworkOverride(sql, target!)).rejects.toThrow();
    expect(await snapshotRunTables(db)).toEqual(seeded);
  });
});

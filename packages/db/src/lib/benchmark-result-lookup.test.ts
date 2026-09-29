import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { mapBenchmarkRow, type BenchmarkParams } from '../etl/benchmark-mapper';
import { createSkipTracker } from '../etl/skip-tracker';
import { filterPurgedBenchmarkRows, findBenchmarkResultIds } from './benchmark-result-lookup';
import { collectMissingTelemetryExpectations } from './gpu-metrics-backfill';

type Sql = postgres.Sql;
let db: PGlite;
let sql: Sql;
const roots: string[] = [];

function queryClient(database: Pick<PGlite, 'query'>) {
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    const result = await database.query(query, values);
    return result.rows;
  };
  return Object.assign(client, { json: JSON.stringify, array: (value: unknown) => value });
}

const GITHUB_RUN_ID = 34557177019;
const RUN = { github_run_id: GITHUB_RUN_ID, run_attempt: 2 };

/** Raw `bmk_` JSON as the runner emits it for a fixed-sequence sweep. */
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'b200-nv',
    framework: 'sglang',
    precision: 'fp4',
    isl: 8192,
    osl: 1024,
    conc: 32,
    tp: 8,
    ep: 1,
    dp_attention: false,
    tput_per_gpu: 1234.5,
    ...overrides,
  };
}

function mapped(raw: Record<string, unknown>): BenchmarkParams {
  const row = mapBenchmarkRow(raw, createSkipTracker());
  if (!row) throw new Error('fixture did not map');
  return row;
}

beforeAll(async () => {
  db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
  }
  sql = queryClient(db) as unknown as Sql;
}, 30_000);

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db?.close();
});

/**
 * Config 1 matches the fixture rows; config 2 differs only in decode_tp. Attempt 1
 * of the same GitHub run holds a point that must never be matched from attempt 2.
 */
beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (1, ${GITHUB_RUN_ID}, 1, 'Run Sweep', '2026-09-11T04:00:00Z', '2026-09-11'),
           (2, ${GITHUB_RUN_ID}, 2, 'Run Sweep', '2026-09-11T06:00:00Z', '2026-09-11');

    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
      decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
      num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 1, false, 0,
              8, 1, false, 0, 8, 8),
           (2, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 1, false, 0,
              4, 1, false, 0, 8, 8),
           (3, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 1, 1, false, 0,
              1, 1, false, 0, 1, 1);

    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, offload_mode, metrics)
    VALUES (20, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'off', '{}'),
           (21, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, 'off', '{}'),
           (22, 2, 2, 'single_turn', '2026-09-11', 8192, 1024, 32, 'off', '{}'),
           (23, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'off', '{}'),
           (24, 2, 3, 'agentic_traces', '2026-09-11', null, null, 72, 'off', '{}');`);
});

describe('findBenchmarkResultIds', () => {
  it('prefers the offload-exact point and reports no unique fallback', async () => {
    await db.exec(`INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type,
      date, isl, osl, conc, offload_mode, metrics)
      VALUES (25, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'on', '{}');`);
    const fallbacks: number[] = [];
    const ids = await findBenchmarkResultIds(sql, RUN, [mapped(rawRow())], (id) =>
      fallbacks.push(id),
    );
    expect(ids).toEqual([20]);
    expect(fallbacks).toEqual([]);
  });
});

it('excludes exact purges from mixed artifacts and missing-artifact expectations', async () => {
  await db.exec(`UPDATE benchmark_results SET config_id = 1 WHERE id = 24;
    UPDATE configs SET id = 744 WHERE id = 3;
    UPDATE workflow_runs SET github_run_id = 30730541420, run_attempt = 1 WHERE id = 2;
    UPDATE benchmark_results SET config_id = 744, conc = 1, offload_mode = 'on' WHERE id = 24;`);
  const run = { github_run_id: 30730541420, run_attempt: 1 };
  const point: BenchmarkParams = {
    ...mapped(rawRow({ infmax_model_prefix: 'dsv4', framework: 'vllm', tp: 1 })),
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    offloadMode: 'on',
    recipeFingerprint: null,
  };
  const purged = { ...point, conc: 32 };
  const surviving = { ...point, conc: 1 };
  const rows = await filterPurgedBenchmarkRows(sql, run, [purged, surviving]);
  expect(rows).toEqual([surviving]);
  expect(await findBenchmarkResultIds(sql, run, rows)).toEqual([24]);
  expect(await filterPurgedBenchmarkRows(sql, run, [purged])).toEqual([]);
  expect(await filterPurgedBenchmarkRows(sql, { ...run, run_attempt: 2 }, [purged])).toEqual([
    purged,
  ]);
  expect(
    await filterPurgedBenchmarkRows(sql, run, [{ ...purged, recipeFingerprint: 'new' }]),
  ).toHaveLength(1);
  expect(
    await filterPurgedBenchmarkRows(sql, run, [{ ...purged, offloadMode: 'off' }]),
  ).toHaveLength(1);
  expect(
    await filterPurgedBenchmarkRows(sql, run, [
      { ...purged, config: { ...point.config, decodeTp: 4 } },
    ]),
  ).toHaveLength(1);
  const missing = await collectMissingTelemetryExpectations(
    [
      {
        id: 1,
        name: 'bmk_agentic_retained',
        expired: false,
        created_at: '2026-09-11T00:00:00Z',
        archive_download_url: 'https://example.test/1',
      },
    ],
    [],
    null,
    () => filterPurgedBenchmarkRows(sql, run, [purged, surviving]),
  );
  expect(missing.observations.map((entry) => entry.identity.conc)).toEqual([1]);
  expect(missing.errors).toEqual([]);
});

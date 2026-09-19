import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DbClient } from '../connection';
import {
  getGpuMetricsAvailability,
  getGpuMetricsForPoint,
  getGpuMetricsForRun,
} from './gpu-metrics';

let db: PGlite;
const sql: DbClient = async (strings, ...values) => {
  const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
  const result = await db.query<Record<string, unknown>>(query, values);
  return result.rows;
};

/** Stand-in client that fails loudly if a query slips past an early return. */
const exploding: DbClient = () => {
  throw new Error('should not query');
};

const WITH_SERIES = 34557177019;
const WITHOUT_SERIES = 34557177020;
const RETRIED = 34557177021;

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  }
}, 20_000);

afterAll(async () => {
  await db?.close();
});

/**
 * Run 1 holds a two-node artifact (one CSV per serving node) whose first CSV is
 * shared by points 10 and 11; run 3 is a rerun of run 2's GitHub id. Point 12
 * is deliberately left unlinked.
 */
beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion,
      head_branch, head_sha, html_url, created_at, date)
    VALUES (1, ${WITH_SERIES}, 1, 'Run Sweep', 'completed', 'success', 'main', 'abc123',
        'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${WITH_SERIES}',
        '2026-09-11T04:19:00Z', '2026-09-11'),
      (2, ${WITHOUT_SERIES}, 1, 'Run Sweep', 'completed', 'success', null, null, null,
        '2026-09-12T04:19:00Z', '2026-09-12'),
      (3, ${RETRIED}, 1, 'Run Sweep', 'completed', 'failure', null, null, null,
        '2026-09-13T04:19:00Z', '2026-09-13'),
      (4, ${RETRIED}, 2, 'Run Sweep', 'completed', 'success', null, null, null,
        '2026-09-13T06:19:00Z', '2026-09-13');

    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, true, 8, 8, 8, 8);

    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}'),
           (11, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, '{}'),
           (12, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 128, '{}');

    INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name,
      vendor, csv_sha256, sample_interval_s, sample_count, gpu_count, started_at, ended_at,
      sidecars)
    VALUES (100, 1, 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
        'dsr1_8k1k_fp4_sglang_conc32_b200-x_0', 'node0/gpu_metrics.csv', 'nvidia', 'sha-node0',
        1, 3, 2, '2026-09-11T04:19:41Z', '2026-09-11T04:19:43Z',
        '{"context": {"timestamp_timezone": "UTC"}}'),
      (101, 1, 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
        'dsr1_8k1k_fp4_sglang_conc32_b200-x_0', 'node1/gpu_metrics.csv', 'nvidia', 'sha-node1',
        1, 1, 1, '2026-09-11T04:19:41Z', '2026-09-11T04:19:42Z', '{}'),
      (102, 4, 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_1',
        'dsr1_8k1k_fp4_sglang_conc32_b200-x_1', 'gpu_metrics.csv', 'amd', 'sha-attempt2',
        null, 1, 1, '2026-09-13T06:20:00Z', '2026-09-13T06:20:01Z', '{}'),
      (103, 3, 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
        'dsr1_8k1k_fp4_sglang_conc32_b200-x_0', 'gpu_metrics.csv', 'nvidia', 'sha-attempt1',
        null, 1, 1, '2026-09-13T04:20:00Z', '2026-09-13T04:20:01Z', '{}');

    INSERT INTO benchmark_result_gpu_metrics (benchmark_result_id, series_id)
    VALUES (10, 100), (11, 100), (10, 101);

    INSERT INTO gpu_metric_gpu_stats (series_id, gpu_index, metric, sample_count,
      min_value, max_value, mean_value, median_value, p95_value, p99_value, stddev_value)
    VALUES (100, 0, 'powerW', 2, 187.5, 912.25, 549.875, 549.875, 912.25, 912.25, 362.375),
           (100, 1, 'powerW', 1, 190.5, 190.5, 190.5, 190.5, 190.5, 190.5, 0),
           (101, 0, 'powerW', 1, 500.5, 500.5, 500.5, 500.5, 500.5, 500.5, 0),
           (102, 0, 'powerW', 1, 700.5, 700.5, 700.5, 700.5, 700.5, 700.5, 0),
           (103, 0, 'powerW', 1, 100.5, 100.5, 100.5, 100.5, 100.5, 100.5, 0);

    INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w, temperature_c,
      sm_clock_mhz, mem_clock_mhz, gpu_util_pct, mem_util_pct, edge_temp_c, mem_temp_c,
      gfx_voltage_mv, soc_voltage_mv, mem_voltage_mv, fclk_mhz, socclk_mhz, mm_activity_pct)
    VALUES (100, 0, '2026-09-11T04:19:41Z', 187.5, 33, 120, 3996, 0, 0,
              35.5, 40.5, 750, 800, 1350, 1940, 1100, 12.5),
           (100, 1, '2026-09-11T04:19:41Z', 190.5, 39, 120, 3996, 0, 0,
              null, null, null, null, null, null, null, null),
           -- Collector dropout: the row exists but every metric column is null.
           (100, 0, '2026-09-11T04:19:42Z', null, null, null, null, null, null,
              null, null, null, null, null, null, null, null),
           (101, 0, '2026-09-11T04:19:41Z', 500.5, 50, 1965, 3996, 98, 74,
              null, null, null, null, null, null, null, null),
           (102, 0, '2026-09-13T06:20:00Z', 700.5, 60, 1965, 3996, 99, 80,
              null, null, null, null, null, null, null, null),
           (103, 0, '2026-09-13T04:20:00Z', 100.5, 20, 120, 3996, 0, 0,
              null, null, null, null, null, null, null, null);`);
});

describe('getGpuMetricsForRun', () => {
  it('returns null for a GitHub run id that was never ingested', async () => {
    expect(await getGpuMetricsForRun(sql, 99999999999)).toBeNull();
  });

  it('returns null for an ingested run that stored no telemetry series', async () => {
    // The run row exists, so the null must come from the empty-series branch and
    // not from a missing workflow_runs lookup.
    const [row] = await sql`select id from workflow_runs where github_run_id = ${WITHOUT_SERIES}`;
    expect(Number(row!.id)).toBe(2);
    expect(await getGpuMetricsForRun(sql, WITHOUT_SERIES)).toBeNull();
  });

  it('returns the run header, every series, its per-GPU stats, and its samples', async () => {
    const payload = await getGpuMetricsForRun(sql, WITH_SERIES);

    expect(payload?.workflowRun).toEqual({
      id: 1,
      githubRunId: WITH_SERIES,
      runAttempt: 1,
      name: 'Run Sweep',
      date: '2026-09-11',
      htmlUrl: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${WITH_SERIES}`,
      headBranch: 'main',
      headSha: 'abc123',
      conclusion: 'success',
      status: 'completed',
      createdAt: '2026-09-11T04:19:00.000Z',
    });

    expect(payload?.series.map((series) => series.fileName)).toEqual([
      'node0/gpu_metrics.csv',
      'node1/gpu_metrics.csv',
    ]);

    const [node0, node1] = payload!.series;
    expect(node0).toMatchObject({
      id: 100,
      artifactName: 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
      configKey: 'dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 3,
      gpuCount: 2,
      startedAt: '2026-09-11T04:19:41.000Z',
      endedAt: '2026-09-11T04:19:43.000Z',
      sidecars: { context: { timestamp_timezone: 'UTC' } },
      benchmarkResultIds: [10, 11],
    });
    expect(node0?.stats).toEqual([
      {
        gpuIndex: 0,
        metric: 'powerW',
        count: 2,
        min: 187.5,
        max: 912.25,
        mean: 549.875,
        median: 549.875,
        p95: 912.25,
        p99: 912.25,
        stddev: 362.375,
      },
      {
        gpuIndex: 1,
        metric: 'powerW',
        count: 1,
        min: 190.5,
        max: 190.5,
        mean: 190.5,
        median: 190.5,
        p95: 190.5,
        p99: 190.5,
        stddev: 0,
      },
    ]);
    expect(node0?.data.map((sample) => [sample.timestamp, sample.index, sample.power])).toEqual([
      ['2026-09-11T04:19:41.000Z', 0, 187.5],
      ['2026-09-11T04:19:41.000Z', 1, 190.5],
      ['2026-09-11T04:19:42.000Z', 0, 0],
    ]);
    expect(node0?.data[0]).toEqual({
      timestamp: '2026-09-11T04:19:41.000Z',
      index: 0,
      power: 187.5,
      temperature: 33,
      smClock: 120,
      memClock: 3996,
      gpuUtil: 0,
      memUtil: 0,
      edgeTemp: 35.5,
      memTemp: 40.5,
      gfxVoltage: 750,
      socVoltage: 800,
      memVoltage: 1350,
      fclk: 1940,
      socClk: 1100,
      mmActivity: 12.5,
    });
    expect(node1?.benchmarkResultIds).toEqual([10]);
  });

  it('omits samples but keeps the digest when includeSamples is false', async () => {
    const payload = await getGpuMetricsForRun(sql, WITH_SERIES, { includeSamples: false });
    expect(payload?.series.map((series) => series.data)).toEqual([[], []]);
    expect(payload?.series[0]?.stats).toHaveLength(2);
    // sampleCount is the stored column, so it still reports the full series length.
    expect(payload?.series[0]?.sampleCount).toBe(3);
  });

  it('reads the latest attempt of a rerun GitHub run id, not the first', async () => {
    const payload = await getGpuMetricsForRun(sql, RETRIED);
    expect(payload?.workflowRun).toMatchObject({ id: 4, runAttempt: 2, conclusion: 'success' });
    expect(payload?.series.map((series) => ({ id: series.id, vendor: series.vendor }))).toEqual([
      { id: 102, vendor: 'amd' },
    ]);
  });

  it('reports a dropped sample as zero power with every other metric absent', async () => {
    const payload = await getGpuMetricsForRun(sql, WITH_SERIES);
    const dropped = payload?.series[0]?.data.at(-1);
    // Power keeps the `?? 0` default (a null power reading is indistinguishable
    // from a genuine 0 W reading once it reaches the chart); the other metrics
    // stay absent so a power-only collector never shows up as 0 °C / 0 MHz / 0 %.
    expect(dropped).toEqual({
      timestamp: '2026-09-11T04:19:42.000Z',
      index: 0,
      power: 0,
      temperature: undefined,
      smClock: undefined,
      memClock: undefined,
      gpuUtil: undefined,
      memUtil: undefined,
      edgeTemp: undefined,
      memTemp: undefined,
      gfxVoltage: undefined,
      socVoltage: undefined,
      memVoltage: undefined,
      fclk: undefined,
      socClk: undefined,
      mmActivity: undefined,
    });
    // Absent rather than zeroed, so consumers can tell "not collected" from
    // "collected as zero" for everything except power.
    expect(Object.hasOwn(dropped!, 'edgeTemp')).toBe(true);
    expect(dropped?.edgeTemp).toBeUndefined();
  });
});

describe('getGpuMetricsForPoint', () => {
  it('returns null for a benchmark point with no linked series', async () => {
    expect(await getGpuMetricsForPoint(sql, 12)).toBeNull();
    expect(await getGpuMetricsForPoint(sql, 9999)).toBeNull();
  });

  it('returns every series linked to a multinode point, with each series full sample set', async () => {
    const payload = await getGpuMetricsForPoint(sql, 10);
    expect(payload?.benchmarkResultId).toBe(10);
    expect(payload?.series.map((series) => [series.id, series.fileName])).toEqual([
      [100, 'node0/gpu_metrics.csv'],
      [101, 'node1/gpu_metrics.csv'],
    ]);
    expect(payload?.series.map((series) => series.data.length)).toEqual([3, 1]);
    // Each series carries every point that references it, not just the queried one.
    expect(payload?.series.map((series) => series.benchmarkResultIds)).toEqual([[10, 11], [10]]);

    const single = await getGpuMetricsForPoint(sql, 11);
    expect(single?.series.map((series) => series.id)).toEqual([100]);
  });
});

describe('getGpuMetricsAvailability', () => {
  it('flags only the point ids that have at least one linked series', async () => {
    expect(await getGpuMetricsAvailability(sql, [10, 11, 12, 9999])).toEqual({
      10: true,
      11: true,
    });
  });

  it('short-circuits an empty id list without querying', async () => {
    expect(await getGpuMetricsAvailability(exploding, [])).toEqual({});
  });
});

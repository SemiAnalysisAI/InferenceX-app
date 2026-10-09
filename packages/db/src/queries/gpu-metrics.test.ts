import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DbClient } from '../connection';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { getGpuMetricsForPoint, getGpuMetricsForRun, SAMPLE_PAGE_SIZE } from './gpu-metrics';

let db: PGlite;
let sql: PgliteSql;

const WITH_SERIES = 34557177019;
const RETRIED = 34557177021;
const NO_SERIES = 34557177023;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 20_000);

afterAll(async () => {
  await db?.close();
});

/**
 * Run 1 holds a two-node artifact (one CSV per serving node) whose first CSV is
 * shared by points 10 and 11; runs 3 and 4 are two attempts of one GitHub run.
 * Point 12 is deliberately left unlinked.
 */
beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion,
      head_branch, head_sha, html_url, created_at, date)
    VALUES (1, ${WITH_SERIES}, 1, 'Run Sweep', 'completed', 'success', 'main', 'abc123',
        'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${WITH_SERIES}',
        '2026-09-11T04:19:00Z', '2026-09-11'),
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

    INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w, temperature_c,
      sm_clock_mhz, mem_clock_mhz, gpu_util_pct, mem_util_pct, edge_temp_c, mem_temp_c,
      gfx_voltage_mv, soc_voltage_mv, mem_voltage_mv, fclk_mhz, socclk_mhz, mm_activity_pct)
    VALUES (100, 0, '2026-09-11T04:19:41Z', 187.5, 33, 120, 3996, 0, 5,
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

    const [node0] = payload!.series;
    expect(node0).toMatchObject({
      id: 100,
      artifactName: 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 3,
      gpuCount: 2,
      startedAt: '2026-09-11T04:19:41.000Z',
      endedAt: '2026-09-11T04:19:43.000Z',
      sidecars: { context: { timestamp_timezone: 'UTC' } },
    });
    // Statistics come from the stored samples; a missing reading is not zero.
    const gpu0 = node0!.stats.filter((stat) => stat.gpuIndex === 0);
    expect(Object.fromEntries(gpu0.map((stat) => [stat.metric, [stat.count, stat.mean]]))).toEqual({
      power_w: [1, 187.5],
      temperature_c: [1, 33],
      sm_clock_mhz: [1, 120],
      mem_clock_mhz: [1, 3996],
      gpu_util_pct: [1, 0],
      mem_util_pct: [1, 5],
      edge_temp_c: [1, 35.5],
      mem_temp_c: [1, 40.5],
      gfx_voltage_mv: [1, 750],
      soc_voltage_mv: [1, 800],
      mem_voltage_mv: [1, 1350],
      fclk_mhz: [1, 1940],
      socclk_mhz: [1, 1100],
      mm_activity_pct: [1, 12.5],
    });
    expect(node0?.data.map((sample) => [sample.timestamp, sample.index, sample.power])).toEqual([
      ['2026-09-11T04:19:41.000Z', 0, 187.5],
      ['2026-09-11T04:19:41.000Z', 1, 190.5],
      ['2026-09-11T04:19:42.000Z', 0, 0],
    ]);
    // Collector dropout: power reads 0 W, every other metric stays absent rather than 0.
    expect(node0?.data[2]).toEqual({ timestamp: '2026-09-11T04:19:42.000Z', index: 0, power: 0 });
    expect(node0?.data[0]).toEqual({
      timestamp: '2026-09-11T04:19:41.000Z',
      index: 0,
      power: 187.5,
      temperature: 33,
      smClock: 120,
      memClock: 3996,
      gpuUtil: 0,
      memUtil: 5,
      edgeTemp: 35.5,
      memTemp: 40.5,
      gfxVoltage: 750,
      socVoltage: 800,
      memVoltage: 1350,
      fclk: 1940,
      socClk: 1100,
      mmActivity: 12.5,
    });
  });

  it('reads the latest attempt of a rerun GitHub run id, not the first', async () => {
    const payload = await getGpuMetricsForRun(sql, RETRIED);
    expect(payload?.workflowRun).toMatchObject({ id: 4, runAttempt: 2, conclusion: 'success' });
    expect(payload?.series.map((series) => ({ id: series.id, vendor: series.vendor }))).toEqual([
      { id: 102, vendor: 'amd' },
    ]);
  });
});

it('withholds statistics for a series with incomplete samples, keeping sibling hosts readable', async () => {
  await sql`update gpu_metric_series set sample_count = 4 where id = 100`;
  const payload = await getGpuMetricsForRun(sql, WITH_SERIES);
  expect(payload?.series[0]?.stats).toEqual([]);
  expect(payload?.series[0]?.data).toHaveLength(3);
  expect(payload?.series[1]?.stats).toEqual(
    expect.arrayContaining([expect.objectContaining({ metric: 'power_w', mean: 500.5, count: 1 })]),
  );
});

it('returns null only when the run has no stored series', async () => {
  await db.exec(`INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (5, ${NO_SERIES}, 1, 'Run Sweep', '2026-09-14T04:19:00Z', '2026-09-14')`);
  expect(await getGpuMetricsForRun(sql, WITH_SERIES, { artifact: 'missing' })).toMatchObject({
    workflowRun: { githubRunId: WITH_SERIES },
    series: [],
  });
  expect(await getGpuMetricsForRun(sql, NO_SERIES)).toBeNull();
  expect(await getGpuMetricsForRun(sql, NO_SERIES, { artifact: 'missing' })).toBeNull();
});

it('reads only the selected view host while retaining every exact explorer label', async () => {
  const prefix = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0';
  const names = [`${prefix}/node0/gpu_metrics.csv`, `${prefix}/node1/gpu_metrics.csv`];
  const sampleIds: unknown[] = [];
  const observed: DbClient = (strings, ...values) => {
    if (strings.join('').includes('from gpu_metric_samples')) sampleIds.push(values[0]);
    return sql(strings, ...values);
  };
  const selected = await getGpuMetricsForRun(observed, WITH_SERIES, { artifact: names[1] });
  expect(selected?.artifactNames).toEqual(names);
  expect(selected?.series.map((series) => series.id)).toEqual([101]);
  expect(sampleIds).toEqual([[101]]);
  const first = await getGpuMetricsForRun(sql, WITH_SERIES, { artifact: null });
  expect(first?.series[0]?.id).toBe(100);
  const missing = await getGpuMetricsForRun(observed, WITH_SERIES, { artifact: 'not-an-artifact' });
  expect(missing).toMatchObject({ artifactNames: names, series: [] });
  expect(sampleIds).toHaveLength(1);
});

it('pages a single large series without dropping microseconds and retries changes between pages', async () => {
  await db.exec(`DELETE FROM gpu_metric_samples WHERE series_id = 100;
    INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w)
    SELECT 100, 0, '2026-09-11T04:19:41Z'::timestamptz + n * interval '1 microsecond', n
    FROM generate_series(1, ${SAMPLE_PAGE_SIZE + 2}) n;
    UPDATE gpu_metric_series SET sample_count = ${SAMPLE_PAGE_SIZE + 2} WHERE id = 100;`);
  let pages = 0;
  const observed: DbClient = async (strings, ...values) => {
    const rows = await sql(strings, ...values);
    if (strings.join('').includes('from gpu_metric_samples')) {
      // Model the bounded HTTP transport, which a whole-series query would exceed.
      expect(rows.length).toBeLessThanOrEqual(SAMPLE_PAGE_SIZE);
      pages++;
      if (pages === 1) {
        await db.exec(`UPDATE gpu_metric_samples SET power_w = power_w + 20000 WHERE series_id = 100;
          UPDATE gpu_metric_series SET ingested_at = ingested_at + interval '1 second' WHERE id = 100;`);
      }
    }
    return rows;
  };
  const payload = await getGpuMetricsForPoint(observed, 11);
  expect(pages).toBe(4);
  const data = payload!.series[0]!.data;
  expect(data).toHaveLength(SAMPLE_PAGE_SIZE + 2);
  expect(data.map((row) => row.power)).toEqual(
    Array.from({ length: SAMPLE_PAGE_SIZE + 2 }, (_, i) => i + 20001),
  );
  expect(payload!.series[0]!.stats.find((stat) => stat.metric === 'power_w')?.count).toBe(
    SAMPLE_PAGE_SIZE + 2,
  );
});

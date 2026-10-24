import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { storedPowerSeries } from '../power-series/stored-power-series';
import { getGpuMetricsForRun } from './gpu-metrics';
import {
  getPrecomputedPowerSeries,
  materializePowerSeriesForRun,
  POWER_SERIES_FORMAT_VERSION,
} from './gpu-power-series';

let db: PGlite;
let sql: PgliteSql;

const RUN = 34557177019;
const A = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200';
const B = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc64_b200';
const C = 'gpu_metrics_gptoss_8k1k_fp4_vllm_conc32_b200';

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 20_000);

afterAll(async () => {
  await db?.close();
});

const series = (id: number, artifact: string, samples: number) =>
  `(${id}, 1, '${artifact}', '${artifact.slice('gpu_metrics_'.length)}', 'gpu_metrics.csv',
    'nvidia', 'sha-${id}', 1, ${samples}, 1, '2026-09-11T04:19:41Z', '2026-09-11T04:19:43Z',
    '{"seriesInventory": [{"fileName": "gpu_metrics.csv", "sampleCount": ${samples}}]}')`;

const samples = (id: number, watts: number[]) =>
  watts
    .map(
      (watt, second) =>
        `(${id}, 0, '2026-09-11T04:19:4${1 + second}Z', ${watt}, 50, 1965, 3996, 98, 74)`,
    )
    .join(', ');

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion,
      head_branch, head_sha, html_url, created_at, date)
    VALUES (1, ${RUN}, 1, 'Run Sweep', 'completed', 'success', 'main', 'abc123', null,
      '2026-09-11T04:19:00Z', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 8, 8, 8);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, metrics, power_audit)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}',
      '{"source": "power_validation_dsr1_8k1k_fp4_sglang_conc32_b200.json", "window_start_unix": 1, "window_end_unix": 2}');
    INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name,
      vendor, csv_sha256, sample_interval_s, sample_count, gpu_count, started_at, ended_at,
      sidecars)
    VALUES ${series(100, A, 3)}, ${series(101, B, 2)}, ${series(102, C, 2)};
    INSERT INTO benchmark_result_gpu_metrics (benchmark_result_id, series_id) VALUES (10, 100);
    INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w, temperature_c,
      sm_clock_mhz, mem_clock_mhz, gpu_util_pct, mem_util_pct)
    VALUES ${samples(100, [500, 510, 520])}, ${samples(101, [600, 610])},
      ${samples(102, [700, 710])};`);
});

async function fromSamples(selection: { prefix?: string } = {}) {
  const payload = await getGpuMetricsForRun(sql, RUN, selection);
  return storedPowerSeries(payload!.series);
}

describe('precomputed PowerX series', () => {
  it('stores exactly what bucketing the samples produces, scoped by prefix', async () => {
    expect(await materializePowerSeriesForRun(sql, 1)).toEqual({
      written: [A, B, C],
      unchanged: [],
      incomplete: [],
    });

    const all = await getPrecomputedPowerSeries(sql, RUN);
    expect(all?.series).toEqual(await fromSamples());
    expect(all?.series.map((entry) => entry.artifact)).toEqual([A, B, C]);
    expect(all?.workflowRun).toMatchObject({ id: 1, githubRunId: RUN, name: 'Run Sweep' });

    const scoped = await getPrecomputedPowerSeries(sql, RUN, { prefix: 'dsr1_' });
    expect(scoped?.series).toEqual(await fromSamples({ prefix: 'dsr1_' }));
    expect(scoped?.series.map((entry) => entry.artifact)).toEqual([A, B]);
  });

  it('recomputes only artifacts whose inputs changed', async () => {
    await materializePowerSeriesForRun(sql, 1);
    await db.exec(`UPDATE gpu_metric_series SET csv_sha256 = 'sha-new', ingested_at = now()
      WHERE id = 101`);
    expect(await materializePowerSeriesForRun(sql, 1)).toEqual({
      written: [B],
      unchanged: [A, C],
      incomplete: [],
    });
  });

  it('never serves a row computed from older series or point audits', async () => {
    await materializePowerSeriesForRun(sql, 1);

    // Re-ingest of one artifact: only a scope that includes it misses.
    await db.exec(`UPDATE gpu_metric_series SET csv_sha256 = 'sha-new', ingested_at = now()
      WHERE id = 102`);
    expect(await getPrecomputedPowerSeries(sql, RUN)).toBeNull();
    expect(await getPrecomputedPowerSeries(sql, RUN, { prefix: 'dsr1_' })).not.toBeNull();

    // A linked point's measurement window changed.
    await materializePowerSeriesForRun(sql, 1);
    await db.exec(`UPDATE benchmark_results
      SET power_audit = power_audit || '{"window_end_unix": 3}' WHERE id = 10`);
    expect(await getPrecomputedPowerSeries(sql, RUN, { prefix: 'dsr1_' })).toBeNull();

    // A point link was removed.
    await materializePowerSeriesForRun(sql, 1);
    await db.exec(`DELETE FROM benchmark_result_gpu_metrics WHERE series_id = 100`);
    expect(await getPrecomputedPowerSeries(sql, RUN, { prefix: 'dsr1_' })).toBeNull();
  });

  it('ignores rows written by another transform version', async () => {
    await materializePowerSeriesForRun(sql, 1);
    await db.exec(
      `UPDATE gpu_power_series SET format_version = ${POWER_SERIES_FORMAT_VERSION - 1}`,
    );
    expect(await getPrecomputedPowerSeries(sql, RUN)).toBeNull();
    const rewritten = await materializePowerSeriesForRun(sql, 1);
    expect(rewritten.written).toEqual([A, B, C]);
    expect(await getPrecomputedPowerSeries(sql, RUN)).not.toBeNull();
  });

  it('stores nothing for an incomplete artifact, so readers keep reporting it', async () => {
    await db.exec(`UPDATE gpu_metric_series
      SET sidecars = '{"seriesInventory": [{"fileName": "gpu_metrics.csv", "sampleCount": 5}]}'
      WHERE id = 101`);
    expect(await materializePowerSeriesForRun(sql, 1)).toEqual({
      written: [A, C],
      unchanged: [],
      incomplete: [B],
    });
    expect(await getPrecomputedPowerSeries(sql, RUN, { prefix: 'dsr1_' })).toBeNull();
    expect(await getPrecomputedPowerSeries(sql, RUN, { prefix: 'gptoss_' })).not.toBeNull();
  });

  it('drops rows of artifacts the run no longer stores', async () => {
    await materializePowerSeriesForRun(sql, 1);
    await db.exec(`DELETE FROM gpu_metric_series WHERE id = 102`);
    await materializePowerSeriesForRun(sql, 1);
    const rows = await db.query<{ artifact_name: string }>(
      'SELECT artifact_name FROM gpu_power_series ORDER BY artifact_name',
    );
    expect(rows.rows.map((row) => row.artifact_name)).toEqual([A, B]);
  });

  it('returns null for runs without stored telemetry', async () => {
    expect(await getPrecomputedPowerSeries(sql, 1)).toBeNull();
  });
});

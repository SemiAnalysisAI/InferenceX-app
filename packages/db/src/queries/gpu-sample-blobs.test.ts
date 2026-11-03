import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection';
import { ingestGpuMetricsArtifact } from '../etl/gpu-metrics-ingest';
import { GPU_SAMPLE_BLOB_FORMAT_VERSION } from '../lib/gpu-sample-blob';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { getGpuMetricsForPoint, getGpuMetricsForRun, readSqlSampleRows } from './gpu-metrics';
import { storeGpuSampleBlob, storedSample } from './gpu-sample-blobs';

let db: PGlite;
let sql: PgliteSql;

const RUN = 34557177019;
const SERIES = [100, 101];

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 20_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (1, ${RUN}, 1, 'Run Sweep', '2026-09-11T04:19:00Z', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'mi355x', 'sglang', 'fp4', 'none', false, true, 8, 8, 8, 8);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}'),
           (12, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, '{}');
    INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name,
      vendor, csv_sha256, sample_interval_s, sample_count, gpu_count, started_at, ended_at)
    VALUES (100, 1, 'gpu_metrics_a', 'a', 'node0/gpu_metrics.csv', 'amd', 'sha-0', 1, 6, 2,
        '2026-09-11T04:19:41Z', '2026-09-11T04:19:44Z'),
      (101, 1, 'gpu_metrics_a', 'a', 'node1/gpu_metrics.csv', 'nvidia', 'sha-1', 1, 2, 1,
        '2026-09-11T04:19:41Z', '2026-09-11T04:19:44Z');
    INSERT INTO benchmark_result_gpu_metrics (benchmark_result_id, series_id)
    VALUES (10, 100), (10, 101);
    INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w, temperature_c,
      sm_clock_mhz, mem_clock_mhz, gpu_util_pct, mem_util_pct, edge_temp_c, mem_temp_c,
      gfx_voltage_mv, soc_voltage_mv, mem_voltage_mv, fclk_mhz, socclk_mhz, mm_activity_pct)
    VALUES (100, 1, '2026-09-11T04:19:41.982431Z', 187.8, 33, 120, 3996, 0, '-0',
              35.5, 40.5, 750.25, 0.1, 1e-7, 1940, 1100, 12.5),
           (100, 0, '2026-09-11T04:19:41.982431Z', 'NaN', 'Infinity', '-Infinity', 3.4e38,
              1e-45, 1401091.25, 233556992, null, null, null, null, null, null, null),
           (100, 0, '2026-09-11T04:19:42.982430Z', null, null, null, null, null, null,
              null, null, null, null, null, null, null, null),
           (100, 1, '2026-09-11T04:19:42.000001Z', 700.123, 99.999, 1965, 3996, 100, 74,
              null, null, null, null, null, null, null, null),
           (100, 0, '2026-09-11T04:19:44Z', 0.3, 65504, 16777217, 1.17549435e-38, 0.001, 2,
              3, 4, 5, 6, 7, 8, 9, 10),
           (100, 1, '2026-09-11T04:19:43.5Z', 1, 2, 3, 4, 5, 6,
              7, 8, 9, 10, 11, 12, 13, 14),
           (101, 0, '2026-09-11T04:19:41Z', 500.5, 50, 1965, 3996, 98, 74,
              null, null, null, null, null, null, null, null),
           (101, 0, '2026-09-11T04:19:42Z', 501.5, 51, 1965, 3996, 97, 73,
              null, null, null, null, null, null, null, null);`);
});

async function storeBlobs(ids: readonly number[]): Promise<void> {
  for (const id of ids) {
    const result = await sql.begin((tx) => storeGpuSampleBlob(tx, id));
    expect(result).toMatchObject({ status: 'written' });
  }
}

const BLOB_QUERY = 'left join gpu_metric_sample_blobs';

interface Observed {
  client: DbClient;
  queries: string[];
}

/** Records every query; `blobQueryBytes` replaces the blob query's size budget. */
function observe(blobQueryBytes?: number): Observed {
  const queries: string[] = [];
  const client: DbClient = (strings, ...values) => {
    const text = strings.join('?');
    queries.push(text);
    const budgeted =
      blobQueryBytes !== undefined && text.includes(BLOB_QUERY)
        ? values.map((value) => (value === 16 * 1024 * 1024 ? blobQueryBytes : value))
        : values;
    return sql(strings, ...budgeted);
  };
  return { client, queries };
}

const count = ({ queries }: Observed, pattern: string): number =>
  queries.filter((text) => text.includes(pattern)).length;
const rowsRead = (observed: Observed): number => count(observed, 'from gpu_metric_samples');

describe('stored sample blobs', () => {
  it('decode to the SQL rows and serve the identical point payload from one blob query', async () => {
    const sqlRows = await readSqlSampleRows(sql, SERIES);
    const expected = await getGpuMetricsForPoint(sql, 10, { sampleBlobs: false });
    await storeBlobs(SERIES);

    const observed = observe();
    const payload = await getGpuMetricsForPoint(observed.client, 10);
    expect(payload).toStrictEqual(expected);
    expect(JSON.stringify(payload)).toBe(JSON.stringify(expected));
    expect(rowsRead(observed)).toBe(0);
    // Series rows, then blobs with their version keys; no separate version query.
    expect(observed.queries).toHaveLength(2);

    const [blob] = (await sql`
      select b.sample_count, b.format_version, b.ingested_at = s.ingested_at as current
      from gpu_metric_sample_blobs b join gpu_metric_series s on s.id = b.series_id
      where b.series_id = 100
    `) as { sample_count: number; format_version: number; current: boolean }[];
    expect(blob).toEqual({
      sample_count: 6,
      format_version: GPU_SAMPLE_BLOB_FORMAT_VERSION,
      current: true,
    });
    expect(sqlRows.get(100)?.map((row) => row.sampled_at)).toEqual([
      '2026-09-11T04:19:41.982431Z',
      '2026-09-11T04:19:41.982431Z',
      '2026-09-11T04:19:42.000001Z',
      '2026-09-11T04:19:42.982430Z',
      '2026-09-11T04:19:43.500000Z',
      '2026-09-11T04:19:44.000000Z',
    ]);
    expect(Object.is(payload!.series[0]!.data[1]!.memUtil, -0)).toBe(true);
    expect(payload!.series[0]!.data[0]!.power).toBeNaN();
  });

  it('falls back to rows for a series without a blob or with another format version', async () => {
    const expected = await getGpuMetricsForPoint(sql, 10, { sampleBlobs: false });
    await storeBlobs([100]);
    const missing = observe();
    expect(await getGpuMetricsForPoint(missing.client, 10)).toStrictEqual(expected);
    expect(rowsRead(missing)).toBe(1);
    expect(missing.queries.find((text) => text.includes('from gpu_metric_samples'))).toBeDefined();

    await storeBlobs([101]);
    await sql`update gpu_metric_sample_blobs set format_version = ${GPU_SAMPLE_BLOB_FORMAT_VERSION + 1}`;
    const oldFormat = observe();
    expect(await getGpuMetricsForPoint(oldFormat.client, 10)).toStrictEqual(expected);
    expect(rowsRead(oldFormat)).toBe(1);
  });

  it('ignores a blob once the series is re-ingested', async () => {
    await storeBlobs(SERIES);
    await db.exec(`UPDATE gpu_metric_samples SET power_w = power_w + 1 WHERE series_id = 100;
      UPDATE gpu_metric_series SET ingested_at = ingested_at + interval '1 microsecond' WHERE id = 100;`);
    const observed = observe();
    const payload = await getGpuMetricsForPoint(observed.client, 10);
    expect(payload).toStrictEqual(await getGpuMetricsForPoint(sql, 10, { sampleBlobs: false }));
    expect(payload!.series[0]!.data[1]!.power).toBe(188.8);
    expect(rowsRead(observed)).toBe(1);
  });

  it('reads blobs over several queries when they exceed the per-query budget', async () => {
    const expected = await getGpuMetricsForRun(sql, RUN, {});
    await storeBlobs(SERIES);
    const observed = observe(1);
    expect(await getGpuMetricsForRun(observed.client, RUN, {})).toStrictEqual(expected);
    expect(count(observed, BLOB_QUERY)).toBe(2);
    expect(rowsRead(observed)).toBe(0);
    // More than one blob query: the series keys are re-checked afterwards.
    const versionChecks = observed.queries.filter(
      (text) => text.includes('ingested_at\n') && text.includes('where id = any'),
    );
    expect(versionChecks).toHaveLength(1);
  });

  it('reads rows until migration 022 exists, and the migration is idempotent', async () => {
    const expected = await getGpuMetricsForPoint(sql, 10, { sampleBlobs: false });
    await db.exec('DROP TABLE gpu_metric_sample_blobs');
    try {
      expect(await getGpuMetricsForPoint(sql, 10)).toStrictEqual(expected);
    } finally {
      const migration = new URL(
        '../../migrations/022_gpu_metric_sample_blobs.sql',
        import.meta.url,
      );
      await db.exec(fs.readFileSync(migration, 'utf8'));
      await db.exec(fs.readFileSync(migration, 'utf8'));
    }
    await storeBlobs(SERIES);
    expect(await getGpuMetricsForPoint(sql, 10)).toStrictEqual(expected);
  });

  it('stores no blob for rows it cannot reproduce and drops the previous one', async () => {
    await storeBlobs([101]);
    await sql`update gpu_metric_samples set sampled_at = sampled_at + interval '8000 years'
      where series_id = 101`;
    const result = await sql.begin((tx) => storeGpuSampleBlob(tx, 101));
    expect(result).toMatchObject({ status: 'skipped' });
    expect(await sql`select 1 from gpu_metric_sample_blobs where series_id = 101`).toEqual([]);
  });
});

describe('ingest with GPU_SAMPLE_BLOBS=1', () => {
  it('writes the blob in the sample transaction, and a later re-ingest without it stales the blob', async () => {
    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-blobs-'));
    try {
      fs.writeFileSync(
        path.join(artifactDir, 'gpu_metrics.csv'),
        'timestamp, index, power.draw [W], temperature.gpu\n' +
          '2026/09/11 04:19:41.982, 0, 187.80 W, 33\n' +
          '2026/09/11 04:19:41.982, 1, 190.55 W, 34\n' +
          '2026/09/11 04:19:42.982, 0, 188.10 W, 35\n',
      );
      fs.writeFileSync(
        path.join(artifactDir, 'gpu_metrics_context.json'),
        JSON.stringify({ timestamp_timezone: 'UTC' }),
      );
      const input = {
        workflowRunId: 1,
        artifact: { artifactName: 'gpu_metrics_blob', artifactDir },
        benchmarkResultIds: [12],
      };
      vi.stubEnv('GPU_SAMPLE_BLOBS', '1');
      try {
        await ingestGpuMetricsArtifact(sql, input);
      } finally {
        vi.unstubAllEnvs();
      }
      const expected = await getGpuMetricsForPoint(sql, 12, { sampleBlobs: false });
      const observed = observe();
      expect(await getGpuMetricsForPoint(observed.client, 12)).toStrictEqual(expected);
      expect(rowsRead(observed)).toBe(0);
      expect(expected!.series[0]!.data.map((sample) => sample.power)).toEqual([
        187.8, 190.55, 188.1,
      ]);

      fs.appendFileSync(
        path.join(artifactDir, 'gpu_metrics.csv'),
        '2026/09/11 04:19:43.982, 0, 189.00 W, 36\n',
      );
      await ingestGpuMetricsArtifact(sql, { ...input, replace: true });
      const replaced = observe();
      const payload = await getGpuMetricsForPoint(replaced.client, 12);
      expect(payload).toStrictEqual(await getGpuMetricsForPoint(sql, 12, { sampleBlobs: false }));
      expect(payload!.series[0]!.data).toHaveLength(4);
      expect(rowsRead(replaced)).toBe(1);
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
  });
});

it('strips only the series id from SQL rows', async () => {
  const sqlRows = await readSqlSampleRows(sql, [101]);
  const [first] = sqlRows.get(101)!;
  expect(Object.keys(storedSample(first!))).toEqual(
    Object.keys(first!).filter((key) => key !== 'series_id'),
  );
});

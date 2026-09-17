import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ingestGpuMetricsArtifact, prepareGpuMetricsArtifact } from './gpu-metrics-ingest';

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
  return Object.assign(client, {
    json: JSON.stringify,
    array: (value: unknown) => value,
  });
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  }
  sql = Object.assign(queryClient(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(queryClient(tx) as unknown as Sql)),
  }) as unknown as Sql;
}, 20_000);

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-09-11', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, 4, 4, 4, 4);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}'),
           (11, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, '{}');`);
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db?.close();
});

const NVIDIA_CSV = [
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
  '2026/09/11 04:19:41.982, 0, 187.80 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
  '2026/09/11 04:19:41.986, 1, 190.96 W, 39, 120 MHz, 3996 MHz, 0 %, 0 %',
  '2026/09/11 04:19:42.990, 0, 912.10 W, 61, 1965 MHz, 3996 MHz, 98 %, 74 %',
  '2026/09/11 04:19:42.994, 1, 905.30 W, 62, 1965 MHz, 3996 MHz, 97 %, 73 %',
  // Duplicate flush of the last sample, as emitted when the monitor stops.
  '2026/09/11 04:19:42.994, 1, 905.30 W, 62, 1965 MHz, 3996 MHz, 97 %, 73 %',
].join('\n');

function writeArtifact(csv: string, contextZone = 'UTC') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-metrics-ingest-'));
  roots.push(root);
  const artifactName = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0';
  const artifactDir = path.join(root, artifactName);
  fs.mkdirSync(artifactDir);
  fs.writeFileSync(path.join(artifactDir, 'gpu_metrics.csv'), csv);
  fs.writeFileSync(
    path.join(artifactDir, 'gpu_metrics_context.json'),
    JSON.stringify({ timestamp_timezone: contextZone }),
  );
  fs.writeFileSync(
    path.join(artifactDir, 'gpu_metrics_identity.csv'),
    'index, uuid, name\n0, GPU-a, NVIDIA B200\n1, GPU-b, NVIDIA B200\n',
  );
  return { artifactName, artifactDir };
}

describe('prepareGpuMetricsArtifact', () => {
  it('parses each CSV with its sidecars and digest', () => {
    const [series] = prepareGpuMetricsArtifact(writeArtifact(NVIDIA_CSV));
    expect(series?.fileName).toBe('gpu_metrics.csv');
    expect(series?.vendor).toBe('nvidia');
    expect(series?.samples).toHaveLength(5);
    expect(series?.gpuCount).toBe(2);
    expect(series?.sidecars.context).toEqual({ timestamp_timezone: 'UTC' });
    expect(series?.stats.find((s) => s.gpuIndex === 0 && s.metric === 'powerW')?.max).toBe(912.1);
  });
});

describe('ingestGpuMetricsArtifact', () => {
  it('stores series, samples, digest, and point links; reruns are no-ops', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10, 10],
    });
    expect(first.seriesIds).toHaveLength(1);
    // Five CSV rows, but the repeated final sample collapses on the primary key.
    expect(first.samplesInserted).toBe(4);
    expect(first.seriesSkipped).toBe(0);

    const [series] = await sql<
      {
        artifact_name: string;
        config_key: string;
        vendor: string;
        sample_count: number;
        gpu_count: number;
        started_at: Date;
        ended_at: Date;
        sample_interval_s: number | null;
      }[]
    >`select artifact_name, config_key, vendor, sample_count, gpu_count, started_at, ended_at,
        sample_interval_s from gpu_metric_series`;
    expect(series!.artifact_name).toBe(artifact.artifactName);
    expect(series!.config_key).toBe('dsr1_8k1k_fp4_sglang_conc32_b200-x_0');
    expect(series!.vendor).toBe('nvidia');
    expect(series!.sample_count).toBe(5);
    expect(series!.gpu_count).toBe(2);
    expect(new Date(series!.started_at).toISOString()).toBe('2026-09-11T04:19:41.982Z');
    expect(new Date(series!.ended_at).toISOString()).toBe('2026-09-11T04:19:42.994Z');
    expect(series!.sample_interval_s).toBeCloseTo(1.008, 3);

    const samples = await sql<{ gpu_index: number; power_w: number; sampled_at: Date }[]>`
      select gpu_index, power_w, sampled_at from gpu_metric_samples order by sampled_at, gpu_index`;
    expect(samples.map((s) => [s.gpu_index, s.power_w])).toEqual([
      [0, 187.8],
      [1, 190.96],
      [0, 912.1],
      [1, 905.3],
    ]);

    const stats = await sql<
      { gpu_index: number; metric: string; sample_count: number; max_value: number }[]
    >`
      select gpu_index, metric, sample_count, max_value from gpu_metric_gpu_stats
      where metric = 'power_w' order by gpu_index`;
    expect(stats).toEqual([
      { gpu_index: 0, metric: 'power_w', sample_count: 2, max_value: 912.1 },
      { gpu_index: 1, metric: 'power_w', sample_count: 3, max_value: 905.3 },
    ]);

    const links = await sql<{ benchmark_result_id: number }[]>`
      select benchmark_result_id from benchmark_result_gpu_metrics order by 1`;
    expect(links.map((l) => Number(l.benchmark_result_id))).toEqual([10]);

    const rerun = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10, 11],
    });
    expect(rerun.seriesIds).toEqual(first.seriesIds);
    expect(rerun.samplesInserted).toBe(0);
    expect(rerun.seriesSkipped).toBe(1);
    const relinked = await sql<{ benchmark_result_id: number }[]>`
      select benchmark_result_id from benchmark_result_gpu_metrics order by 1`;
    expect(relinked.map((l) => Number(l.benchmark_result_id))).toEqual([10, 11]);
    const [count] = await sql<{ n: number }[]>`select count(*)::int as n from gpu_metric_samples`;
    expect(count!.n).toBe(4);
  });

  it('replaces samples and digest when the CSV content changes', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    await ingestGpuMetricsArtifact(sql, { workflowRunId: 1, artifact, benchmarkResultIds: [10] });

    const longer = `${NVIDIA_CSV}\n2026/09/11 04:19:43.990, 0, 950.00 W, 65, 1965 MHz, 3996 MHz, 99 %, 75 %`;
    fs.writeFileSync(path.join(artifact.artifactDir, 'gpu_metrics.csv'), longer);
    const result = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(result.samplesInserted).toBe(5);
    expect(result.seriesSkipped).toBe(0);
    const [series] = await sql<{ n: number; sample_count: number }[]>`
      select (select count(*)::int from gpu_metric_series) as n, sample_count from gpu_metric_series`;
    expect(series!.n).toBe(1);
    expect(series!.sample_count).toBe(6);
    const [stat] = await sql<{ max_value: number }[]>`
      select max_value from gpu_metric_gpu_stats where gpu_index = 0 and metric = 'power_w'`;
    expect(stat!.max_value).toBe(950);
  });

  it('ignores artifacts whose CSVs cannot be parsed', async () => {
    const artifact = writeArtifact('nonsense,header\n1,2\n');
    const result = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(result).toEqual({ seriesIds: [], samplesInserted: 0, seriesSkipped: 0 });
  });
});

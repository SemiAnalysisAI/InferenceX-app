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

// Multinode bundle: two hosts × two GPUs × two scrapes, host-local indices.
const MULTINODE_POWER_CSV = [
  'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
  '1,1789194365.292,4,host-b,0,GPU-b0,401.5',
  '1,1789194365.292,4,host-a,0,GPU-a0,186.656',
  '1,1789194365.292,4,host-a,1,GPU-a1,190.1',
  '1,1789194366.292,5,host-a,0,GPU-a0,700.25',
  '1,1789194366.292,5,host-a,1,GPU-a1,702.0',
  '1,1789194366.292,5,host-b,0,GPU-b0,650.0',
  '1,1789194366.292,5,host-b,1,GPU-b1,655.0',
  '1,1789194366.292,5,host-a,0,GPU-a0,999.0',
].join('\n');
const MULTINODE_MANIFEST = {
  schema_version: 1,
  producer: 'srt-slurm.dcgm-power',
  source_metric: 'DCGM_FI_DEV_POWER_USAGE',
  sample_interval_seconds: 1,
};

function writePowerAuditArtifact(options: { withGpuMetricsCsv?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-metrics-ingest-'));
  roots.push(root);
  const artifactName = 'power_audit_kimik3_conc8_fp4_dynamo-vllm_b200-slurm_0';
  const artifactDir = path.join(root, artifactName);
  fs.mkdirSync(path.join(artifactDir, 'LOGS', 'power'), { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'LOGS', 'power', 'samples.csv'), MULTINODE_POWER_CSV);
  fs.writeFileSync(
    path.join(artifactDir, 'LOGS', 'power', 'manifest.json'),
    JSON.stringify(MULTINODE_MANIFEST),
  );
  fs.writeFileSync(path.join(artifactDir, 'agg_kimik3_conc8.json'), '{}');
  if (options.withGpuMetricsCsv) {
    fs.writeFileSync(path.join(artifactDir, 'gpu_metrics.csv'), NVIDIA_CSV);
  }
  return { artifactName, artifactDir };
}

describe('prepareGpuMetricsArtifact', () => {
  it('falls back to the multinode power bundle, one power-only series per host', () => {
    const prepared = prepareGpuMetricsArtifact(writePowerAuditArtifact());
    expect(prepared.map((series) => series.fileName)).toEqual([
      'LOGS/power/samples.csv#host-a',
      'LOGS/power/samples.csv#host-b',
    ]);
    const [hostA, hostB] = prepared;
    expect(hostA!.vendor).toBe('nvidia');
    expect(hostA!.gpuCount).toBe(2);
    expect(hostA!.samples).toHaveLength(4);
    expect(hostA!.startedAtMs).toBe(1789194365292);
    expect(hostA!.endedAtMs).toBe(1789194366292);
    expect(hostA!.sampleIntervalS).toBe(1);
    // One deployment-wide CSV: both host series share its hash.
    expect(hostB!.csvSha256).toBe(hostA!.csvSha256);
    // Only power was scraped; no zero-filled clock/temperature/utilization digests.
    expect(new Set(hostA!.stats.map((s) => s.metric))).toEqual(new Set(['powerW']));
    expect(hostA!.stats.find((s) => s.gpuIndex === 1)?.max).toBe(702);
    expect(hostA!.sidecars.context).toEqual(MULTINODE_MANIFEST);
    expect(hostA!.sidecars.identity).toEqual([
      { hostname: 'host-a', gpu_index: 0, gpu_uuid: 'GPU-a0' },
      { hostname: 'host-a', gpu_index: 1, gpu_uuid: 'GPU-a1' },
    ]);
    expect(hostA!.sidecars.energyStart).toBeNull();
  });

  it('prefers an nvidia-smi CSV in the same bundle over the power-only samples', () => {
    // Single-node jobs upload gpu_metrics.csv inside power_audit_ as well.
    const prepared = prepareGpuMetricsArtifact(
      writePowerAuditArtifact({ withGpuMetricsCsv: true }),
    );
    expect(prepared.map((series) => series.fileName)).toEqual(['gpu_metrics.csv']);
  });

  it('parses each CSV with its sidecars and digest', () => {
    const [series] = prepareGpuMetricsArtifact(writeArtifact(NVIDIA_CSV));
    expect(series?.fileName).toBe('gpu_metrics.csv');
    expect(series?.vendor).toBe('nvidia');
    expect(series?.samples).toHaveLength(4);
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
    expect(series!.sample_count).toBe(4);
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
      { gpu_index: 1, metric: 'power_w', sample_count: 2, max_value: 905.3 },
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

  it('stores every host of a multinode power bundle under the bare config key', async () => {
    const artifact = writePowerAuditArtifact();
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(first.seriesIds).toHaveLength(2);
    expect(first.samplesInserted).toBe(7);

    const series = await sql<{ config_key: string; file_name: string; gpu_count: number }[]>`
      select config_key, file_name, gpu_count from gpu_metric_series order by file_name`;
    expect(series).toEqual([
      {
        config_key: 'kimik3_conc8_fp4_dynamo-vllm_b200-slurm_0',
        file_name: 'LOGS/power/samples.csv#host-a',
        gpu_count: 2,
      },
      {
        config_key: 'kimik3_conc8_fp4_dynamo-vllm_b200-slurm_0',
        file_name: 'LOGS/power/samples.csv#host-b',
        gpu_count: 2,
      },
    ]);
    const metrics = await sql<{ metric: string }[]>`
      select distinct metric from gpu_metric_gpu_stats`;
    expect(metrics.map((m) => m.metric)).toEqual(['power_w']);
    const links = await sql<{ n: number }[]>`
      select count(*)::int as n from benchmark_result_gpu_metrics where benchmark_result_id = 10`;
    expect(links[0]!.n).toBe(2);
    const [hostA] = await sql<{ sample_count: number; mean_value: number; power_w: number }[]>`
      select stats.sample_count, stats.mean_value, samples.power_w
      from gpu_metric_series series
      join gpu_metric_gpu_stats stats on stats.series_id = series.id
      join gpu_metric_samples samples on samples.series_id = series.id
        and samples.gpu_index = stats.gpu_index
      where series.file_name = 'LOGS/power/samples.csv#host-a'
        and stats.gpu_index = 0 and stats.metric = 'power_w'
      order by samples.sampled_at desc limit 1`;
    expect(hostA!.sample_count).toBe(2);
    expect(hostA!.mean_value).toBeCloseTo((186.656 + 700.25) / 2, 3);
    expect(hostA!.power_w).toBe(700.25);

    const rerun = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(rerun.samplesInserted).toBe(0);
    expect(rerun.seriesSkipped).toBe(2);
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
    expect(series!.sample_count).toBe(5);
    const [stat] = await sql<{ max_value: number }[]>`
      select max_value from gpu_metric_gpu_stats where gpu_index = 0 and metric = 'power_w'`;
    expect(stat!.max_value).toBe(950);
  });

  it('uses the first reading per GPU/timestamp for stored samples, metadata, and digest', async () => {
    const csv = [
      NVIDIA_CSV.split('\n')[0],
      '2026/09/11 04:19:41.000, 0, 100 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
      '2026/09/11 04:19:41.000, 1, 200 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
      '2026/09/11 04:19:42.000, 0, 300 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
      '2026/09/11 04:19:42.000, 0, 900 W, 33, 120 MHz, 3996 MHz, 0 %, 0 %',
    ].join('\n');
    const artifact = writeArtifact(csv);
    await ingestGpuMetricsArtifact(sql, { workflowRunId: 1, artifact, benchmarkResultIds: [10] });

    const samples = await sql<{ gpu_index: number; power_w: number }[]>`
      select gpu_index, power_w from gpu_metric_samples order by sampled_at, gpu_index`;
    expect(samples).toEqual([
      { gpu_index: 0, power_w: 100 },
      { gpu_index: 1, power_w: 200 },
      { gpu_index: 0, power_w: 300 },
    ]);
    const [series] = await sql<{ sample_count: number; gpu_count: number }[]>`
      select sample_count, gpu_count from gpu_metric_series`;
    expect(series).toEqual({ sample_count: 3, gpu_count: 2 });
    const stats = await sql<{ gpu_index: number; sample_count: number; mean_value: number }[]>`
      select gpu_index, sample_count, mean_value from gpu_metric_gpu_stats
      where metric = 'power_w' order by gpu_index`;
    expect(stats).toEqual([
      { gpu_index: 0, sample_count: 2, mean_value: 200 },
      { gpu_index: 1, sample_count: 1, mean_value: 200 },
    ]);
  });

  it('repairs an existing duplicate-inflated digest when the same CSV is re-ingested', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    // Model an earlier ingest: SQL stored unique samples, but metadata and stats
    // counted the repeated final CSV row. Its CSV hash and sidecars still match.
    await sql`update gpu_metric_series set sample_count = 5`;
    await sql`update gpu_metric_gpu_stats set sample_count = 3, mean_value = 667.1867
      where gpu_index = 1 and metric = 'power_w'`;

    const result = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(result.seriesIds).toEqual(first.seriesIds);
    expect(result.seriesSkipped).toBe(0);
    const [series] = await sql<{ sample_count: number; stored_count: number }[]>`
      select sample_count, (select count(*)::int from gpu_metric_samples) as stored_count
      from gpu_metric_series`;
    expect(series).toEqual({ sample_count: 4, stored_count: 4 });
    const [stat] = await sql<{ sample_count: number; mean_value: number }[]>`
      select sample_count, mean_value from gpu_metric_gpu_stats
      where gpu_index = 1 and metric = 'power_w'`;
    expect(stat!.sample_count).toBe(2);
    expect(stat!.mean_value).toBeCloseTo((190.96 + 905.3) / 2, 3);
  });

  it('replaces timestamps when only the context timezone is corrected', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    const before = await sql<{ sampled_at: Date }[]>`
      select sampled_at from gpu_metric_samples order by sampled_at, gpu_index`;
    fs.writeFileSync(
      path.join(artifact.artifactDir, 'gpu_metrics_context.json'),
      JSON.stringify({ timestamp_timezone: '+02:00' }),
    );

    const result = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(result.seriesIds).toEqual(first.seriesIds);
    expect(result.samplesInserted).toBe(4);
    expect(result.seriesSkipped).toBe(0);
    const after = await sql<{ sampled_at: Date }[]>`
      select sampled_at from gpu_metric_samples order by sampled_at, gpu_index`;
    expect(after.map((s) => new Date(s.sampled_at).getTime())).toEqual(
      before.map((s) => new Date(s.sampled_at).getTime() - 2 * 60 * 60 * 1000),
    );
    const [series] = await sql<{ started_at: Date; ended_at: Date; context: unknown }[]>`
      select started_at, ended_at, sidecars -> 'context' as context from gpu_metric_series`;
    expect(new Date(series!.started_at).toISOString()).toBe('2026-09-11T02:19:41.982Z');
    expect(new Date(series!.ended_at).toISOString()).toBe('2026-09-11T02:19:42.994Z');
    expect(series!.context).toEqual({ timestamp_timezone: '+02:00' });
  });

  it('persists identity-only sidecar corrections without changing the series or samples', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    const before = await sql`select * from gpu_metric_samples order by sampled_at, gpu_index`;
    fs.writeFileSync(
      path.join(artifact.artifactDir, 'gpu_metrics_identity.csv'),
      'index, uuid, name\n0, GPU-corrected, NVIDIA B200\n1, GPU-b, NVIDIA B200\n',
    );

    const result = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(result.seriesIds).toEqual(first.seriesIds);
    const [series] = await sql<{ identity: unknown }[]>`
      select sidecars -> 'identity' as identity from gpu_metric_series`;
    expect(series!.identity).toEqual([
      { index: '0', uuid: 'GPU-corrected', name: 'NVIDIA B200' },
      { index: '1', uuid: 'GPU-b', name: 'NVIDIA B200' },
    ]);
    expect(await sql`select * from gpu_metric_samples order by sampled_at, gpu_index`).toEqual(
      before,
    );
  });

  it('keeps reruns as no-ops when only JSON object key order changes', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const contextPath = path.join(artifact.artifactDir, 'gpu_metrics_context.json');
    fs.writeFileSync(
      contextPath,
      JSON.stringify({ timestamp_timezone: 'UTC', collector: { name: 'nvidia-smi', version: 1 } }),
    );
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    const [before] = await sql<{ ingested_at: Date }[]>`select ingested_at from gpu_metric_series`;
    fs.writeFileSync(
      contextPath,
      JSON.stringify({ collector: { version: 1, name: 'nvidia-smi' }, timestamp_timezone: 'UTC' }),
    );

    const result = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(result).toEqual({ seriesIds: first.seriesIds, samplesInserted: 0, seriesSkipped: 1 });
    const [after] = await sql<{ ingested_at: Date }[]>`select ingested_at from gpu_metric_series`;
    expect(after!.ingested_at).toEqual(before!.ingested_at);
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

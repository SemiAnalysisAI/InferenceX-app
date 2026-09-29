import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ingestGpuMetricsArtifact,
  prepareGpuMetricsArtifact,
  refreshGpuMetricStats,
} from './gpu-metrics-ingest';

import { findOutdatedGpuMetricSeries } from '../lib/gpu-metrics-backfill';
import { GPU_STATS_VERSION } from '../lib/gpu-metric-stats';

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

async function storedSeries(seriesId: number) {
  return {
    metadata: await sql`select * from gpu_metric_series where id = ${seriesId}`,
    samples: await sql`select * from gpu_metric_samples where series_id = ${seriesId}
      order by sampled_at, gpu_index`,
    stats: await sql`select * from gpu_metric_gpu_stats where series_id = ${seriesId}
      order by gpu_index, metric`,
    links: await sql`select * from benchmark_result_gpu_metrics where series_id = ${seriesId}
      order by benchmark_result_id`,
  };
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of [
    '001_initial_schema.sql',
    '016_gpu_metrics.sql',
    '017_gpu_metric_stats_version.sql',
  ]) {
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

function writePowerAuditArtifact() {
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
});

describe('ingestGpuMetricsArtifact', () => {
  it('refuses a partial artifact when a discovered host CSV has only a header', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const missingHostFile = path.join(artifact.artifactDir, 'host-b', 'gpu_metrics.csv');
    fs.mkdirSync(path.dirname(missingHostFile));
    fs.writeFileSync(missingHostFile, NVIDIA_CSV.split('\n')[0]!);
    await expect(
      ingestGpuMetricsArtifact(sql, {
        workflowRunId: 1,
        artifact,
        benchmarkResultIds: [10],
      }),
    ).rejects.toThrow('host-b/gpu_metrics.csv');
    const before = await sql`select count(*)::int as n from gpu_metric_series`;
    expect(before).toEqual([{ n: 0 }]);
    fs.writeFileSync(missingHostFile, NVIDIA_CSV);
    const recovered = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(recovered.seriesIds).toHaveLength(2);
    expect(recovered.samplesInserted).toBe(8);
    const replay = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    expect(replay.samplesInserted).toBe(0);
  });

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

  it('rolls back a replacement when point linking fails and retries without losing existing links', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
    });
    const seriesId = first.seriesIds[0]!;
    const before = await storedSeries(seriesId);
    fs.writeFileSync(
      path.join(artifact.artifactDir, 'gpu_metrics.csv'),
      `${NVIDIA_CSV}\n2026/09/11 04:19:43.990, 0, 950.00 W, 65, 1965 MHz, 3996 MHz, 99 %, 75 %`,
    );
    fs.writeFileSync(
      path.join(artifact.artifactDir, 'gpu_metrics_context.json'),
      JSON.stringify({ timestamp_timezone: '+02:00' }),
    );

    // Point links are written last, after replacement metadata, samples and stats.
    await expect(
      ingestGpuMetricsArtifact(sql, {
        workflowRunId: 1,
        artifact,
        benchmarkResultIds: [11, 999],
      }),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await storedSeries(seriesId)).toEqual(before);

    const recovered = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [11],
    });
    expect(recovered).toEqual({
      metadataUpdatedBenchmarkResultIds: [],
      seriesIds: [seriesId],
      samplesInserted: 5,
      seriesSkipped: 0,
    });
    const after = await storedSeries(seriesId);
    expect(after.metadata).toMatchObject([
      { sample_count: 5, sidecars: { context: { timestamp_timezone: '+02:00' } } },
    ]);
    expect(after.metadata[0]!.csv_sha256).not.toBe(before.metadata[0]!.csv_sha256);
    expect(after.samples).toHaveLength(5);
    expect(new Date(after.samples[0]!.sampled_at).toISOString()).toBe('2026-09-11T02:19:41.982Z');
    expect(
      after.stats.find((row) => row.gpu_index === 0 && row.metric === 'power_w'),
    ).toMatchObject({
      sample_count: 3,
      max_value: 950,
    });
    expect(after.links.map((row) => Number(row.benchmark_result_id))).toEqual([10, 11]);
  });
});

describe('versioned full-record digests', () => {
  it('upgrades unchanged input without rewriting samples or links, then becomes a no-op', async () => {
    const input = {
      workflowRunId: 1,
      artifact: writeArtifact(NVIDIA_CSV),
      benchmarkResultIds: [10, 11],
    };
    const first = await ingestGpuMetricsArtifact(sql, input);
    const id = first.seriesIds[0]!;
    const original = await storedSeries(id);
    await sql`update gpu_metric_series set stats_version = 0 where id = ${id}`;
    await sql`update gpu_metric_gpu_stats set mean_value = -1 where series_id = ${id}`;
    const updated = await ingestGpuMetricsArtifact(sql, input);
    expect(updated).toMatchObject({ samplesInserted: 0, seriesSkipped: 0 });
    expect(await storedSeries(id)).toEqual(original);
    expect(await ingestGpuMetricsArtifact(sql, input)).toMatchObject({
      samplesInserted: 0,
      seriesSkipped: 1,
    });
  });

  it('backfills both retained hosts without artifacts; preserves null metrics, links and unrelated series', async () => {
    const artifact = writePowerAuditArtifact();
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10, 11],
    });
    const unrelated = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writeArtifact(NVIDIA_CSV),
      benchmarkResultIds: [10],
    });
    const untouched = await storedSeries(unrelated.seriesIds[0]!);
    const originals = await Promise.all(first.seriesIds.map(storedSeries));
    await sql`update gpu_metric_series set stats_version = 0 where id = any(${sql.array(first.seriesIds)}::bigint[])`;
    await sql`update gpu_metric_gpu_stats set mean_value = -1 where series_id = any(${sql.array(first.seriesIds)}::bigint[])`;
    fs.rmSync(artifact.artifactDir, { recursive: true });
    // No default retention cutoff: old runs remain repairable.
    await sql`update workflow_runs set date = '2020-01-01' where id = 1`;
    const targets = await findOutdatedGpuMetricSeries(
      sql,
      { run: null, attempt: null, artifact: null, fromRun: null, since: null },
      null,
    );
    expect(targets.map((row) => Number(row.id))).toEqual(first.seriesIds);
    expect(
      await findOutdatedGpuMetricSeries(
        sql,
        { run: 34557177019, attempt: 2, artifact: null, fromRun: null, since: null },
        null,
      ),
    ).toEqual([]);
    for (const [index, id] of first.seriesIds.entries()) {
      expect(await refreshGpuMetricStats(sql, id)).toBe(true);
      expect(await storedSeries(id)).toEqual(originals[index]);
      expect(await refreshGpuMetricStats(sql, id)).toBe(false);
    }
    expect(await storedSeries(unrelated.seriesIds[0]!)).toEqual(untouched);
  });

  it('rolls back a failed digest replacement and permits retry; refuses incomplete samples', async () => {
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writeArtifact(NVIDIA_CSV),
      benchmarkResultIds: [10],
    });
    const id = first.seriesIds[0]!;
    await sql`update gpu_metric_series set stats_version = 0 where id = ${id}`;
    await sql`update gpu_metric_gpu_stats set mean_value = -1 where series_id = ${id}`;
    const before = await storedSeries(id);
    await db.exec(
      'ALTER TABLE gpu_metric_gpu_stats ADD CONSTRAINT reject_stats CHECK (mean_value < 0)',
    );
    await expect(refreshGpuMetricStats(sql, id)).rejects.toMatchObject({ code: '23514' });
    expect(await storedSeries(id)).toEqual(before);
    await db.exec('ALTER TABLE gpu_metric_gpu_stats DROP CONSTRAINT reject_stats');
    expect(await refreshGpuMetricStats(sql, id)).toBe(true);
    const recovered = await storedSeries(id);
    expect(recovered.metadata[0]?.stats_version).toBe(GPU_STATS_VERSION);
    await sql`update gpu_metric_series set stats_version = 0 where id = ${id}`;
    await sql`delete from gpu_metric_samples where series_id = ${id} and gpu_index = 0`;
    const incomplete = await storedSeries(id);
    await expect(refreshGpuMetricStats(sql, id)).rejects.toThrow('missing samples');
    expect(await storedSeries(id)).toEqual(incomplete);
  });
});

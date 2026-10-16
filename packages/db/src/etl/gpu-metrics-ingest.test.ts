import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { computeGpuMetricStats } from './gpu-metrics-csv';
import {
  gpuMetricsArtifactHoldsTelemetry,
  ingestGpuMetricsArtifact,
  prepareGpuMetricsArtifact,
  type GpuMetricsIngestResult,
} from './gpu-metrics-ingest';

import type { DbClient } from '../connection';
import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { getGpuMetricsForPoint, getGpuMetricsForRun } from '../queries/gpu-metrics';
import { getGpuMetricsPointRevision } from '../queries/gpu-metrics-revision';

let db: PGlite;
let sql: PgliteSql;
const roots: string[] = [];

async function storedSeries(seriesId: number) {
  return {
    metadata: await sql`select * from gpu_metric_series where id = ${seriesId}`,
    samples: await sql`select * from gpu_metric_samples where series_id = ${seriesId}
      order by sampled_at, gpu_index`,
    links: await sql`select * from benchmark_result_gpu_metrics where series_id = ${seriesId}
      order by benchmark_result_id`,
  };
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
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

function writePowerAuditArtifact(
  csv = MULTINODE_POWER_CSV,
  manifest: Record<string, unknown> = MULTINODE_MANIFEST,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-metrics-ingest-'));
  roots.push(root);
  const artifactName = 'power_audit_kimik3_conc8_fp4_dynamo-vllm_b200-slurm_0';
  const artifactDir = path.join(root, artifactName);
  fs.mkdirSync(path.join(artifactDir, 'LOGS', 'power'), { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'LOGS', 'power', 'samples.csv'), csv);
  fs.writeFileSync(
    path.join(artifactDir, 'LOGS', 'power', 'manifest.json'),
    JSON.stringify(manifest),
  );
  fs.writeFileSync(path.join(artifactDir, 'agg_kimik3_conc8.json'), '{}');
  return { artifactName, artifactDir };
}

describe('gpuMetricsArtifactHoldsTelemetry', () => {
  function sidecarOnlyArtifact() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-metrics-ingest-'));
    roots.push(root);
    const artifactName = 'power_audit_dsv41flash_conc4096_gb300';
    const artifactDir = path.join(root, artifactName);
    fs.mkdirSync(path.join(artifactDir, 'LOGS', 'power'), { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'power_audit.json'), '{}');
    fs.writeFileSync(path.join(artifactDir, 'gpu_metrics_identity.csv'), 'gpu_index,uuid\n');
    fs.writeFileSync(path.join(artifactDir, 'LOGS', 'power', 'manifest.json'), '{}');
    return { artifactName, artifactDir };
  }

  it('is false when the artifact holds only sidecars', () => {
    expect(gpuMetricsArtifactHoldsTelemetry(sidecarOnlyArtifact())).toBe(false);
  });

  it('is true for a GPU metrics CSV, even an unparseable one', () => {
    const artifact = sidecarOnlyArtifact();
    fs.writeFileSync(path.join(artifact.artifactDir, 'gpu_metrics.csv'), 'not,a,metrics,csv\n');
    expect(gpuMetricsArtifactHoldsTelemetry(artifact)).toBe(true);
    expect(prepareGpuMetricsArtifact(artifact)).toEqual([]);
  });

  it('is true for multinode power samples', () => {
    expect(gpuMetricsArtifactHoldsTelemetry(writePowerAuditArtifact())).toBe(true);
  });
});

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
    // Only power was scraped; no zero-filled clock/temperature/utilization statistics.
    const stats = computeGpuMetricStats(hostA!.samples);
    expect(new Set(stats.map((s) => s.metric))).toEqual(new Set(['powerW']));
    expect(stats.find((s) => s.gpuIndex === 1)?.max).toBe(702);
    expect(hostA!.sidecars.context).toEqual(MULTINODE_MANIFEST);
    expect(hostA!.sidecars.identity).toEqual([
      { hostname: 'host-a', gpu_index: 0, gpu_uuid: 'GPU-a0' },
      { hostname: 'host-a', gpu_index: 1, gpu_uuid: 'GPU-a1' },
    ]);
    expect(hostA!.sidecars.energyStart).toBeNull();
  });

  it('prefers an SMI CSV in the bundle over its per-host power samples', () => {
    const artifact = writePowerAuditArtifact();
    fs.writeFileSync(path.join(artifact.artifactDir, 'gpu_metrics.csv'), NVIDIA_CSV);
    expect(prepareGpuMetricsArtifact(artifact).map((series) => series.fileName)).toEqual([
      'gpu_metrics.csv',
    ]);
  });

  it.each([undefined, 'gpu_board_power'])(
    'recognizes the AMD source metric with power scope %s',
    (powerScope) => {
      const artifact = writePowerAuditArtifact(MULTINODE_POWER_CSV, {
        ...MULTINODE_MANIFEST,
        source_metric: 'gpu_power_usage',
        power_scope: powerScope,
      });
      expect(prepareGpuMetricsArtifact(artifact).map(({ vendor }) => vendor)).toEqual([
        'amd',
        'amd',
      ]);
    },
  );
});

describe('ingestGpuMetricsArtifact', () => {
  it('retains known missing artifacts when a later repair has a narrower retained inventory', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const input = { workflowRunId: 1, artifact, benchmarkResultIds: [10] };
    await ingestGpuMetricsArtifact(sql, {
      ...input,
      expectedRunArtifacts: [artifact.artifactName, 'gpu_metrics_expired'],
    });
    await ingestGpuMetricsArtifact(sql, {
      ...input,
      expectedRunArtifacts: [artifact.artifactName],
    });
    const payload = await getGpuMetricsForRun(sql, 34557177019);
    expect(payload?.coverage).toEqual({
      status: 'partial',
      missingArtifacts: ['gpu_metrics_expired'],
    });
    expect(payload?.series[0]?.sidecars.runArtifactInventory).toEqual(
      [artifact.artifactName, 'gpu_metrics_expired'].sort(),
    );
  });

  it('persists native AMD temperature and utilization by column name through the point reader', async () => {
    const csv = [
      'temperature_c,sm_active,hostname,power_w,GPU_UTIL_PCT,gpu_index,timestamp_unix,gpu_uuid,schema_version,scrape_seq',
      '68,0.72,host-a,450,85,0,1789194365.292,GPU-a0,3,4',
      '70,0.81,host-a,470,95,0,1789194366.292,GPU-a0,3,5',
    ].join('\n');
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writePowerAuditArtifact(csv, {
        ...MULTINODE_MANIFEST,
        source_metric: 'gpu_power_usage',
        power_scope: 'gpu_device_power_as_reported_by_amd_device_metrics_exporter',
      }),
      benchmarkResultIds: [10],
    });

    const payload = await getGpuMetricsForPoint(sql, 10);
    expect(payload?.series).toHaveLength(1);
    const series = payload!.series[0]!;
    expect(series.vendor).toBe('amd');
    expect(
      series.data.map(({ power, temperature, gpuUtil }) => ({ power, temperature, gpuUtil })),
    ).toEqual([
      { power: 450, temperature: 68, gpuUtil: 85 },
      { power: 470, temperature: 70, gpuUtil: 95 },
    ]);
  });

  it('preserves native v1 power without uncollected metrics', async () => {
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writePowerAuditArtifact(
        [
          'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
          '1,1789194365.292,4,host-a,0,GPU-a0,450',
        ].join('\n'),
      ),
      benchmarkResultIds: [10],
    });

    const payload = await getGpuMetricsForPoint(sql, 10);
    expect(payload?.series).toHaveLength(1);
    const series = payload!.series[0]!;
    expect(
      series.data.map(({ power, temperature, gpuUtil }) => ({ power, temperature, gpuUtil })),
    ).toEqual([{ power: 450, temperature: undefined, gpuUtil: undefined }]);
    expect(series.stats.map(({ metric }) => metric)).toEqual(['power_w']);
  });

  it('preserves optional zero readings and omits absent, invalid and unavailable native readings', async () => {
    const csv = [
      'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w,gpu_util_pct,sm_active,temperature_c',
      '3,1789194365,0,host-a,0,GPU-a0,450,0,0.72,0',
      '3,1789194366,1,host-a,0,GPU-a0,451,100,0.72,-273.15',
      '3,1789194367,2,host-a,0,GPU-a0,452, ,0.72, ',
      '3,1789194368,3,host-a,0,GPU-a0,453,NaN,0.72,NaN',
      '3,1789194371,6,host-a,0,GPU-a0,456,-1,0.72,-274',
      '3,1789194372,7,host-a,0,GPU-a0,457,101,0.72,2147483632',
      '3,1789194373,8,host-a,0,GPU-a0,458',
      '3,1789194374,9,host-a,0,GPU-a0,459,,0.72,64',
    ].join('\n');
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writePowerAuditArtifact(csv),
      benchmarkResultIds: [10],
    });

    const payload = await getGpuMetricsForPoint(sql, 10);
    expect(payload?.series).toHaveLength(1);
    const series = payload!.series[0]!;
    expect(
      series.data.map(({ power, temperature, gpuUtil }) => [power, temperature, gpuUtil]),
    ).toEqual([
      [450, 0, 0],
      [451, -273.15, 100],
      [452, undefined, undefined],
      [453, undefined, undefined],
      [456, undefined, undefined],
      [457, undefined, undefined],
      [458, undefined, undefined],
      [459, 64, undefined],
    ]);
    expect(
      series.stats.map(({ metric, count, min, max }) => ({ metric, count, min, max })),
    ).toEqual([
      { metric: 'gpu_util_pct', count: 2, min: 0, max: 100 },
      { metric: 'power_w', count: 8, min: 450, max: 459 },
      { metric: 'temperature_c', count: 3, min: -273.15, max: 64 },
    ]);
  });

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

  it("replaces a retried point's links with the latest copy's series", async () => {
    const older = writeArtifact(NVIDIA_CSV);
    const retry = writeArtifact(NVIDIA_CSV);
    const newer = {
      artifactName: `${retry.artifactName}_retry`,
      artifactDir: `${retry.artifactDir}_retry`,
    };
    fs.renameSync(retry.artifactDir, newer.artifactDir);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: older,
      benchmarkResultIds: [10, 11],
    });

    // Without replacement a second copy adds its series next to the first.
    const appended = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: newer,
      benchmarkResultIds: [10],
    });
    const mixed = await getGpuMetricsForPoint(sql, 10);
    expect(mixed?.series).toHaveLength(2);

    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: newer,
      benchmarkResultIds: [10],
      replacePointLinks: true,
    });
    const point = await getGpuMetricsForPoint(sql, 10);
    expect(point?.series.map((series) => series.artifactName)).toEqual([newer.artifactName]);
    const kept = await storedSeries(appended.seriesIds[0]!);
    expect(kept.links).toHaveLength(1);
    // Other points keep their own links.
    const dropped = await storedSeries(first.seriesIds[0]!);
    expect(dropped.links).toMatchObject([{ benchmark_result_id: 11 }]);
  });

  it('stores series, samples and point links; reruns are no-ops', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10, 10],
      expectedRunArtifacts: [artifact.artifactName],
    });
    expect(first.seriesIds).toHaveLength(1);
    expect(first.samplesInserted).toBe(4);
    expect(first.seriesSkipped).toBe(0);
    const stored = await storedSeries(first.seriesIds[0]!);
    expect(stored.metadata[0]!.sidecars).toMatchObject({
      runArtifactInventory: [artifact.artifactName],
    });

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

    const links = await sql<{ benchmark_result_id: number }[]>`
      select benchmark_result_id from benchmark_result_gpu_metrics order by 1`;
    expect(links.map((l) => Number(l.benchmark_result_id))).toEqual([10]);

    const rerun = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10, 11],
      expectedRunArtifacts: [artifact.artifactName],
    });
    expect(rerun.seriesIds).toEqual(first.seriesIds);
    expect(rerun.samplesInserted).toBe(0);
    expect(rerun.seriesSkipped).toBe(1);
    const relinked = await sql<{ benchmark_result_id: number }[]>`
      select benchmark_result_id from benchmark_result_gpu_metrics order by 1`;
    expect(relinked.map((l) => Number(l.benchmark_result_id))).toEqual([10, 11]);
    const [count] = await sql<{ n: number }[]>`select count(*)::int as n from gpu_metric_samples`;
    expect(count!.n).toBe(4);
    // Models a parser change: the stored count no longer matches the unchanged CSV.
    await sql`update gpu_metric_series set sample_count = 5`;
    expect(
      await ingestGpuMetricsArtifact(sql, { workflowRunId: 1, artifact, benchmarkResultIds: [] }),
    ).toMatchObject({ samplesInserted: 4, seriesSkipped: 0 });
  });

  it('replaces unchanged series when forced, so a parser fix reaches stored samples', async () => {
    const artifact = writeArtifact(NVIDIA_CSV);
    const input = { workflowRunId: 1, artifact, benchmarkResultIds: [10] };
    const first = await ingestGpuMetricsArtifact(sql, input);
    // Values an earlier parser stored from the same CSV, sidecars and count.
    await sql`update gpu_metric_samples set power_w = 7`;
    expect(await ingestGpuMetricsArtifact(sql, { ...input, replace: true })).toEqual({
      seriesIds: first.seriesIds,
      samplesInserted: 4,
      seriesSkipped: 0,
    });
    const samples = await sql<{ power_w: number }[]>`
      select power_w from gpu_metric_samples order by sampled_at, gpu_index`;
    expect(samples.map((s) => s.power_w)).toEqual([187.8, 190.96, 912.1, 905.3]);
  });

  it('removes stale host series, samples and point links when an artifact shrinks', async () => {
    const artifact = writePowerAuditArtifact();
    const input = { workflowRunId: 1, artifact, benchmarkResultIds: [10] };
    const first = await ingestGpuMetricsArtifact(sql, input);
    const sibling = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writeArtifact(NVIDIA_CSV),
      benchmarkResultIds: [11],
    });
    const staleId = first.seriesIds[1]!;
    fs.writeFileSync(
      path.join(artifact.artifactDir, 'LOGS', 'power', 'samples.csv'),
      MULTINODE_POWER_CSV.split('\n')
        .filter((line) => !line.includes('host-b'))
        .join('\n'),
    );

    const refreshed = await ingestGpuMetricsArtifact(sql, input);
    const payload = await getGpuMetricsForPoint(sql, 10);
    const storedSibling = await storedSeries(sibling.seriesIds[0]!);

    expect(refreshed.seriesIds).toEqual([first.seriesIds[0]]);
    expect(await storedSeries(staleId)).toEqual({ metadata: [], samples: [], links: [] });
    expect(payload?.series.map(({ fileName }) => fileName)).toEqual([
      'LOGS/power/samples.csv#host-a',
    ]);
    expect(storedSibling.samples).toHaveLength(4);
  });

  it.each([
    { name: 'empty', csv: MULTINODE_POWER_CSV.split('\n')[0]! },
    { name: 'unparseable', csv: 'invalid telemetry' },
  ])('invalidates historical coverage after an $name re-ingest and recovers', async ({ csv }) => {
    const artifact = writePowerAuditArtifact();
    const siblingArtifact = writeArtifact(NVIDIA_CSV);
    const inventory = [artifact.artifactName, siblingArtifact.artifactName].sort();
    const input = {
      workflowRunId: 1,
      artifact,
      benchmarkResultIds: [10],
      expectedRunArtifacts: inventory,
    };
    const first = await ingestGpuMetricsArtifact(sql, input);
    const sibling = await ingestGpuMetricsArtifact(sql, {
      ...input,
      artifact: siblingArtifact,
      benchmarkResultIds: [11],
    });
    await sql`update gpu_metric_series set ingested_at = '2026-09-11T00:00:00Z'
      where artifact_name = ${artifact.artifactName}`;
    const before = await Promise.all(first.seriesIds.map(storedSeries));
    const storedSibling = await storedSeries(sibling.seriesIds[0]!);
    const beforeRevision = await getGpuMetricsPointRevision(sql, 10);
    const beforeRun = await getGpuMetricsForRun(sql, 34557177019);
    expect(beforeRun?.coverage).toEqual({
      status: 'complete',
      missingArtifacts: [],
    });

    const csvPath = path.join(artifact.artifactDir, 'LOGS', 'power', 'samples.csv');
    fs.writeFileSync(csvPath, csv);
    expect(await ingestGpuMetricsArtifact(sql, input)).toEqual({
      seriesIds: [],
      samplesInserted: 0,
      seriesSkipped: 0,
    });

    const invalidatedRun = await getGpuMetricsForRun(sql, 34557177019);
    expect(invalidatedRun?.coverage).toEqual({
      status: 'unknown',
      missingArtifacts: [],
    });
    for (const [index, seriesId] of first.seriesIds.entries()) {
      const after = await storedSeries(seriesId);
      expect(after.samples).toEqual(before[index]!.samples);
      expect(after.links).toEqual(before[index]!.links);
      expect(after.metadata[0]!.sidecars).not.toHaveProperty('seriesInventory');
      expect(after.metadata[0]!.sidecars.runArtifactInventory).toEqual(inventory);
      expect(new Date(after.metadata[0]!.ingested_at).getTime()).toBeGreaterThan(
        new Date(before[index]!.metadata[0]!.ingested_at).getTime(),
      );
    }
    expect(await getGpuMetricsPointRevision(sql, 10)).not.toEqual(beforeRevision);
    expect(await storedSeries(sibling.seriesIds[0]!)).toEqual(storedSibling);

    fs.writeFileSync(csvPath, MULTINODE_POWER_CSV);
    expect(
      await ingestGpuMetricsArtifact(sql, {
        ...input,
        expectedRunArtifacts: [artifact.artifactName],
      }),
    ).toEqual({ seriesIds: first.seriesIds, samplesInserted: 7, seriesSkipped: 0 });
    const recovered = await getGpuMetricsForRun(sql, 34557177019);
    expect(recovered?.coverage).toEqual({ status: 'complete', missingArtifacts: [] });
    expect(recovered?.series.map((series) => series.sidecars.runArtifactInventory)).toEqual([
      inventory,
      inventory,
      inventory,
    ]);
    const recoveredPoint = await getGpuMetricsForPoint(sql, 10);
    expect(recoveredPoint?.series.map((series) => series.sampleCount)).toEqual([4, 3]);
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

    // Point links are written last, after replacement metadata and samples.
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
    expect(after.links.map((row) => Number(row.benchmark_result_id))).toEqual([10, 11]);
  });
});

describe('getGpuMetricsForPoint under telemetry re-ingest', () => {
  it('returns one series version when a re-ingest commits between the series and sample reads', async () => {
    const first = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: writeArtifact(NVIDIA_CSV),
      benchmarkResultIds: [10],
    });
    let reingest: GpuMetricsIngestResult | undefined;
    // PGlite has one connection: committing the re-ingest before the series rows
    // reach the reader models a concurrent writer between two autocommit reads.
    const reader: DbClient = async (strings, ...values) => {
      const rows = await sql(strings, ...values);
      if (!reingest && strings.join('').includes('from benchmark_result_gpu_metrics link')) {
        // Same CSV and count, new timezone: only ingested_at marks the new version.
        reingest = await ingestGpuMetricsArtifact(sql, {
          workflowRunId: 1,
          artifact: writeArtifact(NVIDIA_CSV, '+02:00'),
          benchmarkResultIds: [10],
        });
      }
      return rows;
    };

    const payload = await getGpuMetricsForPoint(reader, 10);

    expect(reingest).toMatchObject({ seriesIds: first.seriesIds, samplesInserted: 4 });
    const [series] = payload!.series;
    expect(series!.sidecars).toMatchObject({ context: { timestamp_timezone: '+02:00' } });
    expect(series!.startedAt).toBe('2026-09-11T02:19:41.982Z');
    expect(series!.data[0]!.timestamp).toBe(series!.startedAt);
  });
});

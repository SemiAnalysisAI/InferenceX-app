import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestGpuMetricsArtifact } from '@semianalysisai/inferencex-db/etl/gpu-metrics-ingest';
import type * as GpuMetricStatsModule from '@semianalysisai/inferencex-db/lib/gpu-metric-stats';
import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { getGpuMetricsPointRevision } from '@semianalysisai/inferencex-db/queries/gpu-metrics-revision';
import { startPowerxBlobFixture } from '../../../../../scripts/powerx-blob-fixture';

const algorithm = vi.hoisted(() => ({ version: 1 }));
vi.mock('@semianalysisai/inferencex-db/lib/gpu-metric-stats', async (importOriginal) => {
  const actual = await importOriginal<typeof GpuMetricStatsModule>();
  return {
    ...actual,
    get GPU_STATS_VERSION() {
      return algorithm.version;
    },
  };
});

const connection = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => connection);
// The query, cache abstraction, Blob SDK, HTTP transport and ETL are real.
import { GET } from './route';

let db: PGlite;
type Sql = Parameters<typeof ingestGpuMetricsArtifact>[0];
let sql: Sql;
let blob: Awaited<ReturnType<typeof startPowerxBlobFixture>>;
let root: string;
let sampleReads = 0;
const artifactName = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0';
const artifact = () => ({ artifactName, artifactDir: root });

function client(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      if (query.includes('from gpu_metric_samples')) sampleReads++;
      const result = await database.query<Record<string, unknown>>(query, values);
      return result.rows;
    },
    { json: JSON.stringify, array: (value: unknown) => value },
  );
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of [
    '001_initial_schema.sql',
    '016_gpu_metrics.sql',
    '017_gpu_metric_stats_version.sql',
  ]) {
    await db.exec(
      fs.readFileSync(new URL(`../../../../../../db/migrations/${name}`, import.meta.url), 'utf8'),
    );
  }
  await db.exec(`ALTER TABLE benchmark_results ADD COLUMN power_audit jsonb;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-09-11', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, 4, 4, 4, 4);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}'),
      (11, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, '{}');`);
  sql = Object.assign(client(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(client(tx) as unknown as Sql)),
  }) as unknown as Sql;
  connection.getDb.mockReturnValue(sql);
  blob = await startPowerxBlobFixture();
  for (const [key, value] of Object.entries(blob.env)) vi.stubEnv(key, value);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-cache-recovery-'));
  // Retained run 34175132645, attempt 1; source and excerpt hashes live beside the fixture.
  const csv = fs.readFileSync(
    new URL('../../../../../../../docs/fixtures/powerx-reingest/nvidia.csv', import.meta.url),
  );
  expect(createHash('sha256').update(csv).digest('hex')).toBe(
    '833cf864da4618579deeeda89b3ddde6dbf8b7b32b7877fda643f18411ee3481',
  );
  fs.writeFileSync(path.join(root, 'gpu_metrics.csv'), csv);
}, 20_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await blob?.close();
  await db?.close();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  algorithm.version = 1;
  await db.exec(
    'TRUNCATE gpu_metric_series RESTART IDENTITY CASCADE; UPDATE benchmark_results SET power_audit = null;',
  );
  blob.objects.clear();
  Object.assign(blob.counts, { reads: 0, writes: 0, failedWrites: 0 });
  sampleReads = 0;
  // Injected test sidecars: the retained source does not establish its timezone or identity.
  fs.writeFileSync(
    path.join(root, 'gpu_metrics_context.json'),
    JSON.stringify({ timestamp_timezone: 'UTC' }),
  );
  fs.writeFileSync(
    path.join(root, 'gpu_metrics_identity.csv'),
    'index, uuid, name\n0, GPU-old, NVIDIA B200\n',
  );
});

async function request(id: number) {
  const response = await GET(new NextRequest(`http://localhost/api/v1/gpu-metrics-point?id=${id}`));
  const bytes = Buffer.from(await response.arrayBuffer());
  const body =
    response.headers.get('content-encoding') === 'gzip'
      ? gunzipSync(bytes).toString()
      : bytes.toString();
  return { response, body: JSON.parse(body) };
}

describe('artifact → local DB → real Blob cache → point API recovery', () => {
  it('requires live revision checks for successful and missing responses', async () => {
    const missing = await request(10);
    expect(missing.response.headers.get('cache-control')).toBe('no-store');
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [10],
    });
    const present = await request(10);
    expect(present.response.headers.get('cache-control')).toBe('no-store');
  });
  it('refreshes missing points, shared links, timezone and identity repairs without purging', async () => {
    const missing = await request(10);
    expect(missing.response.status).toBe(404);
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [10],
    });
    const old = await request(10);
    expect(old.response.status).toBe(200);
    const originalSeries: GpuMetricSeries = old.body.series[0];
    expect(originalSeries).toMatchObject({
      sampleCount: 24,
      gpuCount: 8,
      startedAt: '2026-09-08T07:20:19.279Z',
      endedAt: '2026-09-08T07:20:21.279Z',
    });
    expect(originalSeries.data).toHaveLength(24);
    expect(originalSeries.data.filter((row) => row.index === 0).map((row) => row.power)).toEqual([
      380.42, 336.61, 337.18,
    ]);
    expect(blob.objects.size).toBe(1);
    const beforeHit = blob.counts.reads;
    const beforeSampleReads = sampleReads;
    const cached = await request(10);
    expect(cached.body).toEqual(old.body);
    expect(blob.counts.reads).toBe(beforeHit + 1);
    expect(sampleReads).toBe(beforeSampleReads);

    const unlinked = await request(11);
    expect(unlinked.response.status).toBe(404);
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [11],
    });
    for (const id of [10, 11]) {
      const linked = await request(id);
      expect(linked.body.series[0].benchmarkResultIds).toEqual([10, 11]);
    }
    const oldRevision = await getGpuMetricsPointRevision(client(db), 10);
    fs.writeFileSync(
      path.join(root, 'gpu_metrics_context.json'),
      JSON.stringify({ timestamp_timezone: '+08:00' }),
    );
    fs.writeFileSync(
      path.join(root, 'gpu_metrics_identity.csv'),
      'index, uuid, name\n0, GPU-corrected, NVIDIA B200\n',
    );
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [10, 11],
    });
    expect(await getGpuMetricsPointRevision(client(db), 10)).not.toBe(oldRevision);
    for (const id of [10, 11]) {
      const repaired = await request(id);
      expect(repaired.body.series[0].data[0].timestamp).toBe('2026-09-07T23:20:19.279Z');
      expect(repaired.body.series[0].sampleCount).toBe(24);
      expect(JSON.stringify(repaired.body.series[0].sidecars)).toContain('GPU-corrected');
    }
    const revision = await getGpuMetricsPointRevision(client(db), 10);
    const writes = blob.counts.writes;
    const unchanged = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [10, 11],
    });
    expect(unchanged.seriesSkipped).toBe(1);
    expect(await getGpuMetricsPointRevision(client(db), 10)).toBe(revision);
    await request(10);
    expect(blob.counts.writes).toBe(writes);
    const samples = await db.query('select count(*)::int as n from gpu_metric_samples');
    expect(samples.rows).toEqual([{ n: 24 }]);
  });
});

const power = (body: { series: GpuMetricSeries[] }) =>
  body.series[0]!.stats.find((s) => s.gpuIndex === 0 && s.metric === 'power_w')!;

it('bypasses warmed shared-point caches on algorithm upgrade, then persists through unchanged re-ingest', async () => {
  const input = { workflowRunId: 1, artifact: artifact(), benchmarkResultIds: [10, 11] };
  const first = await ingestGpuMetricsArtifact(sql, input);
  await sql`update gpu_metric_gpu_stats set mean_value = -1`;

  for (const id of [10, 11]) {
    const cached = await request(id);
    expect(power(cached.body).mean).toBe(-1);
  }
  const oldRevision = await getGpuMetricsPointRevision(client(db), 10);
  const originalSamples =
    await sql`select * from gpu_metric_samples order by series_id, sampled_at, gpu_index`;
  // Model a code deploy: no DB row, sample, sidecar or link has changed.
  algorithm.version = 2;
  expect(await getGpuMetricsPointRevision(client(db), 10)).not.toBe(oldRevision);
  for (const id of [10, 11]) {
    const refreshed = await request(id);
    expect(power(refreshed.body).mean).toBeCloseTo(351.403333, 3);
  }
  expect(await sql`select stats_version from gpu_metric_series`).toEqual([{ stats_version: 1 }]);
  expect(await sql`select distinct mean_value from gpu_metric_gpu_stats`).toEqual([
    { mean_value: -1 },
  ]);
  const upgradedRevision = await getGpuMetricsPointRevision(client(db), 10);
  const repaired = await ingestGpuMetricsArtifact(sql, input);
  expect(repaired).toMatchObject({
    seriesIds: first.seriesIds,
    samplesInserted: 0,
    seriesSkipped: 0,
  });
  expect(await getGpuMetricsPointRevision(client(db), 10)).not.toBe(upgradedRevision);
  for (const id of [10, 11]) {
    const refreshed = await request(id);
    expect(power(refreshed.body).mean).toBeCloseTo(351.403333, 3);
  }
  expect(await sql`select stats_version from gpu_metric_series`).toEqual([{ stats_version: 2 }]);
  expect(
    await sql`select * from gpu_metric_samples order by series_id, sampled_at, gpu_index`,
  ).toEqual(originalSamples);
  const beforeHit = sampleReads;
  await request(10);
  expect(sampleReads).toBe(beforeHit);
  expect(await ingestGpuMetricsArtifact(sql, input)).toMatchObject({
    samplesInserted: 0,
    seriesSkipped: 1,
  });
});

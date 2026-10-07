import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestGpuMetricsArtifact } from '@semianalysisai/inferencex-db/etl/gpu-metrics-ingest';
import type * as GpuMetricStatsModule from '@semianalysisai/inferencex-db/lib/gpu-metric-stats';
import {
  migratedPglite,
  pgliteSql,
  type PgliteSql,
} from '@semianalysisai/inferencex-db/lib/test-pglite';
import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { getGpuMetricsPointRevision } from '@semianalysisai/inferencex-db/queries/gpu-metrics-revision';
import { startPowerxBlobFixture } from './blob.fixture';

// Version 2 stands in for a deployed change to the statistics calculator.
const algorithm = vi.hoisted(() => ({ version: 1 }));
vi.mock('@semianalysisai/inferencex-db/lib/gpu-metric-stats', async (importOriginal) => {
  const actual = await importOriginal<typeof GpuMetricStatsModule>();
  return {
    ...actual,
    get GPU_STATS_VERSION() {
      return algorithm.version;
    },
    computeStoredGpuMetricStats: (...args: Parameters<typeof actual.computeStoredGpuMetricStats>) =>
      actual
        .computeStoredGpuMetricStats(...args)
        .map((stat) => (algorithm.version === 1 ? stat : { ...stat, mean: -1 })),
  };
});

const connection = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => connection);
// The query, cache abstraction, Blob SDK, HTTP transport and ETL are real.
import { GET } from './route';

let db: PGlite;
let sql: PgliteSql;
let blob: Awaited<ReturnType<typeof startPowerxBlobFixture>>;
let root: string;
let sampleReads = 0;
const artifactName = 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0';
const artifact = () => ({ artifactName, artifactDir: root });

beforeAll(async () => {
  db = await migratedPglite();
  await db.exec(`INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-09-11', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, 4, 4, 4, 4);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, '{}'),
      (11, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, '{}');`);
  sql = pgliteSql(db);
  connection.getDb.mockReturnValue((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join('').includes('from gpu_metric_samples')) sampleReads++;
    return sql(strings, ...values);
  });
  blob = await startPowerxBlobFixture();
  for (const [key, value] of Object.entries(blob.env)) vi.stubEnv(key, value);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-cache-recovery-'));
  // GPU 0 rows of gpu_metrics.csv from run 34175132645, attempt 1.
  fs.writeFileSync(
    path.join(root, 'gpu_metrics.csv'),
    [
      'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
      '2026/09/08 07:20:19.279, 0, 380.42 W, 37, 1965 MHz, 3996 MHz, 100 %, 9 %',
      '2026/09/08 07:20:20.279, 0, 336.61 W, 37, 1965 MHz, 3996 MHz, 100 %, 9 %',
      '2026/09/08 07:20:21.279, 0, 337.18 W, 37, 1965 MHz, 3996 MHz, 100 %, 9 %',
    ].join('\n'),
  );
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
  Object.assign(blob.counts, { reads: 0, writes: 0 });
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
  it('refreshes missing points, shared links, timezone and identity repairs without purging', async () => {
    const missing = await request(10);
    expect(missing.response.status).toBe(404);
    expect(missing.response.headers.get('cache-control')).toBe('no-store');
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [10],
    });
    const old = await request(10);
    expect(old.response.status).toBe(200);
    expect(old.response.headers.get('cache-control')).toBe('no-store');
    const originalSeries: GpuMetricSeries = old.body.series[0];
    expect(originalSeries).toMatchObject({
      sampleCount: 3,
      gpuCount: 1,
      startedAt: '2026-09-08T07:20:19.279Z',
      endedAt: '2026-09-08T07:20:21.279Z',
    });
    expect(originalSeries.data.map((row) => row.power)).toEqual([380.42, 336.61, 337.18]);
    expect(blob.objects.size).toBe(1);
    const beforeHit = blob.counts.reads;
    const beforeSampleReads = sampleReads;
    const cached = await request(10);
    expect(cached.body).toEqual(old.body);
    expect(blob.counts.reads).toBe(beforeHit + 1);
    expect(sampleReads).toBe(beforeSampleReads);

    const unlinked = await request(11);
    expect(unlinked.response.status).toBe(404);
    await db.exec(
      `UPDATE benchmark_results SET power_audit = '{"source":"audit-11"}' WHERE id = 11`,
    );
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [11],
    });
    for (const id of [10, 11]) {
      const linked = await request(id);
      expect(linked.body.series[0].powerAudits).toEqual([{ source: 'audit-11' }]);
    }
    const oldRevision = await getGpuMetricsPointRevision(sql, 10);
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
    expect(await getGpuMetricsPointRevision(sql, 10)).not.toBe(oldRevision);
    for (const id of [10, 11]) {
      const repaired = await request(id);
      expect(repaired.body.series[0].data[0].timestamp).toBe('2026-09-07T23:20:19.279Z');
      expect(repaired.body.series[0].sampleCount).toBe(3);
      expect(JSON.stringify(repaired.body.series[0].sidecars)).toContain('GPU-corrected');
    }
    const revision = await getGpuMetricsPointRevision(sql, 10);
    const writes = blob.counts.writes;
    await ingestGpuMetricsArtifact(sql, {
      workflowRunId: 1,
      artifact: artifact(),
      benchmarkResultIds: [10, 11],
    });
    expect(await getGpuMetricsPointRevision(sql, 10)).toBe(revision);
    await request(10);
    expect(blob.counts.writes).toBe(writes);
    await db.exec(`UPDATE benchmark_results SET power_audit = '{"source": "a"}' WHERE id = 10`);
    expect(await getGpuMetricsPointRevision(sql, 10)).not.toBe(revision);
    const audited = await request(10);
    expect(audited.body.series[0].powerAudits).toEqual([{ source: 'a' }, { source: 'audit-11' }]);
  });
});

const power = (body: { series: GpuMetricSeries[] }) =>
  body.series[0]!.stats.find((s) => s.gpuIndex === 0 && s.metric === 'power_w')!;

it('refreshes shared cached points when the statistics calculator version changes', async () => {
  await ingestGpuMetricsArtifact(sql, {
    workflowRunId: 1,
    artifact: artifact(),
    benchmarkResultIds: [10, 11],
  });
  for (const id of [10, 11]) {
    const cached = await request(id);
    expect(power(cached.body).mean).toBeCloseTo(351.403333, 3);
  }
  // Model a code deploy: no DB row, sample, sidecar or link has changed.
  algorithm.version = 2;
  for (const id of [10, 11]) {
    const refreshed = await request(id);
    expect(power(refreshed.body).mean).toBe(-1);
  }
});

import type { GpuMetricStatRow } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import type { GpuMetricsArtifact, GpuPowerApiResponse } from '@/components/gpu-power/types';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { metrics } = vi.hoisted(() => ({ metrics: vi.fn() }));
vi.mock('@/app/api/gpu-metrics/route', () => ({ GET: metrics }));
// These source handlers are imported by the shared source module, but this view never calls them.
vi.mock('@/app/api/v1/benchmarks/route', () => ({ GET: vi.fn() }));
vi.mock('@/app/api/unofficial-run/route', () => ({ GET: vi.fn() }));

import { GET } from './route';

const rows = [
  { timestamp: '2026-09-08T00:00:00Z', index: 0, power: 100, temperature: 40 },
  { timestamp: '2026-09-08T00:00:01Z', index: 0, power: 300, temperature: 42 },
  { timestamp: '2026-09-08T00:00:01Z', index: 1, power: 50, temperature: 38 },
];
const digest: GpuMetricStatRow[] = [
  {
    gpuIndex: 0,
    metric: 'power_w',
    count: 10,
    min: 0,
    max: 800,
    mean: 350,
    median: 300,
    p95: 750,
    p99: 790,
    stddev: 200,
  },
  {
    gpuIndex: 1,
    metric: 'power_w',
    count: 12,
    min: 100,
    max: 900,
    mean: 700,
    median: 750,
    p95: 880,
    p99: 898,
    stddev: 80,
  },
];
function artifact(stats: GpuMetricStatRow[] = digest): GpuMetricsArtifact {
  return {
    name: 'gpu_metrics_retained/host-a/gpu_metrics.csv',
    data: rows,
    series: {
      id: 1,
      artifactName: 'gpu_metrics_retained',
      configKey: 'retained',
      fileName: 'host-a/gpu_metrics.csv',
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 22,
      gpuCount: 2,
      startedAt: '2026-09-08T00:00:00Z',
      endedAt: '2026-09-08T00:00:10Z',
      sidecars: {},
      benchmarkResultIds: [10, 11],
      stats,
    },
  };
}
const runInfo = {
  id: 34175132645,
  name: 'Run Sweep',
  branch: 'main',
  sha: 'retained-source',
  createdAt: '2026-09-08T00:00:00Z',
  url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645',
  conclusion: 'success',
  status: 'completed',
};
function source(artifacts: GpuMetricsArtifact[]) {
  const payload: GpuPowerApiResponse = { runInfo, artifacts };
  metrics.mockImplementation(() => Response.json(payload));
}
const request = (query = '') =>
  new NextRequest(`http://localhost/api/v1/views/gpu-metrics?runId=${runInfo.id}${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  source([artifact()]);
});

describe('GET /api/v1/views/gpu-metrics full-record statistics', () => {
  it('returns the stored digest even when raw rows would produce different statistics', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.stats).toEqual(digest);
    expect(body.rows).toEqual(rows);
    expect(metrics.mock.calls[0][0].nextUrl.searchParams.get('runId')).toBe(String(runInfo.id));
  });

  it.each(['empty digest', 'uncollected metric'])(
    'keeps an authoritative %s empty',
    async (kind) => {
      if (kind === 'empty digest') source([artifact([])]);
      const response = await GET(
        request(kind === 'uncollected metric' ? '&metric=temperature' : ''),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.stats).toEqual([]);
    },
  );

  it('sorts all stored chips while visibility filters only raw rows and the real chart', async () => {
    const response = await GET(request('&gpus=0&sort=mean&direction=desc'));
    const body = await response.json();
    expect(body.stats).toEqual([digest[1], digest[0]]);
    expect(body.rows).toEqual(rows.slice(0, 2));
    expect(Object.keys(body.chart)).toEqual(['0']);
    expect(body.chart['0'].map((point: { value: number }) => point.value)).toEqual([100, 300]);
    expect(body.params).toMatchObject({ gpus: [0], sort: 'mean', direction: 'desc' });
  });

  it('computes full-record sample statistics for a live artifact without a stored digest', async () => {
    source([{ name: 'gpu_metrics_live', data: rows }]);
    const response = await GET(request('&gpus=1'));
    const body = await response.json();
    expect(body.stats).toEqual([
      {
        gpuIndex: 0,
        count: 2,
        min: 100,
        max: 300,
        mean: 200,
        median: 200,
        p95: 290,
        p99: 298,
        stddev: 100,
      },
      {
        gpuIndex: 1,
        count: 1,
        min: 50,
        max: 50,
        mean: 50,
        median: 50,
        p95: 50,
        p99: 50,
        stddev: 0,
      },
    ]);
    expect(body.rows).toEqual([rows[2]]);
  });

  it('preserves a source database failure as an uncached 503 through the real error wrapper', async () => {
    metrics.mockResolvedValue(Response.json({ code: 'DATABASE_UNAVAILABLE' }, { status: 503 }));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Source data unavailable' });
  });
});

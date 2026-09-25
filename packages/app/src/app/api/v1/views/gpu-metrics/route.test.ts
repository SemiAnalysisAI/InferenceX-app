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
});

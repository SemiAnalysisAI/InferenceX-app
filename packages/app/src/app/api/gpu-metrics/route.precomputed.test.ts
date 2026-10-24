import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { storedPowerSeries } from '@semianalysisai/inferencex-db/power-series/stored-power-series';
import { parseCsvData } from '@/components/gpu-power/types';

const { readRun, readPrecomputed } = vi.hoisted(() => ({
  readRun: vi.fn(),
  readPrecomputed: vi.fn(),
}));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => ({}),
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForRun: readRun,
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-power-series', () => ({
  getPrecomputedPowerSeries: readPrecomputed,
}));

import { GET, POST } from './route';

const RUN_ID = '12345';
const RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`;
const NAME_A = 'dsr1_conc32_b200';
const NAME_B = 'dsr1_conc64_b200';
const source = (name: string) => `power_validation_${name}.json`;
const csvName = (name: string) => `gpu_metrics_${name}`;
const SOURCE_A = source(NAME_A);
const SOURCE_B = source(NAME_B);
const START = Date.parse('2026-03-01T00:00:00Z') / 1000;
const workflowRun = {
  id: 1,
  githubRunId: Number(RUN_ID),
  runAttempt: 1,
  name: 'Run Sweep',
  date: '2026-03-01',
  htmlUrl: RUN_URL,
  headBranch: 'main',
  headSha: 'abc123',
  conclusion: 'success',
  status: 'completed',
  createdAt: '2026-03-01T00:00:00Z',
};

function csv(power: number): string {
  return [
    'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
    `2026/03/01 00:00:00.000, 0, ${power} W, 65, 1500 MHz, 2000 MHz, 95 %, 80 %`,
    `2026/03/01 00:00:01.000, 0, ${power + 10} W, 65, 1500 MHz, 2000 MHz, 95 %, 80 %`,
  ].join('\n');
}

function stored(name: string, power = 100): GpuMetricSeries {
  return {
    id: 1,
    artifactName: csvName(name),
    fileName: 'gpu_metrics.csv',
    vendor: 'nvidia',
    sampleIntervalS: 1,
    sampleCount: 2,
    gpuCount: 1,
    startedAt: '2026-03-01T00:00:00Z',
    endedAt: '2026-03-01T00:00:01Z',
    sidecars: {
      seriesInventory: [{ fileName: 'gpu_metrics.csv', sampleCount: 2 }],
    },
    stats: [],
    data: parseCsvData(csv(power)).map((row, index) => ({
      ...row,
      timestamp: new Date((START + index) * 1000).toISOString(),
    })),
  };
}

function request(body: unknown, prefix = 'dsr1_', raw = false): NextRequest {
  const params = new URLSearchParams({
    runId: RUN_ID,
    series: 'power',
    prefix,
  });
  return new NextRequest(`http://localhost/api/gpu-metrics?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

beforeEach(() => {
  const series = [stored(NAME_A), stored(NAME_B, 300)];
  readRun.mockReset().mockResolvedValue({ workflowRun, series });
  readPrecomputed.mockReset().mockResolvedValue({ workflowRun, series: storedPowerSeries(series) });
  vi.stubEnv('DATABASE_READONLY_URL', 'postgresql://readonly.example.test/test');
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected GitHub request')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('precomputed power series', () => {
  it('serves stored series without reading samples, scoped like the samples path', async () => {
    const response = await POST(request({ sources: [SOURCE_A] }));
    expect(response.status).toBe(200);
    expect(readPrecomputed).toHaveBeenCalledWith({}, Number(RUN_ID), {
      prefix: 'dsr1_',
      sourceResults: [NAME_A],
    });
    expect(readRun).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.source).toBe('database');
    expect(body.series.map((entry: { artifact: string }) => entry.artifact)).toEqual([
      csvName(NAME_A),
    ]);
    expect(body.sourceCoverage).toEqual({ status: 'complete', missingSources: [] });
  });

  it('answers exactly what bucketing the stored samples answers', async () => {
    const sources = { sources: [SOURCE_A, SOURCE_B, source('dsr1_conc128_b200')] };
    const precomputedResponse = await POST(request(sources));
    const precomputed = await precomputedResponse.json();
    readPrecomputed.mockResolvedValue(null);
    const samplesResponse = await POST(request(sources));
    const fromSamples = await samplesResponse.json();
    expect(readRun).toHaveBeenCalledTimes(1);
    expect(precomputed).toEqual(fromSamples);
    expect(precomputed.sourceCoverage.status).toBe('incomplete');
  });

  it('falls back to the samples when the precomputed read fails', async () => {
    readPrecomputed.mockRejectedValue(new Error('relation "gpu_power_series" does not exist'));
    const response = await POST(request({ sources: [SOURCE_B] }));
    expect(response.status).toBe(200);
    expect(readRun).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.series).toHaveLength(1);
  });

  it('is not consulted for the raw metrics view', async () => {
    const params = new URLSearchParams({ runId: RUN_ID, prefix: 'dsr1_' });
    const response = await GET(new NextRequest(`http://localhost/api/gpu-metrics?${params}`));
    expect(response.status).toBe(200);
    expect(readPrecomputed).not.toHaveBeenCalled();
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { parseCsvData } from '@/components/gpu-power/types';

const { readRun } = vi.hoisted(() => ({ readRun: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => ({}),
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForRun: readRun,
}));

import { POST } from './route';

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
    configKey: name,
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
    benchmarkResultIds: [1],
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
  readRun.mockReset().mockResolvedValue({ workflowRun, series: [stored(NAME_A)] });
  vi.stubEnv('DATABASE_READONLY_URL', 'postgresql://readonly.example.test/test');
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected GitHub request')));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Timeline requested-source coverage', () => {
  it('keeps known missing hosts as 503 even when another requested series is healthy', async () => {
    const partial = stored(NAME_B, 300);
    partial.sidecars.seriesInventory = [
      { fileName: 'gpu_metrics.csv', sampleCount: 2 },
      { fileName: 'host-b/gpu_metrics.csv', sampleCount: 2 },
    ];
    readRun.mockResolvedValue({
      workflowRun,
      series: [stored(NAME_A), partial],
    });
    vi.stubEnv('GITHUB_TOKEN', '');
    const response = await POST(request({ sources: [SOURCE_A, SOURCE_B] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'STORED_TELEMETRY_INCOMPLETE',
      artifact: csvName(NAME_B),
    });
  });
});

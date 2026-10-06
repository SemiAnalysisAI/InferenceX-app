import AdmZip from 'adm-zip';
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

function powerValidation(start: number): string {
  return JSON.stringify({ selected_window: { start_time_unix: start, end_time_unix: start + 10 } });
}

function archive(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const zip = new AdmZip();
  for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text));
  return new Uint8Array(zip.toBuffer());
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
  it('answers an ingested run from stored windows only, listing unstored requests as missing', async () => {
    const response = await POST(request({ sources: [SOURCE_A, SOURCE_B] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: 'database',
      series: [{ artifact: csvName(NAME_A) }],
      sourceCoverage: { status: 'incomplete', missingSources: [SOURCE_B] },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers an unstored run from GitHub only, one series per requested window, preferring CSV over bundle', async () => {
    readRun.mockResolvedValue(null);
    const sweep = 'dsr1_fp4_b200_dynamo-trt';
    const sweepSource = (conc: number) => source(`${sweep}_sa-bench_conc${conc}`);
    // A single-node job uploads its window as gpu_metrics_<RESULT_FILENAME> and again inside
    // power_audit_<RESULT_FILENAME>. A multinode sweep uploads only the bundle.
    const archives = new Map([
      [csvName(NAME_A), archive({ 'gpu_metrics.csv': csv(100) })],
      [
        `power_audit_${NAME_A}`,
        archive({ 'gpu_metrics.csv': csv(100), [SOURCE_A]: powerValidation(START) }),
      ],
      [
        `power_audit_${sweep}`,
        archive({
          [sweepSource(32)]: powerValidation(START + 600),
          [sweepSource(64)]: powerValidation(START + 1200),
          'LOGS/power/samples.csv': [
            'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
            `1,${START + 600},1,cn01,0,GPU-a0,500`,
            `1,${START + 1200},2,cn01,0,GPU-a0,700`,
          ].join('\n'),
        }),
      ],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url.endsWith(`/actions/runs/${RUN_ID}`)) {
          return Promise.resolve(Response.json({ id: Number(RUN_ID), html_url: RUN_URL }));
        }
        if (url.includes(`/actions/runs/${RUN_ID}/artifacts?`)) {
          const artifacts = [...archives.keys()].map((name, id) => ({
            id,
            name,
            archive_download_url: `https://example.test/${name}`,
          }));
          return Promise.resolve(Response.json({ artifacts }));
        }
        const bytes = archives.get(url.slice('https://example.test/'.length));
        if (bytes) return Promise.resolve(new Response(bytes));
        throw new Error(`Unexpected network request: ${url}`);
      }),
    );

    const response = await POST(request({ sources: [SOURCE_A, sweepSource(64)] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      source: 'github',
      sourceCoverage: { status: 'complete', missingSources: [] },
    });
    expect(body.series).toHaveLength(2);
    expect(body.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact: csvName(NAME_A) }),
        expect.objectContaining({ artifact: `power_audit_${sweep}`, source: sweepSource(64) }),
      ]),
    );
  });

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
    const response = await POST(request({ sources: [SOURCE_A, SOURCE_B] }));
    expect(readRun).toHaveBeenCalledWith({}, Number(RUN_ID), {
      prefix: 'dsr1_',
      sourceResults: [NAME_A, NAME_B],
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'STORED_TELEMETRY_INCOMPLETE',
      artifact: csvName(NAME_B),
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

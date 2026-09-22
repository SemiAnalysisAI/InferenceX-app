import AdmZip from 'adm-zip';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { parseCsvData } from '@/components/gpu-power/types';
import type { InferenceData } from '@/components/inference/types';
import {
  joinPowerTimeline,
  planPowerTimelineRequests,
} from '@/components/inference/utils/powerTimeline';

const { readRun } = vi.hoisted(() => ({ readRun: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => ({}),
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForRun: readRun,
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

function zip(entries: Record<string, string>): Uint8Array<ArrayBuffer> {
  const archive = new AdmZip();
  for (const [name, text] of Object.entries(entries)) archive.addFile(name, Buffer.from(text));
  return new Uint8Array(archive.toBuffer());
}

function github(archives: Record<string, Uint8Array<ArrayBuffer>>) {
  const downloads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/artifacts?')) {
        return Promise.resolve(
          Response.json({
            artifacts: Object.keys(archives).map((name, id) => ({
              id,
              name,
              archive_download_url: `https://artifacts.test/${name}`,
            })),
          }),
        );
      }
      if (url.startsWith('https://artifacts.test/')) {
        const name = url.slice('https://artifacts.test/'.length);
        downloads.push(name);
        return Promise.resolve(new Response(archives[name]));
      }
      return Promise.resolve(
        Response.json({
          id: Number(RUN_ID),
          name: workflowRun.name,
          head_branch: 'main',
          head_sha: 'abc123',
          created_at: workflowRun.createdAt,
          html_url: RUN_URL,
          conclusion: 'success',
          status: 'completed',
        }),
      );
    }),
  );
  return downloads;
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
  it('keeps the planned stored c32 and downloads only missing c64 under their common prefix', async () => {
    const points = [NAME_A, NAME_B].map(
      (name, index) =>
        ({
          x: 1,
          y: 1,
          hwKey: 'b200_sglang',
          tp: 4,
          conc: index === 0 ? 32 : 64,
          precision: 'fp8',
          date: '2026-03-01',
          run_url: RUN_URL,
          power_audit: { source: source(name) },
        }) as InferenceData,
    );
    const [planned] = planPowerTimelineRequests(points);
    expect(planned.sources).toEqual([SOURCE_A, SOURCE_B]);
    const downloads = github({
      [csvName(NAME_A)]: zip({ 'gpu_metrics.csv': csv(900) }),
      [csvName(NAME_B)]: zip({ 'gpu_metrics.csv': csv(300) }),
      gpu_metrics_dsr1_conc128_b200: zip({ 'gpu_metrics.csv': csv(500) }),
    });
    const response = await POST(request({ sources: planned.sources }, planned.prefix));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body.sourceCoverage).toEqual({
      status: 'complete',
      missingSources: [],
    });
    expect(downloads).toEqual([csvName(NAME_B)]);
    const joined = joinPowerTimeline(points, new Map([[RUN_ID, body]]));
    expect(joined.missing).toEqual([]);
    expect(joined.traces.map((trace) => trace.series.power)).toEqual([[[100, 110]], [[300, 310]]]);
  });

  it('serves the complete requested set from DB without GitHub and canonicalizes duplicates', async () => {
    readRun.mockResolvedValue({
      workflowRun,
      series: [stored(NAME_A), stored(NAME_B, 300)],
    });
    const response = await POST(request({ sources: [SOURCE_B, SOURCE_A, SOURCE_B] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceCoverage).toEqual({
      status: 'complete',
      missingSources: [],
    });
    expect(body.series).toHaveLength(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(['no token', 'GitHub 404'])(
    'preserves healthy DB data with incomplete coverage when %s',
    async (failure) => {
      if (failure === 'no token') vi.stubEnv('GITHUB_TOKEN', '');
      else vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
      const response = await POST(request({ sources: [SOURCE_B, SOURCE_A] }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.sourceCoverage).toEqual({
        status: 'incomplete',
        missingSources: [SOURCE_B],
      });
      expect(body.series).toMatchObject([{ artifact: csvName(NAME_A), power: [[100, 110]] }]);
      if (failure === 'no token') expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it('does not call an identity-free GET complete', async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/gpu-metrics?runId=${RUN_ID}&series=power`),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceCoverage).toEqual({
      status: 'unknown',
      missingSources: [],
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
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
    vi.stubEnv('GITHUB_TOKEN', '');
    const response = await POST(request({ sources: [SOURCE_A, SOURCE_B] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'STORED_TELEMETRY_INCOMPLETE',
      artifact: csvName(NAME_B),
    });
  });

  it('ignores an unrelated partial artifact under the same common prefix', async () => {
    const partial = stored('dsr1_conc128_b200');
    partial.sidecars.seriesInventory = [{ fileName: 'missing.csv', sampleCount: 2 }];
    readRun.mockResolvedValue({
      workflowRun,
      series: [stored(NAME_A), partial],
    });
    const response = await POST(request({ sources: [SOURCE_A] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceCoverage).toEqual({
      status: 'complete',
      missingSources: [],
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('supplements a missing validation window from the same bundle without replacing its stored window', async () => {
    const artifact = 'power_audit_dsr1';
    const validation = {
      selected_window: { start_time_unix: START, end_time_unix: START + 1 },
    };
    const bundle = stored(NAME_A);
    bundle.artifactName = artifact;
    bundle.fileName = 'LOGS/power/samples.csv#host-a';
    bundle.sidecars = {
      identity: [{ hostname: 'host-a', gpu_index: 0, gpu_uuid: 'GPU-a' }],
      validations: { [SOURCE_A]: validation },
      seriesInventory: [{ fileName: bundle.fileName, sampleCount: 2 }],
    };
    readRun.mockResolvedValue({ workflowRun, series: [bundle] });
    const downloads = github({
      [artifact]: zip({
        'LOGS/power/samples.csv': [
          'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
          `1,${START},1,host-a,0,GPU-a,900`,
          `1,${START + 1},2,host-a,0,GPU-a,910`,
        ].join('\n'),
        'LOGS/power/manifest.json': '{}',
        [SOURCE_A]: JSON.stringify(validation),
        [SOURCE_B]: JSON.stringify(validation),
      }),
    });
    const response = await POST(request({ sources: [SOURCE_A, SOURCE_B] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceCoverage).toEqual({
      status: 'complete',
      missingSources: [],
    });
    expect(body.series).toHaveLength(2);
    expect(
      body.series.find((entry: { source: string }) => entry.source === SOURCE_A).power,
    ).toEqual([[100, 110]]);
    expect(
      body.series.find((entry: { source: string }) => entry.source === SOURCE_B).power,
    ).toEqual([[900, 910]]);
    expect(downloads).toEqual([artifact]);
  });
});

describe('Timeline source request validation', () => {
  it.each([
    ['malformed JSON', '{', true],
    ['null', null, false],
    ['missing sources', {}, false],
    ['string sources', { sources: SOURCE_A }, false],
    ['empty sources', { sources: [] }, false],
    ['non-string source', { sources: [42] }, false],
    ['source path', { sources: [`dir/${SOURCE_A}`] }, false],
    ['wrong source name', { sources: [csvName(NAME_A)] }, false],
    ['overlong suffix', { sources: [source(`dsr1_${'a'.repeat(196)}`)] }, false],
    ['too many sources', { sources: Array.from({ length: 1001 }, () => SOURCE_A) }, false],
    ['prefix mismatch', { sources: [source('other_conc32')] }, false],
  ])('rejects %s before DB or GitHub access', async (_label, body, raw) => {
    const response = await POST(request(body, 'dsr1_', Boolean(raw)));
    expect(response.status).toBe(400);
    expect(readRun).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects bodies beyond 256 KiB before attempting telemetry reads', async () => {
    const response = await POST(request(' '.repeat(256 * 1024 + 1), 'dsr1_', true));
    expect(response.status).toBe(413);
    expect(readRun).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('accepts 1000 bounded sources through the body without a long query string', async () => {
    const names = Array.from(
      { length: 1000 },
      (_, index) => `dsr1_${String(index).padStart(4, '0')}_${'a'.repeat(190)}`,
    );
    const sources = names.map(source);
    readRun.mockResolvedValue({ workflowRun, series: [stored(names[0])] });
    vi.stubEnv('GITHUB_TOKEN', '');
    const input = request({ sources });
    expect(input.url.length).toBeLessThan(200);
    const response = await POST(input);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceCoverage).toEqual({
      status: 'incomplete',
      missingSources: sources.slice(1),
    });
  });
});

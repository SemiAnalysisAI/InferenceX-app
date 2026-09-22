import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareGpuMetricsArtifact } from '@semianalysisai/inferencex-db/etl/gpu-metrics-ingest';
import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { cutPowerAuditBundle } from '@/components/gpu-power/power-audit-bundle';
import { parseCsvData } from '@/components/gpu-power/types';

const { readStored } = vi.hoisted(() => ({ readStored: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForRun: readStored,
}));

import { GET } from './route';

const HEADER =
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]';
const CSV = `${HEADER}\n2026/09/21 00:00:00.000, 0, 100 W, 40, 1500, 2000, 90, 80\n2026/09/21 00:00:01.000, 0, 200 W, 41, 1500, 2000, 90, 80\n`;
const directories: string[] = [];

beforeEach(() => {
  readStored.mockReset().mockResolvedValue(null);
  vi.stubEnv('GITHUB_TOKEN', 'controlled-not-a-real-token');
  vi.stubEnv('DATABASE_READONLY_URL', 'postgresql://controlled.invalid/never-contacted');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

function liveArtifact(
  files: Record<string, string>,
  name = 'gpu_metrics_probe_live',
  options: Partial<AdmZip.InitOptions> = {},
) {
  const zip = new AdmZip(undefined, options);
  for (const [entry, contents] of Object.entries(files)) zip.addFile(entry, Buffer.from(contents));
  const bytes = zip.toBuffer();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/artifacts?')) {
        return Promise.resolve(
          Response.json({
            artifacts: [{ id: 2, name, archive_download_url: 'https://example.test/dl/live' }],
          }),
        );
      }
      if (url === 'https://example.test/dl/live') {
        return Promise.resolve(
          new Response(new Uint8Array(bytes), {
            headers: { 'Content-Length': String(bytes.length) },
          }),
        );
      }
      if (url.endsWith('/actions/runs/12345')) {
        return Promise.resolve(
          Response.json({
            id: 12345,
            name: 'Controlled context fixture',
            head_branch: 'test',
            head_sha: 'fixture',
            created_at: '2026-09-21T00:00:00Z',
            html_url: 'https://example.test/runs/12345',
            conclusion: 'success',
            status: 'completed',
          }),
        );
      }
      throw new Error(`Unexpected network request: ${url}`);
    }),
  );
  return bytes;
}

async function readRoute(params = '') {
  const response = await GET(
    new NextRequest(`http://localhost/api/gpu-metrics?runId=12345${params}`),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function prepareSeries(files: Record<string, string>, artifactName: string): GpuMetricSeries[] {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-context-'));
  directories.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return prepareGpuMetricsArtifact({ artifactName, artifactDir: directory }).map(
    (entry, index) => ({
      id: index + 1,
      artifactName,
      configKey: artifactName.slice('gpu_metrics_'.length),
      fileName: entry.fileName,
      vendor: entry.vendor,
      sampleIntervalS: entry.sampleIntervalS,
      sampleCount: entry.samples.length,
      gpuCount: entry.gpuCount,
      startedAt: new Date(entry.startedAtMs).toISOString(),
      endedAt: new Date(entry.endedAtMs).toISOString(),
      sidecars: { ...entry.sidecars },
      benchmarkResultIds: [index + 1],
      stats: [],
      data: entry.samples.map((sample) => ({
        timestamp: new Date(sample.timestampMs).toISOString(),
        index: sample.gpuIndex,
        power: sample.powerW!,
      })),
    }),
  );
}

describe('GET /api/gpu-metrics collector context', () => {
  it.each([
    {
      label: 'reversed lowercase names',
      contexts: [
        ['z_gpu_metrics_context.json', '+02:00'],
        ['a_gpu_metrics_context.json', '-07:00'],
      ],
      expected: '2026-09-21T07:00:00.000Z',
      expectedZone: '-07:00',
    },
    {
      label: 'code-unit ordering of uppercase and lowercase names',
      contexts: [
        ['a_gpu_metrics_context.json', '-07:00'],
        ['Z_gpu_metrics_context.json', '+02:00'],
      ],
      expected: '2026-09-20T22:00:00.000Z',
      expectedZone: '+02:00',
    },
  ])('ignores ZIP context order: $label', async ({ contexts, expected, expectedZone }) => {
    const files: Record<string, string> = {
      ...Object.fromEntries(
        contexts.map(([name, zone]) => [name, JSON.stringify({ timestamp_timezone: zone })]),
      ),
      '0_gpu_metrics_context.json': '{bad json',
      'gpu_metrics.csv': CSV,
      'power_validation_probe.json': JSON.stringify({
        selected_window: {
          start_time_unix: Date.parse('2026-09-20T22:00:00Z') / 1000,
          end_time_unix: Date.parse('2026-09-21T07:00:01Z') / 1000,
        },
      }),
    };
    const bytes = liveArtifact(files, 'gpu_metrics_probe_live', { noSort: true });
    const archive = new AdmZip(bytes);
    expect(archive.getEntries().map((entry) => entry.entryName)).toEqual(Object.keys(files));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-context-order-'));
    directories.push(directory);
    archive.extractAllTo(directory);
    const [stored] = prepareGpuMetricsArtifact({
      artifactName: 'gpu_metrics_probe_live',
      artifactDir: directory,
    });
    expect(stored.sidecars.context).toEqual({ timestamp_timezone: expectedZone });
    expect(new Date(stored.startedAtMs).toISOString()).toBe(expected);

    const raw = await readRoute();
    expect.soft(raw.artifacts[0].data[0].timestamp).toBe(expected);
    const power = await readRoute('&series=power');
    expect.soft(power.series[0].startMs).toBe(Date.parse(expected));

    liveArtifact(files, 'power_audit_probe', { noSort: true });
    const bundle = await readRoute('&series=power');
    expect.soft(bundle.series[0].startMs).toBe(Date.parse(expected));
    expect(bundle.series[0].power).toEqual([[100, 200]]);
  });

  it.each([
    ['gpu_metrics_context.json', '-07:00', '2026-09-21T07:00:00.000Z'],
    ['gpu_metrics_context.json', '+05:30', '2026-09-20T18:30:00.000Z'],
    ['gpu_metrics_context.json', ' +0530 ', '2026-09-20T18:30:00.000Z'],
    ['gpu_metrics_context.JSON', '-07:00', '2026-09-21T07:00:00.000Z'],
    ['gpu_metrics_CONTEXT.JSON', '+05:30', '2026-09-20T18:30:00.000Z'],
  ])('aligns live CSV, ingest and bundle timestamps for %s (%s)', async (name, zone, expected) => {
    const files: Record<string, string> = {
      'gpu_metrics.csv': CSV,
    };
    if (name === 'gpu_metrics_context.JSON') files['gpu_metrics_bad_context.json'] = '{bad json';
    files[name] = JSON.stringify({ timestamp_timezone: zone });
    const stored = prepareSeries(files, 'gpu_metrics_probe_live');
    expect(stored[0].startedAt).toBe(expected);
    liveArtifact(files);

    const raw = await readRoute();
    expect(raw.artifacts[0].data[0].timestamp).toBe(expected);
    const power = await readRoute('&series=power');
    expect(power.series[0].startMs).toBe(Date.parse(expected));
    expect(power.series[0].power).toEqual([[100, 200]]);

    const bundleFiles = {
      ...files,
      'power_validation_probe.json': JSON.stringify({
        selected_window: {
          start_time_unix: Date.parse(expected) / 1000,
          end_time_unix: Date.parse(expected) / 1000 + 1,
        },
      }),
    };
    const bundle = cutPowerAuditBundle('power_audit_probe', new Map(Object.entries(bundleFiles)));
    expect(bundle[0]?.startMs).toBe(Date.parse(expected));
    expect(bundle[0]?.power).toEqual([[100, 200]]);
    liveArtifact(bundleFiles, 'power_audit_probe');
    const bundleRoute = await readRoute('&series=power');
    expect(bundleRoute.series).toEqual(bundle);
  });

  it('uses each host directory context and skips malformed neighboring context files', async () => {
    liveArtifact({
      'gpu_metrics_context.json': '{"timestamp_timezone":"+12:00"}',
      'host-a/gpu_metrics.csv': CSV,
      'host-a/gpu_metrics_bad_context.json': '{bad json',
      'host-a/gpu_metrics_context.json': '{"timestamp_timezone":"-07:00"}',
      'host-b/gpu_metrics.csv': CSV,
      'host-b/gpu_metrics_context.json': '{"timestamp_timezone":"+05:30"}',
    });
    const raw = await readRoute();
    expect(raw.artifacts).toMatchObject([
      {
        name: 'gpu_metrics_probe_live/host-a/gpu_metrics.csv',
        data: [
          { timestamp: '2026-09-21T07:00:00.000Z' },
          { timestamp: '2026-09-21T07:00:01.000Z' },
        ],
      },
      {
        name: 'gpu_metrics_probe_live/host-b/gpu_metrics.csv',
        data: [
          { timestamp: '2026-09-20T18:30:00.000Z' },
          { timestamp: '2026-09-20T18:30:01.000Z' },
        ],
      },
    ]);
  });

  it.each([
    ['absent', undefined],
    ['malformed', '{bad json'],
    ['non-object', '[]'],
    ['unknown zone', '{"timestamp_timezone":"America/Los_Angeles"}'],
    ['UTC', '{"timestamp_timezone":"UTC"}'],
  ])(
    'keeps UTC behavior with %s context and ignores other directories',
    async (_label, context) => {
      const files: Record<string, string> = {
        'gpu_metrics_host/gpu_metrics.csv': CSV,
        'gpu_metrics_context.json': '{"timestamp_timezone":"-07:00"}',
        'gpu_metrics_host/unrelated_context.json': '{"timestamp_timezone":"+05:30"}',
        'gpu_metrics_host/GPU_METRICS_context.JSON': '{"timestamp_timezone":"+05:30"}',
      };
      if (context !== undefined) files['gpu_metrics_host/gpu_metrics_context.json'] = context;
      liveArtifact(files);
      const raw = await readRoute();
      expect(raw.artifacts[0].data[0].timestamp).toBe('2026/09/21 00:00:00.000');
      const power = await readRoute('&series=power');
      expect(power.series[0].startMs).toBe(Date.parse('2026-09-21T00:00:00Z'));
    },
  );

  it.each([
    ['ISO', `${HEADER}\n2026-09-21T07:00:00Z, 0, 100 W, 40, 1500, 2000, 90, 80\n`],
    [
      'AMD seconds',
      `timestamp,gpu,socket_power\n${Date.parse('2026-09-21T07:00:00Z') / 1000},0,100\n`,
    ],
    [
      'AMD milliseconds',
      `timestamp,gpu,socket_power\n${Date.parse('2026-09-21T07:00:00Z')},0,100\n`,
    ],
  ])('does not apply the collector offset twice to %s timestamps', async (_label, csv) => {
    liveArtifact({
      'gpu_metrics.csv': csv,
      'gpu_metrics_context.json': '{"timestamp_timezone":"-07:00"}',
    });
    const raw = await readRoute();
    expect(raw.artifacts[0].data[0].timestamp).toBe(parseCsvData(csv)[0].timestamp);
    const power = await readRoute('&series=power');
    expect(power.series[0].startMs).toBe(Date.parse('2026-09-21T07:00:00Z'));
  });

  it('keeps recovered live power aligned with durable history and raw responses', async () => {
    const files = {
      'gpu_metrics.csv': CSV,
      'gpu_metrics_context.json': '{"timestamp_timezone":"-07:00"}',
    };
    const healthy = prepareSeries(files, 'gpu_metrics_probe_stored');
    const partial = prepareSeries(files, 'gpu_metrics_probe_live');
    partial[0].data = partial[0].data.slice(0, 1);
    readStored.mockResolvedValue({
      workflowRun: {
        id: 7,
        githubRunId: 12345,
        runAttempt: 1,
        name: 'Controlled context fixture',
        date: '2026-09-21',
        htmlUrl: 'https://example.test/runs/12345',
        headBranch: 'test',
        headSha: 'fixture',
        conclusion: 'success',
        status: 'completed',
        createdAt: '2026-09-21T00:00:00Z',
      },
      series: [...healthy, ...partial],
    });
    liveArtifact(files);
    const power = await readRoute('&series=power&prefix=probe_');
    expect(power.source).toBe('github');
    expect(power.series).toMatchObject([
      {
        artifact: 'gpu_metrics_probe_stored',
        startMs: Date.parse('2026-09-21T07:00:00Z'),
        power: [[100, 200]],
      },
      {
        artifact: 'gpu_metrics_probe_live',
        startMs: Date.parse('2026-09-21T07:00:00Z'),
        power: [[100, 200]],
      },
    ]);

    const storedRaw = await readRoute('&prefix=probe_stored');
    expect(storedRaw.source).toBe('database');
    readStored.mockResolvedValue(null);
    const liveRaw = await readRoute('&prefix=probe_live');
    expect(liveRaw.source).toBe('github');
    expect(liveRaw.artifacts[0].data).toMatchObject(storedRaw.artifacts[0].data);
  });
});

import AdmZip from 'adm-zip';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readStored } = vi.hoisted(() => ({ readStored: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForRun: readStored,
}));

import { GET } from './route';

const HEADER =
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]';
const CSV = `${HEADER}\n2026/09/21 00:00:00.000, 0, 100 W, 40, 1500, 2000, 90, 80\n2026/09/21 00:00:01.000, 0, 200 W, 41, 1500, 2000, 90, 80\n`;

beforeEach(() => {
  readStored.mockReset().mockResolvedValue(null);
  vi.stubEnv('GITHUB_TOKEN', 'controlled-not-a-real-token');
  vi.stubEnv('DATABASE_READONLY_URL', 'postgresql://controlled.invalid/never-contacted');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function liveArtifact(files: Record<string, string>) {
  const zip = new AdmZip();
  for (const [entry, contents] of Object.entries(files)) zip.addFile(entry, Buffer.from(contents));
  const bytes = zip.toBuffer();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/artifacts?')) {
        return Promise.resolve(
          Response.json({
            artifacts: [
              {
                id: 2,
                name: 'gpu_metrics_probe_live',
                archive_download_url: 'https://example.test/dl/live',
              },
            ],
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
}

async function readRoute() {
  const response = await GET(new NextRequest('http://localhost/api/gpu-metrics?runId=12345'));
  expect(response.status).toBe(200);
  return response.json();
}

describe('GET /api/gpu-metrics collector context', () => {
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
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type * as GpuPowerTypes from '@/components/gpu-power/types';

const { mockParseCsvData, zipArchives } = vi.hoisted(() => {
  interface ZipEntry {
    entryName: string;
    data: string;
  }
  const csvArchive: ZipEntry[] = [
    { entryName: 'gpu_metrics_0.csv', data: 'timestamp,index,power\n2026-03-01T00:00:00Z,0,300' },
  ];
  return {
    mockParseCsvData: vi.fn((csv: string): GpuPowerTypes.GpuMetricRow[] => {
      if (csv.trim().length === 0) return [];
      return [
        {
          timestamp: '2026-03-01T00:00:00Z',
          index: 0,
          power: 300,
          temperature: 65,
          smClock: 1500,
          memClock: 2000,
          gpuUtil: 95,
          memUtil: 80,
        },
      ];
    }),
    /**
     * Entries the adm-zip mock serves, keyed by the downloaded buffer's text.
     * An empty download (the default in older tests) is the one-CSV artifact.
     */
    zipArchives: { byKey: new Map<string, ZipEntry[]>(), csvArchive },
  };
});

vi.mock('@semianalysisai/inferencex-constants', () => ({
  GITHUB_API_BASE: 'https://api.github.com',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'TestRepo',
}));

vi.mock('@/components/gpu-power/types', () => ({
  parseCsvData: mockParseCsvData,
}));

const { mockGetGpuMetricsForRun } = vi.hoisted(() => ({
  mockGetGpuMetricsForRun: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => ({}),
}));

vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForRun: mockGetGpuMetricsForRun,
}));

vi.mock('adm-zip', () => {
  class MockAdmZip {
    private readonly key: string;
    constructor(buffer: Buffer) {
      this.key = buffer.toString('utf8');
    }
    getEntries() {
      const entries = zipArchives.byKey.get(this.key) ?? zipArchives.csvArchive;
      return entries.map((entry) => ({
        entryName: entry.entryName,
        isDirectory: false,
        getData: () => Buffer.from(entry.data),
      }));
    }
  }
  return { default: MockAdmZip };
});

import { databasePayloadToResponse, GET } from './route';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
let origToken: string | undefined;
let origReadonlyUrl: string | undefined;

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

function nvidiaRow(second: number, power: number): string {
  return `2026/03/01 00:00:0${second}.000, 0, ${power} W, 65, 1500 MHz, 2000 MHz, 95 %, 80 %`;
}

beforeEach(() => {
  vi.clearAllMocks();
  zipArchives.byKey.clear();
  origToken = process.env.GITHUB_TOKEN;
  origReadonlyUrl = process.env.DATABASE_READONLY_URL;
  process.env.GITHUB_TOKEN = 'test-gh-token';
  // No readonly URL: the GitHub fallback is exercised unless a test opts in.
  delete process.env.DATABASE_READONLY_URL;
  mockGetGpuMetricsForRun.mockResolvedValue(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (origToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = origToken;
  }
  if (origReadonlyUrl === undefined) {
    delete process.env.DATABASE_READONLY_URL;
  } else {
    process.env.DATABASE_READONLY_URL = origReadonlyUrl;
  }
});

const storedRunPayload = {
  workflowRun: {
    id: 7,
    githubRunId: 34557177019,
    runAttempt: 1,
    name: 'Run Sweep - dsr1 fp4 b200',
    date: '2026-09-11',
    htmlUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34557177019',
    headBranch: 'main',
    headSha: 'deadbeef',
    conclusion: 'success',
    status: 'completed',
    createdAt: '2026-09-11T04:00:00.000Z',
  },
  series: [
    {
      id: 1,
      artifactName: 'gpu_metrics_dsr1_conc32_b200-x_0',
      configKey: 'dsr1_conc32_b200-x_0',
      fileName: 'gpu_metrics.csv',
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 2,
      gpuCount: 1,
      startedAt: '2026-09-11T04:19:41.982Z',
      endedAt: '2026-09-11T04:19:42.990Z',
      sidecars: {},
      benchmarkResultIds: [10],
      stats: [],
      data: [
        {
          timestamp: '2026-09-11T04:19:41.982Z',
          index: 0,
          power: 187.8,
          temperature: 33,
          smClock: 120,
          memClock: 3996,
          gpuUtil: 0,
          memUtil: 0,
        },
        {
          timestamp: '2026-09-11T04:19:42.990Z',
          index: 0,
          power: 912.1,
          temperature: 61,
          smClock: 1965,
          memClock: 3996,
          gpuUtil: 98,
          memUtil: 74,
        },
      ],
    },
    {
      id: 2,
      artifactName: 'gpu_metrics_multinode_b200-x_0',
      configKey: 'multinode_b200-x_0',
      fileName: 'results/gpu_metrics_rank0.csv',
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 0,
      gpuCount: 0,
      startedAt: '2026-09-11T04:19:41.982Z',
      endedAt: '2026-09-11T04:19:41.982Z',
      sidecars: {},
      benchmarkResultIds: [11],
      stats: [],
      data: [],
    },
    {
      id: 3,
      artifactName: 'gpu_metrics_multinode_b200-x_0',
      configKey: 'multinode_b200-x_0',
      fileName: 'results/gpu_metrics_rank1.csv',
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 0,
      gpuCount: 0,
      startedAt: '2026-09-11T04:19:41.982Z',
      endedAt: '2026-09-11T04:19:41.982Z',
      sidecars: {},
      benchmarkResultIds: [11],
      stats: [],
      data: [],
    },
  ],
};

describe('databasePayloadToResponse', () => {
  it('shapes the stored digest like the GitHub payload and disambiguates multinode CSVs', () => {
    const response = databasePayloadToResponse(storedRunPayload);
    expect(response.source).toBe('database');
    expect(response.runInfo).toEqual({
      id: 34557177019,
      name: 'Run Sweep - dsr1 fp4 b200',
      branch: 'main',
      sha: 'deadbeef',
      createdAt: '2026-09-11T04:00:00.000Z',
      url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34557177019',
      conclusion: 'success',
      status: 'completed',
    });
    expect(response.artifacts.map((artifact) => artifact.name)).toEqual([
      'gpu_metrics_dsr1_conc32_b200-x_0',
      'gpu_metrics_multinode_b200-x_0/results/gpu_metrics_rank0.csv',
      'gpu_metrics_multinode_b200-x_0/results/gpu_metrics_rank1.csv',
    ]);
    expect(response.artifacts[0]!.data).toHaveLength(2);
    expect(response.artifacts[0]!.series?.benchmarkResultIds).toEqual([10]);
    expect(response.artifacts[0]!.series).not.toHaveProperty('data');
  });
});

describe('GET /api/gpu-metrics — database first', () => {
  it('serves the stored digest without touching GitHub when the run is ingested', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    mockGetGpuMetricsForRun.mockResolvedValueOnce(storedRunPayload);
    globalThis.fetch = vi.fn();

    const res = await GET(req('/api/gpu-metrics?runId=34557177019'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('database');
    expect(body.artifacts).toHaveLength(3);
    expect(mockGetGpuMetricsForRun).toHaveBeenCalledWith({}, 34557177019);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports a database failure separately instead of treating it as missing data', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    mockGetGpuMetricsForRun.mockRejectedValueOnce(new Error('relation does not exist'));
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await GET(req('/api/gpu-metrics?runId=99'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('checks retained file/sample coverage before using a truncated host CSV fallback', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    const { parseCsvData } = await vi.importActual<typeof GpuPowerTypes>(
      '@/components/gpu-power/types',
    );
    const header =
      'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]';
    const hostA = [header, nvidiaRow(0, 300), nvidiaRow(0, 999), nvidiaRow(1, 310)].join('\n');
    // host-b lost its GPU 1 row: one of the two retained samples.
    const hostB = [header, nvidiaRow(0, 500)].join('\n');
    zipArchives.byKey.set('coverage', [
      { entryName: 'host-a/gpu_metrics.csv', data: hostA },
      { entryName: 'host-b/gpu_metrics.csv', data: hostB },
    ]);
    mockParseCsvData.mockImplementationOnce(parseCsvData).mockImplementationOnce(parseCsvData);
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      series: [
        {
          ...storedRunPayload.series[0],
          artifactName: 'gpu_metrics_live',
          fileName: 'host-a/gpu_metrics.csv',
          sidecars: {
            seriesInventory: [
              { fileName: 'host-a/gpu_metrics.csv', sampleCount: 2 },
              { fileName: 'host-b/gpu_metrics.csv', sampleCount: 2 },
            ],
          },
        },
      ],
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 34557177019,
            name: 'Sweep',
            head_branch: 'main',
            head_sha: 'abc',
            created_at: '2026-03-01T00:00:00Z',
            html_url: 'https://example.test/run',
            status: 'completed',
            conclusion: 'success',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              { id: 1, name: 'gpu_metrics_live', archive_download_url: 'https://example.test/zip' },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('coverage').buffer),
      });
    const res = await GET(req('/api/gpu-metrics?runId=34557177019&series=power'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: 'STORED_TELEMETRY_INCOMPLETE',
      artifact: 'gpu_metrics_live',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});

describe('GET /api/gpu-metrics', () => {
  it('returns 400 when runId is missing', async () => {
    const res = await GET(req('/api/gpu-metrics'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('runId must be a numeric workflow run ID');
  });

  it('returns 400 when runId is not numeric', async () => {
    const res = await GET(req('/api/gpu-metrics?runId=abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('runId must be a numeric workflow run ID');
  });

  it('returns 400 when runId has non-digit chars', async () => {
    const res = await GET(req('/api/gpu-metrics?runId=123abc'));
    expect(res.status).toBe(400);
  });

  it('returns gpu metrics for valid runId', async () => {
    const mockRunData = {
      id: 12345,
      name: 'GPU Benchmark',
      head_branch: 'main',
      head_sha: 'abc123',
      created_at: '2026-03-01T00:00:00Z',
      html_url: 'https://github.com/TestOwner/TestRepo/actions/runs/12345',
      conclusion: 'success',
      status: 'completed',
    };

    globalThis.fetch = vi
      .fn()
      // 1st call: fetch workflow run info
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRunData),
      })
      // 2nd call: fetch artifacts list (page 1)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              {
                id: 1,
                name: 'gpu_metrics_dsr1_h200',
                archive_download_url: 'https://example.com/dl/1',
              },
            ],
          }),
      })
      // 3rd call: download artifact zip
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '1024' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runInfo).toEqual({
      id: 12345,
      name: 'GPU Benchmark',
      branch: 'main',
      sha: 'abc123',
      createdAt: '2026-03-01T00:00:00Z',
      url: 'https://github.com/TestOwner/TestRepo/actions/runs/12345',
      conclusion: 'success',
      status: 'completed',
    });
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0].name).toBe('gpu_metrics_dsr1_h200');
    expect(body.artifacts[0].data).toHaveLength(1);
  });

  it('returns 500 when workflow run fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const res = await GET(req('/api/gpu-metrics?runId=99999'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to fetch workflow run');
  });

  it('returns 500 when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;

    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('GitHub token not configured');
  });

  it('returns 500 when no gpu_metrics artifacts found', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 12345,
            name: 'Run',
            head_branch: 'main',
            head_sha: 'a',
            created_at: '',
            html_url: '',
            conclusion: '',
            status: '',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              {
                id: 1,
                name: 'benchmark_results',
                archive_download_url: 'https://example.com/dl/1',
              },
            ],
          }),
      });

    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('No gpu_metrics artifacts found');
  });

  it('skips artifacts that fail to download', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 12345,
            name: 'Run',
            head_branch: 'main',
            head_sha: 'a',
            created_at: '',
            html_url: '',
            conclusion: '',
            status: '',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              {
                id: 1,
                name: 'gpu_metrics_dsr1_h200',
                archive_download_url: 'https://example.com/dl/1',
              },
              {
                id: 2,
                name: 'gpu_metrics_dsr1_b200',
                archive_download_url: 'https://example.com/dl/2',
              },
            ],
          }),
      })
      // First artifact download fails
      .mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
      })
      // Second artifact download succeeds
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '512' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the second artifact should be present
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0].name).toBe('gpu_metrics_dsr1_b200');
  });

  it('skips artifacts exceeding 50MB', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 12345,
            name: 'Run',
            head_branch: 'main',
            head_sha: 'a',
            created_at: '',
            html_url: '',
            conclusion: '',
            status: '',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              {
                id: 1,
                name: 'gpu_metrics_dsr1_h200',
                archive_download_url: 'https://example.com/dl/1',
              },
              {
                id: 2,
                name: 'gpu_metrics_dsr1_b200',
                archive_download_url: 'https://example.com/dl/2',
              },
            ],
          }),
      })
      // First artifact too large
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': String(60 * 1024 * 1024) }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
      // Second artifact ok
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '512' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0].name).toBe('gpu_metrics_dsr1_b200');
  });
});

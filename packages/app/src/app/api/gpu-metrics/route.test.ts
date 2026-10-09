import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockParseCsvData } = vi.hoisted(() => ({
  mockParseCsvData: vi.fn((csv: string) => {
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
}));

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
  const csvContent = 'timestamp,index,power\n2026-03-01T00:00:00Z,0,300';
  class MockAdmZip {
    getEntries() {
      return [
        {
          entryName: 'gpu_metrics_0.csv',
          isDirectory: false,
          getData: () => Buffer.from(csvContent),
        },
      ];
    }
  }
  return { default: MockAdmZip };
});

import { databasePayloadToResponse, GET, readGpuMetricsForView } from './route';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
let origToken: string | undefined;
let origReadonlyUrl: string | undefined;

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
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

const multinodeSeries = {
  artifactName: 'gpu_metrics_multinode_b200-x_0',
  fileName: 'results/gpu_metrics_rank0.csv',
  vendor: 'nvidia',
  sampleIntervalS: 1,
  sampleCount: 0,
  gpuCount: 0,
  startedAt: '2026-09-11T04:19:41.982Z',
  endedAt: '2026-09-11T04:19:41.982Z',
  sidecars: {},
  stats: [],
  data: [],
};
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
      ...multinodeSeries,
      id: 1,
      artifactName: 'gpu_metrics_dsr1_conc32_b200-x_0',
      fileName: 'gpu_metrics.csv',
      sampleCount: 2,
      gpuCount: 1,
      endedAt: '2026-09-11T04:19:42.990Z',
      data: [
        { timestamp: '2026-09-11T04:19:41.982Z', index: 0, power: 187.8 },
        { timestamp: '2026-09-11T04:19:42.990Z', index: 0, power: 912.1 },
      ],
    },
    { ...multinodeSeries, id: 2 },
    { ...multinodeSeries, id: 3, fileName: 'results/gpu_metrics_rank1.csv' },
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
    expect(response.artifacts[0]!.series?.id).toBe(1);
    expect(response.artifacts[0]!.series).not.toHaveProperty('data');
  });
});

describe('GET /api/gpu-metrics — database first', () => {
  it('answers stored runs without GitHub, reading every artifact for GET and one host for a view', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    globalThis.fetch = vi.fn();
    const names = databasePayloadToResponse(storedRunPayload).artifacts.map((entry) => entry.name);
    mockGetGpuMetricsForRun.mockResolvedValueOnce(storedRunPayload);
    const all = await GET(req('/api/gpu-metrics?runId=34557177019'));
    expect(await all.json()).toMatchObject({
      source: 'database',
      artifacts: names.map((name) => ({ name })),
    });
    // An absent selection reads every artifact; `artifact: null` narrows to the first.
    expect(mockGetGpuMetricsForRun).toHaveBeenCalledWith({}, 34557177019, {
      prefix: null,
      sourceResults: null,
    });
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      artifactNames: names,
      series: [storedRunPayload.series[2]],
    });
    const response = await readGpuMetricsForView(
      req('/api/gpu-metrics?runId=34557177019'),
      names[2]!,
    );
    expect(await response.json()).toMatchObject({
      artifactNames: names,
      artifacts: [{ name: names[2] }],
    });
    expect(mockGetGpuMetricsForRun).toHaveBeenCalledWith({}, 34557177019, {
      prefix: null,
      sourceResults: null,
      artifact: names[2],
    });
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      artifactNames: names,
      series: [],
    });
    const missing = await readGpuMetricsForView(
      req('/api/gpu-metrics?runId=34557177019'),
      'missing',
    );
    expect(await missing.json()).toMatchObject({ artifactNames: names, artifacts: [] });
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

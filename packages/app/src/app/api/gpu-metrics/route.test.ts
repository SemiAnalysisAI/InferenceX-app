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

vi.mock('adm-zip', () => {
  class MockAdmZip {
    getEntries() {
      return [{ entryName: 'gpu_metrics_0.csv', isDirectory: false }];
    }
    readAsText() {
      return 'timestamp,index,power\n2026-03-01T00:00:00Z,0,300';
    }
  }
  return { default: MockAdmZip };
});

import { GET } from './route';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
let origToken: string | undefined;

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
  origToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 'test-gh-token';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (origToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = origToken;
  }
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
        json: async () => mockRunData,
      })
      // 2nd call: fetch artifacts list (page 1)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        arrayBuffer: async () => new ArrayBuffer(0),
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
        json: async () => ({
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
        json: async () => ({
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
        json: async () => ({
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
        json: async () => ({
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
        arrayBuffer: async () => new ArrayBuffer(0),
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
        json: async () => ({
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
        json: async () => ({
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
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      // Second artifact ok
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '512' }),
        arrayBuffer: async () => new ArrayBuffer(0),
      });

    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0].name).toBe('gpu_metrics_dsr1_b200');
  });
});

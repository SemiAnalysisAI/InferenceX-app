import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockParseCsvData, zipRegistry } = vi.hoisted(() => ({
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
  /**
   * Per-download ZIP entry sets, keyed by the downloaded buffer's UTF-8
   * contents (each mocked download returns its registry key as the body).
   * Unregistered buffers fall back to the default single-CSV zip.
   */
  zipRegistry: new Map<string, { entryName: string; contents: string }[]>(),
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
  const csvContent = 'timestamp,index,power\n2026-03-01T00:00:00Z,0,300';
  const defaultEntries = [{ entryName: 'gpu_metrics_0.csv', contents: csvContent }];
  class MockAdmZip {
    private readonly entries: { entryName: string; isDirectory: boolean; getData: () => Buffer }[];

    constructor(buffer?: Buffer) {
      const key = buffer ? buffer.toString('utf8') : '';
      const entries = zipRegistry.get(key) ?? defaultEntries;
      this.entries = entries.map((entry) => ({
        entryName: entry.entryName,
        isDirectory: false,
        getData: () => Buffer.from(entry.contents),
      }));
    }

    getEntries() {
      return this.entries;
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
  zipRegistry.clear();
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

  describe('power sidecar enrichment', () => {
    const RUN_JSON = {
      id: 12345,
      name: 'Run',
      head_branch: 'main',
      head_sha: 'a',
      created_at: '2026-03-01T00:00:00Z',
      html_url: 'https://github.com/TestOwner/TestRepo/actions/runs/12345',
      conclusion: 'success',
      status: 'completed',
    };

    interface MockArtifact {
      id: number;
      name: string;
      /** ZIP registry key returned as the download body; '' = default CSV zip. */
      zipKey?: string;
      contentLength?: number;
    }

    /** URL-routed fetch mock: run info, artifact list, and downloads by id. */
    function installFetch(artifactList: MockArtifact[]): ReturnType<typeof vi.fn> {
      const fetchMock = vi.fn((input: unknown) => {
        const url = String(input);
        if (url.includes('/actions/runs/12345/artifacts')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                artifacts: artifactList.map((a) => ({
                  id: a.id,
                  name: a.name,
                  archive_download_url: `https://example.com/dl/${a.id}`,
                })),
              }),
          });
        }
        if (url.includes('/actions/runs/12345')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(RUN_JSON) });
        }
        const artifact = artifactList.find((a) => url === `https://example.com/dl/${a.id}`);
        if (artifact) {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ 'Content-Length': String(artifact.contentLength ?? 1024) }),
            arrayBuffer: () => Promise.resolve(Buffer.from(artifact.zipKey ?? '')),
          });
        }
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    const SIDECAR_JSON = JSON.stringify({
      schema_version: 1,
      power_valid: true,
      reasons: [],
      benchmark_result: '/workspace/results/dsr1_h200.json',
      benchmark_window: { start_time_unix: 1755000020, end_time_unix: 1755000080 },
      expected_gpu_count: 8,
      observed_gpu_count: 8,
      metrics: { avg_power_w: 401.5, avg_total_gpu_power_w: 3212 },
    });

    const AGG_JSON = JSON.stringify({
      power_valid: 1,
      power_metric_schema_version: 1,
      avg_power_w: 402,
      avg_total_gpu_power_w: 3216,
    });

    it('populates power from the power_audit sidecar on legacy runs without bmk', async () => {
      zipRegistry.set('zip:power_audit', [
        { entryName: 'power_validation_dsr1_h200.json', contents: SIDECAR_JSON },
        { entryName: 'agg_dsr1_h200.json', contents: AGG_JSON },
        { entryName: 'dsr1_h200.json', contents: '{}' },
      ]);
      installFetch([
        { id: 1, name: 'gpu_metrics_dsr1_h200' },
        { id: 2, name: 'power_audit_dsr1_h200', zipKey: 'zip:power_audit' },
      ]);

      const res = await GET(req('/api/gpu-metrics?runId=12345'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artifacts).toHaveLength(1);
      expect(body.artifacts[0].power).toEqual({
        power_valid: 1,
        reasons: [],
        window: { start_unix: 1755000020, end_unix: 1755000080 },
        expected_gpu_count: 8,
        observed_gpu_count: 8,
        published: {
          avg_power_w: 402,
          avg_total_gpu_power_w: 3216,
          power_metric_schema_version: 1,
          source: 'power_audit_agg',
        },
        producer_sha: null,
        exporter_image_sha256: null,
        sources: ['power_audit_dsr1_h200'],
      });
    });

    it('uses an embedded audit window without downloading the power_audit artifact', async () => {
      zipRegistry.set('zip:bmk', [
        {
          entryName: 'agg_dsr1_h200.json',
          contents: JSON.stringify({
            power_valid: 1,
            power_metric_schema_version: 1,
            avg_power_w: 402,
            avg_total_gpu_power_w: 3216,
            power_audit: {
              window_start_unix: 1755000020,
              window_end_unix: 1755000080,
              expected_gpu_count: 8,
              observed_gpu_count: 8,
              producer_sha: 'abc123def456',
              exporter_image_sha256: 'sha256:feedface',
            },
          }),
        },
      ]);
      const fetchMock = installFetch([
        { id: 1, name: 'gpu_metrics_dsr1_h200' },
        { id: 2, name: 'bmk_dsr1_h200', zipKey: 'zip:bmk' },
        { id: 3, name: 'power_audit_dsr1_h200', zipKey: 'zip:unused' },
      ]);

      const res = await GET(req('/api/gpu-metrics?runId=12345'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artifacts[0].power).toEqual({
        power_valid: 1,
        reasons: [],
        window: { start_unix: 1755000020, end_unix: 1755000080 },
        expected_gpu_count: 8,
        observed_gpu_count: 8,
        published: {
          avg_power_w: 402,
          avg_total_gpu_power_w: 3216,
          power_metric_schema_version: 1,
          source: 'bmk_artifact',
        },
        producer_sha: 'abc123def456',
        exporter_image_sha256: 'sha256:feedface',
        sources: ['bmk_dsr1_h200'],
      });
      const fetchedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(fetchedUrls).not.toContain('https://example.com/dl/3');
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('omits power entirely when no sibling artifacts exist (legacy shape)', async () => {
      installFetch([{ id: 1, name: 'gpu_metrics_dsr1_h200' }]);

      const res = await GET(req('/api/gpu-metrics?runId=12345'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artifacts).toHaveLength(1);
      expect(Object.keys(body.artifacts[0]).toSorted()).toEqual(['data', 'name']);
    });

    it('skips an oversized power_audit bundle and keeps bmk content', async () => {
      zipRegistry.set('zip:bmk-legacy', [{ entryName: 'agg_dsr1_h200.json', contents: AGG_JSON }]);
      installFetch([
        { id: 1, name: 'gpu_metrics_dsr1_h200' },
        { id: 2, name: 'bmk_dsr1_h200', zipKey: 'zip:bmk-legacy' },
        {
          id: 3,
          name: 'power_audit_dsr1_h200',
          zipKey: 'zip:power_audit',
          contentLength: 60 * 1024 * 1024,
        },
      ]);

      const res = await GET(req('/api/gpu-metrics?runId=12345'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artifacts[0].power).toEqual({
        power_valid: 1,
        reasons: [],
        window: null,
        expected_gpu_count: null,
        observed_gpu_count: null,
        published: {
          avg_power_w: 402,
          avg_total_gpu_power_w: 3216,
          power_metric_schema_version: 1,
          source: 'bmk_artifact',
        },
        producer_sha: null,
        exporter_image_sha256: null,
        sources: ['bmk_dsr1_h200'],
      });
    });

    it('keeps a no-op bmk artifact out of sources and falls through to the bundle', async () => {
      zipRegistry.set('zip:bmk-noop', [
        { entryName: 'agg_dsr1_h200.json', contents: JSON.stringify({ output_toks_per_sec: 1 }) },
      ]);
      zipRegistry.set('zip:audit-sidecar-only', [
        { entryName: 'power_validation_dsr1_h200.json', contents: SIDECAR_JSON },
      ]);
      installFetch([
        { id: 1, name: 'gpu_metrics_dsr1_h200' },
        { id: 2, name: 'bmk_dsr1_h200', zipKey: 'zip:bmk-noop' },
        { id: 3, name: 'power_audit_dsr1_h200', zipKey: 'zip:audit-sidecar-only' },
      ]);

      const res = await GET(req('/api/gpu-metrics?runId=12345'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artifacts[0].power.sources).toEqual(['power_audit_dsr1_h200']);
      expect(body.artifacts[0].power.published).toEqual({
        avg_power_w: 401.5,
        avg_total_gpu_power_w: 3212,
        power_metric_schema_version: null,
        source: 'validation_metrics',
      });
      expect(body.artifacts[0].power.window).toEqual({
        start_unix: 1755000020,
        end_unix: 1755000080,
      });
    });

    it('omits power but keeps the CSV view when the sidecar JSON is malformed', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        zipRegistry.set('zip:bad-audit', [
          { entryName: 'power_validation_dsr1_h200.json', contents: '{not json' },
        ]);
        installFetch([
          { id: 1, name: 'gpu_metrics_dsr1_h200' },
          { id: 2, name: 'power_audit_dsr1_h200', zipKey: 'zip:bad-audit' },
        ]);

        const res = await GET(req('/api/gpu-metrics?runId=12345'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.artifacts).toHaveLength(1);
        expect(body.artifacts[0].data).toHaveLength(1);
        expect(body.artifacts[0].power).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});

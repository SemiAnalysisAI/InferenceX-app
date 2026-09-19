import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockParseCsvData, zipArchives } = vi.hoisted(() => {
  interface ZipEntry {
    entryName: string;
    data: string;
  }
  const csvArchive: ZipEntry[] = [
    { entryName: 'gpu_metrics_0.csv', data: 'timestamp,index,power\n2026-03-01T00:00:00Z,0,300' },
  ];
  return {
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

vi.mock('adm-zip', () => {
  class MockAdmZip {
    private readonly key: string;
    constructor(buffer: Buffer) {
      this.key = buffer.toString('utf8');
    }
    getEntries() {
      if (this.key === 'corrupt') {
        throw new Error('ADM-ZIP: Invalid or unsupported zip format. No END header found');
      }
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

import { GET } from './route';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
let origToken: string | undefined;

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
  zipArchives.byKey.clear();
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

  it('returns 400 for a malformed prefix or an unknown series shape', async () => {
    const badPrefix = await GET(req('/api/gpu-metrics?runId=12345&prefix=a%20b'));
    expect(badPrefix.status).toBe(400);
    const badPrefixBody = await badPrefix.json();
    expect(badPrefixBody.error).toContain('prefix');
    const badSeries = await GET(req('/api/gpu-metrics?runId=12345&series=temperature'));
    expect(badSeries.status).toBe(400);
    const badSeriesBody = await badSeries.json();
    expect(badSeriesBody.error).toContain('series');
  });

  it('narrows downloads to the prefix and returns bucketed power series on demand', async () => {
    const mockRunData = {
      id: 12345,
      name: 'Run Sweep',
      head_branch: 'main',
      head_sha: 'abc123',
      created_at: '2026-03-01T00:00:00Z',
      html_url: 'https://github.com/TestOwner/TestRepo/actions/runs/12345',
      conclusion: 'success',
      status: 'completed',
    };
    mockParseCsvData.mockImplementationOnce(() => [
      {
        timestamp: '2026/03/01 00:00:00.100',
        index: 0,
        power: 300,
        temperature: 1,
        smClock: 1,
        memClock: 1,
        gpuUtil: 0,
        memUtil: 0,
      },
      {
        timestamp: '2026/03/01 00:00:00.104',
        index: 1,
        power: 310,
        temperature: 1,
        smClock: 1,
        memClock: 1,
        gpuUtil: 0,
        memUtil: 0,
      },
      {
        timestamp: '2026/03/01 00:00:01.100',
        index: 0,
        power: 500,
        temperature: 1,
        smClock: 1,
        memClock: 1,
        gpuUtil: 0,
        memUtil: 0,
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockRunData) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              // Another model in the same sweep: filtered out before download.
              {
                id: 1,
                name: 'gpu_metrics_dsr1_1k1k_fp8_x',
                archive_download_url: 'https://example.com/dl/1',
              },
              {
                id: 2,
                name: 'gpu_metrics_qwen3.5_8k1k_fp8_sglang_conc16',
                archive_download_url: 'https://example.com/dl/2',
              },
              {
                id: 3,
                name: 'eval_gpu_metrics_qwen3.5_8k1k_fp8_sglang_conc16',
                archive_download_url: 'https://example.com/dl/3',
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '1024' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    globalThis.fetch = fetchMock;

    const res = await GET(
      req('/api/gpu-metrics?runId=12345&series=power&prefix=qwen3.5_8k1k_fp8_'),
    );
    expect(res.status).toBe(200);
    // Run info, artifact list, and exactly one artifact download.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe('https://example.com/dl/2');
    const body = await res.json();
    expect(body.runInfo.id).toBe(12345);
    expect(body.artifacts).toBeUndefined();
    expect(body.series).toEqual([
      {
        artifact: 'gpu_metrics_qwen3.5_8k1k_fp8_sglang_conc16',
        startMs: Date.UTC(2026, 2, 1, 0, 0, 0),
        bucketSeconds: 1,
        gpus: [0, 1],
        t: [0, 1],
        power: [
          [300, 500],
          [310, null],
        ],
      },
    ]);
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

/**
 * Bundle fixtures: one `power_audit_*` sweep with two devices and one
 * validated window, plus a GitHub mock that answers by URL so download order
 * does not matter.
 */
const BUNDLE_RESULT = 'qwen3.5_8k1k_fp8_dynamo-sglang_prefill-tp4-pp1_decode-tp4-pp1-e-5b35252b';
const BUNDLE_NAME = `power_audit_${BUNDLE_RESULT}`;
const BUNDLE_VALIDATION = `power_validation_${BUNDLE_RESULT}_sa-bench_isl_8192_osl_1024_conc8_gpus_8_ctx_4_gen_4.json`;
const OTHER_BUNDLE_NAME = 'power_audit_dsr1_1k1k_fp8_dynamo-sglang_prefill-tp4-abc';
const CSV_NAME = 'gpu_metrics_qwen3.5_8k1k_fp8_sglang_conc16';
const RUN = {
  id: 12345,
  name: 'Run Sweep',
  head_branch: 'main',
  head_sha: 'abc123',
  created_at: '2026-03-01T00:00:00Z',
  html_url: 'https://github.com/TestOwner/TestRepo/actions/runs/12345',
  conclusion: 'success',
  status: 'completed',
};

const BUNDLE_ARCHIVE = [
  {
    entryName: 'LOGS/power/samples.csv',
    data: [
      'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w',
      '1,1000.2,1,cn02,0,GPU-d,500',
      '1,1000.2,1,cn01,0,GPU-p,300',
      '1,1001.2,2,cn02,0,GPU-d,510',
      '1,1001.2,2,cn01,0,GPU-p,310',
    ].join('\n'),
  },
  {
    entryName: 'LOGS/power/manifest.json',
    data: JSON.stringify({
      expected_devices: [
        { hostname: 'cn02', gpu_index: 0, assignments: [{ worker_role: 'decode' }] },
      ],
    }),
  },
  {
    entryName: BUNDLE_VALIDATION,
    data: JSON.stringify({
      selected_window: { concurrency: 8, start_time_unix: 1000, end_time_unix: 1001 },
      per_gpu_role: { 'cn01/GPU-p': 'prefill' },
    }),
  },
  {
    entryName: `LOGS/sa-bench_isl_8192_osl_1024/results_concurrency_8.json`,
    data: '{"huge": true}',
  },
  { entryName: `agg_${BUNDLE_RESULT}_conc8.json`, data: '{}' },
];

const EXPECTED_BUNDLE_SERIES = {
  artifact: BUNDLE_NAME,
  source: BUNDLE_VALIDATION,
  startMs: 1000 * 1000,
  bucketSeconds: 1,
  gpus: [0, 1],
  t: [0, 1],
  power: [
    [300, 310],
    [500, 510],
  ],
  devices: [
    { id: 'cn01/GPU-p', role: 'prefill' },
    { id: 'cn02/GPU-d', role: 'decode' },
  ],
};

interface MockDownload {
  /** Key of the zip archive the adm-zip mock serves for this download. */
  archive: string;
  contentLength?: number;
}

/** Answers run info, the artifact listing, and downloads by URL; returns the fetch spy. */
function mockGithub(
  artifacts: { name: string; url: string }[],
  downloads: Record<string, MockDownload>,
) {
  const fetchMock = vi.fn((input: string) => {
    if (input.endsWith('/actions/runs/12345')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RUN) });
    }
    if (input.includes('/actions/runs/12345/artifacts')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: artifacts.map((artifact, index) => ({
              id: index + 1,
              name: artifact.name,
              archive_download_url: artifact.url,
            })),
          }),
      });
    }
    const download = downloads[input];
    if (!download) return Promise.resolve({ ok: false, statusText: `Unexpected ${input}` });
    const bytes = new TextEncoder().encode(download.archive);
    return Promise.resolve({
      ok: true,
      headers: new Headers({ 'Content-Length': String(download.contentLength ?? 1024) }),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function downloadedUrls(fetchMock: ReturnType<typeof mockGithub>): string[] {
  return fetchMock.mock.calls.map(([url]) => url).filter((url) => url.includes('/dl/'));
}

describe('GET /api/gpu-metrics?series=power with power_audit bundles', () => {
  beforeEach(() => {
    zipArchives.byKey.set('bundle', BUNDLE_ARCHIVE);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('cuts a bundle into per-window series alongside gpu_metrics series', async () => {
    const fetchMock = mockGithub(
      [
        { name: CSV_NAME, url: 'https://example.com/dl/csv' },
        { name: BUNDLE_NAME, url: 'https://example.com/dl/bundle' },
      ],
      {
        'https://example.com/dl/csv': { archive: '' },
        'https://example.com/dl/bundle': { archive: 'bundle' },
      },
    );

    const res = await GET(
      req('/api/gpu-metrics?runId=12345&series=power&prefix=qwen3.5_8k1k_fp8_'),
    );
    expect(res.status).toBe(200);
    expect(downloadedUrls(fetchMock)).toEqual([
      'https://example.com/dl/csv',
      'https://example.com/dl/bundle',
    ]);
    const body = await res.json();
    expect(body.runInfo.id).toBe(12345);
    expect(body.artifacts).toBeUndefined();
    expect(body.series).toHaveLength(2);
    expect(body.series[0]).toMatchObject({ artifact: CSV_NAME, gpus: [0] });
    expect(body.series[0].source).toBeUndefined();
    expect(body.series[1]).toEqual(EXPECTED_BUNDLE_SERIES);
  });

  it('skips a bundle whose archive cannot be read and keeps the other series', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGithub(
      [
        { name: CSV_NAME, url: 'https://example.com/dl/csv' },
        { name: BUNDLE_NAME, url: 'https://example.com/dl/corrupt' },
      ],
      {
        'https://example.com/dl/csv': { archive: '' },
        'https://example.com/dl/corrupt': { archive: 'corrupt' },
      },
    );

    const res = await GET(
      req('/api/gpu-metrics?runId=12345&series=power&prefix=qwen3.5_8k1k_fp8_'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.series).toHaveLength(1);
    expect(body.series[0]).toMatchObject({ artifact: CSV_NAME });
    expect(warn).toHaveBeenCalledWith(
      `Failed to read artifact ${BUNDLE_NAME}:`,
      expect.objectContaining({ message: expect.stringContaining('ADM-ZIP') }),
    );
  });

  it('selects a bundle whether the prefix stops short of or runs past its name', async () => {
    const artifacts = [
      { name: BUNDLE_NAME, url: 'https://example.com/dl/bundle' },
      { name: OTHER_BUNDLE_NAME, url: 'https://example.com/dl/other' },
    ];
    const downloads = {
      'https://example.com/dl/bundle': { archive: 'bundle' },
      'https://example.com/dl/other': { archive: 'bundle' },
    };

    const longPrefix = `${BUNDLE_RESULT}_sa-bench_isl_8192_osl_1024_conc`;
    let fetchMock = mockGithub(artifacts, downloads);
    let res = await GET(req(`/api/gpu-metrics?runId=12345&series=power&prefix=${longPrefix}`));
    expect(res.status).toBe(200);
    expect(downloadedUrls(fetchMock)).toEqual(['https://example.com/dl/bundle']);
    let body = await res.json();
    expect(body.series).toEqual([EXPECTED_BUNDLE_SERIES]);

    fetchMock = mockGithub(artifacts, downloads);
    res = await GET(req('/api/gpu-metrics?runId=12345&series=power&prefix=qwen3.5_8k1k_'));
    expect(res.status).toBe(200);
    expect(downloadedUrls(fetchMock)).toEqual(['https://example.com/dl/bundle']);
    body = await res.json();
    expect(body.series.map((entry: { artifact: string }) => entry.artifact)).toEqual([BUNDLE_NAME]);

    // No prefix: every bundle of the run.
    fetchMock = mockGithub(artifacts, downloads);
    res = await GET(req('/api/gpu-metrics?runId=12345&series=power'));
    expect(res.status).toBe(200);
    expect(downloadedUrls(fetchMock)).toEqual([
      'https://example.com/dl/bundle',
      'https://example.com/dl/other',
    ]);
    body = await res.json();
    expect(body.series.map((entry: { artifact: string }) => entry.artifact)).toEqual([
      BUNDLE_NAME,
      OTHER_BUNDLE_NAME,
    ]);
  });

  it('skips bundles above 256 MiB with a warning', async () => {
    mockGithub(
      [
        { name: OTHER_BUNDLE_NAME, url: 'https://example.com/dl/other' },
        { name: BUNDLE_NAME, url: 'https://example.com/dl/bundle' },
      ],
      {
        'https://example.com/dl/other': { archive: 'bundle', contentLength: 300 * 1024 * 1024 },
        // Above the 50 MB CSV cap, below the bundle cap.
        'https://example.com/dl/bundle': { archive: 'bundle', contentLength: 200 * 1024 * 1024 },
      },
    );

    const res = await GET(req('/api/gpu-metrics?runId=12345&series=power'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.series).toEqual([EXPECTED_BUNDLE_SERIES]);
    expect(console.warn).toHaveBeenCalledWith(
      `Artifact ${OTHER_BUNDLE_NAME} exceeds 256 MB, skipping`,
    );
  });

  it('keeps the raw-rows shape blind to bundles', async () => {
    let fetchMock = mockGithub(
      [
        { name: BUNDLE_NAME, url: 'https://example.com/dl/bundle' },
        { name: CSV_NAME, url: 'https://example.com/dl/csv' },
      ],
      {
        'https://example.com/dl/csv': { archive: '' },
        'https://example.com/dl/bundle': { archive: 'bundle' },
      },
    );
    let res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(200);
    expect(downloadedUrls(fetchMock)).toEqual(['https://example.com/dl/csv']);
    const body = await res.json();
    expect(body.series).toBeUndefined();
    expect(body.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual([CSV_NAME]);

    fetchMock = mockGithub([{ name: BUNDLE_NAME, url: 'https://example.com/dl/bundle' }], {
      'https://example.com/dl/bundle': { archive: 'bundle' },
    });
    res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(500);
    expect(downloadedUrls(fetchMock)).toEqual([]);
    const bundleOnly = await res.json();
    expect(bundleOnly.error).toBe('No gpu_metrics artifacts found for this run');
  });

  it('names both collectors when a power request finds no telemetry', async () => {
    mockGithub([{ name: 'benchmark_results', url: 'https://example.com/dl/results' }], {});
    const res = await GET(req('/api/gpu-metrics?runId=12345&series=power'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(
      'No telemetry artifacts (gpu_metrics or power_audit) found for this run',
    );
  });

  it('reports no data when the only bundle has no power entries', async () => {
    zipArchives.byKey.set('empty', [{ entryName: `agg_${BUNDLE_RESULT}_conc8.json`, data: '{}' }]);
    mockGithub([{ name: BUNDLE_NAME, url: 'https://example.com/dl/bundle' }], {
      'https://example.com/dl/bundle': { archive: 'empty' },
    });
    const res = await GET(req('/api/gpu-metrics?runId=12345&series=power'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('No Chip metrics data found in artifacts');
  });
});

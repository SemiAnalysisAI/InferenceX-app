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

import { databasePayloadToResponse, GET } from './route';
import { NextRequest } from 'next/server';

const originalFetch = globalThis.fetch;
let origToken: string | undefined;
let origReadonlyUrl: string | undefined;

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

const NVIDIA_HEADER =
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]';

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

  it('fills missing run metadata with the run date and canonical run URL', () => {
    const response = databasePayloadToResponse({
      ...storedRunPayload,
      workflowRun: {
        ...storedRunPayload.workflowRun,
        htmlUrl: null,
        headBranch: null,
        headSha: null,
        conclusion: null,
        status: null,
        createdAt: null,
      },
    });
    expect(response.runInfo.createdAt).toBe('2026-09-11T00:00:00Z');
    expect(response.runInfo.url).toBe(
      'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34557177019',
    );
    expect(response.runInfo.branch).toBe('');
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

  it('falls back to GitHub when the database has no series for the run', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    mockGetGpuMetricsForRun.mockResolvedValueOnce(null);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 99,
            name: 'In progress',
            head_branch: 'main',
            head_sha: 'abc',
            created_at: '2026-09-17T00:00:00Z',
            html_url: 'https://github.com/TestOwner/TestRepo/actions/runs/99',
            conclusion: null,
            status: 'in_progress',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artifacts: [
              { id: 1, name: 'gpu_metrics_live', archive_download_url: 'https://example.com/dl/1' },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '1024' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

    const res = await GET(req('/api/gpu-metrics?runId=99'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('github');
    expect(body.artifacts[0].name).toBe('gpu_metrics_live');
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

  it('renders persisted Timeline series with GitHub unavailable and preserves prefix filtering', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    mockGetGpuMetricsForRun.mockResolvedValueOnce(storedRunPayload);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('GitHub artifacts expired'));
    const res = await GET(req('/api/gpu-metrics?runId=34557177019&series=power&prefix=dsr1_'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      source: 'database',
      series: [
        {
          artifact: 'gpu_metrics_dsr1_conc32_b200-x_0',
          startMs: Date.parse('2026-09-11T04:19:41Z'),
          bucketSeconds: 1,
          gpus: [0],
          t: [0, 1],
          power: [[187.8, 912.1]],
        },
      ],
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uses stored bundle windows when a point prefix extends past the artifact name', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    const source = 'power_validation_qwen3.5_8k1k_fp8_slurm_conc32.json';
    const base = storedRunPayload.series[0];
    const start = Date.parse(base.data[0].timestamp) / 1000;
    const bundle = (host: string, power: number) => ({
      ...base,
      artifactName: 'power_audit_qwen3.5_8k1k_fp8_slurm',
      fileName: `LOGS/power/samples.csv#${host}`,
      sidecars: {
        identity: [{ hostname: host, gpu_index: 0, gpu_uuid: `GPU-${host}` }],
        validations: {
          [source]: { selected_window: { start_time_unix: start, end_time_unix: start + 1 } },
        },
      },
      data: [{ ...base.data[0], power }],
    });
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      series: [bundle('a', 100), bundle('b', 500)],
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('GitHub unavailable'));
    const res = await GET(
      req('/api/gpu-metrics?runId=34557177019&series=power&prefix=qwen3.5_8k1k_fp8_slurm_conc32'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.series).toMatchObject([
      {
        artifact: 'power_audit_qwen3.5_8k1k_fp8_slurm',
        source,
        gpus: [0, 1],
        power: [[100], [500]],
        devices: [{ id: 'a/GPU-a' }, { id: 'b/GPU-b' }],
      },
    ]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports the incomplete artifact and recovery action when partial storage cannot fall back to GitHub', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    const entry = storedRunPayload.series[0];
    const artifactName = 'power_audit_qwen3.5_multinode';
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      series: [
        {
          ...entry,
          artifactName,
          fileName: 'LOGS/power/samples.csv#host-a',
          sidecars: {
            seriesInventory: [
              { fileName: 'LOGS/power/samples.csv#host-a', sampleCount: 2 },
              { fileName: 'LOGS/power/samples.csv#host-b', sampleCount: 2 },
            ],
          },
        },
      ],
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await GET(req('/api/gpu-metrics?runId=34557177019&series=power'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'STORED_TELEMETRY_INCOMPLETE', artifact: artifactName });
    expect(body.error).toContain('host-b');
    expect(body.error).toContain('Re-ingest');
    expect(body.series).toBeUndefined();
  });

  it.each([
    'complete',
    'missing host',
    'empty host',
    'truncated host',
    'second missing artifact',
    'healthy stored artifact',
    'healthy stored artifact also live',
  ])('checks retained file/sample coverage before using a %s CSV fallback', async (coverage) => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    const { parseCsvData } = await vi.importActual<typeof GpuPowerTypes>(
      '@/components/gpu-power/types',
    );
    const hostA = [NVIDIA_HEADER, nvidiaRow(0, 300), nvidiaRow(0, 999), nvidiaRow(1, 310)].join(
      '\n',
    );
    const hostB =
      coverage === 'empty host'
        ? NVIDIA_HEADER
        : [
            NVIDIA_HEADER,
            nvidiaRow(0, 500),
            ...(coverage === 'truncated host' ? [] : [nvidiaRow(1, 510)]),
          ].join('\n');
    zipArchives.byKey.set('coverage', [
      { entryName: 'host-a/gpu_metrics.csv', data: hostA },
      ...(coverage === 'missing host'
        ? []
        : [{ entryName: 'host-b/gpu_metrics.csv', data: hostB }]),
    ]);
    mockParseCsvData.mockImplementationOnce(parseCsvData);
    if (coverage !== 'missing host') mockParseCsvData.mockImplementationOnce(parseCsvData);
    const entry = storedRunPayload.series[0];
    const healthyStoredArtifact = coverage.startsWith('healthy stored artifact');
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      series: [
        {
          ...entry,
          artifactName: 'gpu_metrics_live',
          fileName: 'host-a/gpu_metrics.csv',
          sidecars: {
            seriesInventory: [
              { fileName: 'host-a/gpu_metrics.csv', sampleCount: 2 },
              { fileName: 'host-b/gpu_metrics.csv', sampleCount: 2 },
            ],
          },
        },
        ...(healthyStoredArtifact ? [entry] : []),
        ...(coverage === 'second missing artifact'
          ? [
              {
                ...entry,
                artifactName: 'gpu_metrics_second',
                fileName: 'host-a/gpu_metrics.csv',
                sidecars: {
                  seriesInventory: [
                    { fileName: 'host-a/gpu_metrics.csv', sampleCount: 2 },
                    { fileName: 'host-b/gpu_metrics.csv', sampleCount: 2 },
                  ],
                },
              },
            ]
          : []),
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
              {
                id: 1,
                name: 'gpu_metrics_live',
                archive_download_url: 'https://example.test/zip',
              },
              ...(coverage === 'healthy stored artifact also live'
                ? [
                    {
                      id: 2,
                      name: entry.artifactName,
                      archive_download_url: 'https://example.test/healthy-zip',
                    },
                  ]
                : []),
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('coverage').buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    const res = await GET(req('/api/gpu-metrics?runId=34557177019&series=power'));
    if (coverage === 'complete' || healthyStoredArtifact) {
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe('github');
      expect(body.series).toHaveLength(healthyStoredArtifact ? 2 : 1);
      expect(body.series).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifact: 'gpu_metrics_live',
            power: [
              [300, 310],
              [500, 510],
            ],
          }),
          ...(healthyStoredArtifact
            ? [
                expect.objectContaining({
                  artifact: entry.artifactName,
                  power: [[187.8, 912.1]],
                }),
              ]
            : []),
        ]),
      );
    } else {
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        code: 'STORED_TELEMETRY_INCOMPLETE',
        artifact:
          coverage === 'second missing artifact' ? 'gpu_metrics_second' : 'gpu_metrics_live',
      });
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(
      coverage === 'healthy stored artifact also live' ? 4 : 3,
    );
  });

  it('reports Timeline database failure even when the GitHub token is absent', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    delete process.env.GITHUB_TOKEN;
    mockGetGpuMetricsForRun.mockRejectedValueOnce(new Error('connection unavailable'));
    globalThis.fetch = vi.fn();
    const res = await GET(req('/api/gpu-metrics?runId=34557177019&series=power'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/gpu-metrics', () => {
  it('keeps host-local GPU zero separate in the default live multi-file response', async () => {
    const { parseCsvData } = await vi.importActual<typeof GpuPowerTypes>(
      '@/components/gpu-power/types',
    );
    zipArchives.byKey.set('multinode-csv', [
      { entryName: 'host-a/gpu_metrics.csv', data: [NVIDIA_HEADER, nvidiaRow(0, 300)].join('\n') },
      { entryName: 'host-b/gpu_metrics.csv', data: [NVIDIA_HEADER, nvidiaRow(0, 500)].join('\n') },
    ]);
    mockParseCsvData.mockImplementationOnce(parseCsvData).mockImplementationOnce(parseCsvData);
    mockGithub([{ name: 'gpu_metrics_live', url: 'https://example.test/dl/multinode' }], {
      'https://example.test/dl/multinode': { archive: 'multinode-csv' },
    });
    const res = await GET(req('/api/gpu-metrics?runId=12345'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      source: 'github',
      artifacts: [
        { name: 'gpu_metrics_live/host-a/gpu_metrics.csv', data: [{ index: 0, power: 300 }] },
        { name: 'gpu_metrics_live/host-b/gpu_metrics.csv', data: [{ index: 0, power: 500 }] },
      ],
    });
  });

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

  it('does not accept a same-name partial bundle as recovery for known missing stored hosts', async () => {
    process.env.DATABASE_READONLY_URL = 'postgresql://readonly.example.test/db';
    mockGetGpuMetricsForRun.mockResolvedValueOnce({
      ...storedRunPayload,
      series: [
        {
          ...storedRunPayload.series[0],
          artifactName: BUNDLE_NAME,
          fileName: 'LOGS/power/samples.csv#cn01',
          sidecars: {
            seriesInventory: [
              { fileName: 'LOGS/power/samples.csv#cn01', sampleCount: 2 },
              { fileName: 'LOGS/power/samples.csv#cn02', sampleCount: 2 },
            ],
          },
        },
      ],
    });
    zipArchives.byKey.set(
      'partial-bundle',
      BUNDLE_ARCHIVE.map((entry) =>
        entry.entryName === 'LOGS/power/samples.csv'
          ? {
              ...entry,
              data: entry.data
                .split('\n')
                .filter((line) => !line.includes(',cn02,'))
                .join('\n'),
            }
          : entry,
      ),
    );
    mockGithub([{ name: BUNDLE_NAME, url: 'https://example.test/dl/bundle' }], {
      'https://example.test/dl/bundle': { archive: 'partial-bundle' },
    });
    const res = await GET(req('/api/gpu-metrics?runId=12345&series=power'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: 'STORED_TELEMETRY_INCOMPLETE',
      artifact: BUNDLE_NAME,
    });
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

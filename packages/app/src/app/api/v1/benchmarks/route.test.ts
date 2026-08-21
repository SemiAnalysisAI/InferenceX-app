import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetLatestBenchmarks, mockGetBenchmarksForRun, mockGetDb } = vi.hoisted(() => ({
  mockGetLatestBenchmarks: vi.fn(),
  mockGetBenchmarksForRun: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getLatestBenchmarks: mockGetLatestBenchmarks,
  getBenchmarksForRun: mockGetBenchmarksForRun,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/benchmarks', () => {
  it('returns 400 for missing model param', async () => {
    const res = await GET(req('/api/v1/benchmarks'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Unknown model');
  });

  it('returns 400 for unknown model', async () => {
    const res = await GET(req('/api/v1/benchmarks?model=nonexistent'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Unknown model');
  });

  it('returns benchmark data for valid model', async () => {
    const mockRows = [{ id: 1, hardware: 'h200', tput: 100 }];
    mockGetLatestBenchmarks.mockResolvedValueOnce(mockRows);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockRows);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      undefined,
      undefined,
      undefined,
    );
  });

  it('does not expose agentic run-selection metadata on fixed-sequence rows', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([
      {
        id: 1,
        benchmark_type: 'single_turn',
        workflow_run_id: 42,
        run_started_at: '2026-08-12T10:00:00Z',
      },
    ]);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528'));
    expect(await res.json()).toEqual([{ id: 1, benchmark_type: 'single_turn' }]);
  });

  it('keeps run-selection metadata on agentic rows', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([
      {
        id: 1,
        benchmark_type: 'agentic_traces',
        workflow_run_id: 42,
        run_started_at: '2026-08-12T10:00:00Z',
      },
    ]);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528'));
    expect(await res.json()).toEqual([
      {
        id: 1,
        benchmark_type: 'agentic_traces',
        workflow_run_id: 42,
        run_started_at: '2026-08-12T10:00:00Z',
      },
    ]);
  });

  it('passes date param to query when provided', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-03-01'));
    expect(res.status).toBe(200);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      '2026-03-01',
      undefined,
      undefined,
    );
  });

  it('returns a compact, single-sequence calculator response', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([
      {
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        metrics: { tput_per_gpu: 100, median_intvty: 30, avg_power_w: 700 },
        workers: [{ rank: 0 }],
      },
      {
        benchmark_type: 'single_turn',
        isl: 8192,
        osl: 1024,
        metrics: { tput_per_gpu: 80, median_intvty: 20 },
      },
    ]);

    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&view=calculator&sequence=1k%2F1k'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        metrics: { tput_per_gpu: 100, median_intvty: 30 },
      },
    ]);
  });

  it('rejects an unknown calculator sequence', async () => {
    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&view=calculator&sequence=unknown'),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown calculator sequence' });
    expect(mockGetLatestBenchmarks).not.toHaveBeenCalled();
  });

  it('passes exact=true when query param set', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-03-01&exact=true'),
    );
    expect(res.status).toBe(200);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      '2026-03-01',
      true,
      undefined,
    );
  });

  it('passes a numeric runId through to the query', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-03-01&runId=27489075807'),
    );
    expect(res.status).toBe(200);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      '2026-03-01',
      undefined,
      '27489075807',
    );
  });

  it('ignores a non-numeric runId (treated as latest)', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-03-01&runId=not-a-run'),
    );
    expect(res.status).toBe(200);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      '2026-03-01',
      undefined,
      undefined,
    );
  });

  it('routes exactRun=true + runId to the exact-run query', async () => {
    const runRows = [{ id: 1, hardware: 'mi300x' }];
    mockGetBenchmarksForRun.mockResolvedValueOnce(runRows);

    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&runId=27489075807&exactRun=true'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(runRows);
    expect(mockGetBenchmarksForRun).toHaveBeenCalledWith('mock-sql', ['dsr1'], '27489075807');
    expect(mockGetLatestBenchmarks).not.toHaveBeenCalled();
  });

  it('ignores exactRun without a runId (falls back to latest)', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528&exactRun=true'));
    expect(res.status).toBe(200);
    expect(mockGetBenchmarksForRun).not.toHaveBeenCalled();
    expect(mockGetLatestBenchmarks).toHaveBeenCalled();
  });

  it('returns 500 when query throws', async () => {
    mockGetLatestBenchmarks.mockRejectedValueOnce(new Error('DB down'));

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('returns empty array when no benchmarks found', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

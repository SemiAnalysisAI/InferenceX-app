import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetAllBenchmarksForHistory } = vi.hoisted(() => ({
  mockGetAllBenchmarksForHistory: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => 'mock-sql',
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getAllBenchmarksForHistory: mockGetAllBenchmarksForHistory,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';

import { expandTrendHistory } from '@/components/inference/hooks/trend-history-rows';

import { GET } from './route';

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

const row = {
  id: 7,
  hardware: 'h200',
  framework: 'sglang',
  model: 'dsr1',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 0,
  decode_tp: 8,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 0,
  num_prefill_gpu: 8,
  num_decode_gpu: 8,
  benchmark_type: 'single_turn',
  isl: 1024,
  osl: 1024,
  conc: 4,
  offload_mode: 'off',
  image: null,
  recipe_fingerprint: null,
  metrics: { tput_per_gpu: 100, median_intvty: 30 },
  date: '2026-03-01',
  workflow_run_id: 11,
  run_started_at: '2026-03-01T00:00:00Z',
  run_url: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/benchmarks/history/trends', () => {
  it.each([
    '/api/v1/benchmarks/history/trends?isl=1024&osl=1024',
    '/api/v1/benchmarks/history/trends?model=DeepSeek-R1-0528&osl=1024',
    '/api/v1/benchmarks/history/trends?model=DeepSeek-R1-0528&isl=abc&osl=1024',
  ])('rejects %s like the published history route', async (url) => {
    const res = await GET(req(url));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('model, isl, and osl are required');
    expect(mockGetAllBenchmarksForHistory).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown model', async () => {
    const res = await GET(req('/api/v1/benchmarks/history/trends?model=Bad&isl=1024&osl=1024'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Unknown model');
  });

  it('serves the published fixed-sequence rows for the same query', async () => {
    mockGetAllBenchmarksForHistory.mockResolvedValueOnce([row]);
    const res = await GET(
      req('/api/v1/benchmarks/history/trends?model=DeepSeek-R1-0528&isl=1024&osl=8192'),
    );
    expect(res.status).toBe(200);
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith('mock-sql', ['dsr1'], 1024, 8192);
    const { workflow_run_id: _id, run_started_at: _startedAt, ...published } = row;
    expect(expandTrendHistory(await res.json())).toEqual([published]);
  });

  it('serves agentic history without sequence lengths', async () => {
    const agentic = { ...row, benchmark_type: 'agentic_traces', isl: null, osl: null };
    mockGetAllBenchmarksForHistory.mockResolvedValueOnce([agentic]);
    const res = await GET(
      req('/api/v1/benchmarks/history/trends?model=DeepSeek-R1-0528&benchmarkType=agentic_traces'),
    );
    expect(res.status).toBe(200);
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      null,
      null,
      'agentic_traces',
    );
    expect(expandTrendHistory(await res.json())).toEqual([
      { ...agentic, metrics: { tput_per_gpu: 100 } },
    ]);
  });

  it('returns 500 when the query throws', async () => {
    mockGetAllBenchmarksForHistory.mockRejectedValueOnce(new Error('db down'));
    const res = await GET(
      req('/api/v1/benchmarks/history/trends?model=DeepSeek-R1-0528&isl=1024&osl=1024'),
    );
    expect(res.status).toBe(500);
  });
});

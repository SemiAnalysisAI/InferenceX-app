import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetLatestBenchmarks, mockGetDb } = vi.hoisted(() => ({
  mockGetLatestBenchmarks: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  JSON_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getLatestBenchmarks: mockGetLatestBenchmarks,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: Function) => fn,
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
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith('mock-sql', 'dsr1', undefined, undefined);
  });

  it('passes date param to query when provided', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(req('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-03-01'));
    expect(res.status).toBe(200);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      'dsr1',
      '2026-03-01',
      undefined,
    );
  });

  it('passes exact=true when query param set', async () => {
    mockGetLatestBenchmarks.mockResolvedValueOnce([]);

    const res = await GET(
      req('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-03-01&exact=true'),
    );
    expect(res.status).toBe(200);
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith('mock-sql', 'dsr1', '2026-03-01', true);
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

import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetAllBenchmarksForHistory, mockGetDb } = vi.hoisted(() => ({
  mockGetAllBenchmarksForHistory: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getAllBenchmarksForHistory: mockGetAllBenchmarksForHistory,
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

describe('GET /api/v1/benchmarks/history', () => {
  it('returns 400 when model is missing', async () => {
    const res = await GET(req('/api/v1/benchmarks/history?isl=1024&osl=1024'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('model, isl, and osl are required');
  });

  it('returns 400 when isl is missing', async () => {
    const res = await GET(req('/api/v1/benchmarks/history?model=DeepSeek-R1-0528&osl=1024'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('model, isl, and osl are required');
  });

  it('returns 400 when osl is missing', async () => {
    const res = await GET(req('/api/v1/benchmarks/history?model=DeepSeek-R1-0528&isl=1024'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('model, isl, and osl are required');
  });

  it('returns 400 when isl is not a valid number', async () => {
    const res = await GET(
      req('/api/v1/benchmarks/history?model=DeepSeek-R1-0528&isl=abc&osl=1024'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('model, isl, and osl are required');
  });

  it('returns 400 for unknown model', async () => {
    const res = await GET(req('/api/v1/benchmarks/history?model=BadModel&isl=1024&osl=1024'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Unknown model');
  });

  it('returns history data for valid params', async () => {
    const mockRows = [{ date: '2026-03-01', tput: 100 }];
    mockGetAllBenchmarksForHistory.mockResolvedValueOnce(mockRows);

    const res = await GET(
      req('/api/v1/benchmarks/history?model=DeepSeek-R1-0528&isl=1024&osl=1024'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockRows);
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith('mock-sql', 'dsr1', 1024, 1024);
  });

  it('returns 500 when query throws', async () => {
    mockGetAllBenchmarksForHistory.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET(
      req('/api/v1/benchmarks/history?model=DeepSeek-R1-0528&isl=1024&osl=1024'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('returns empty array when no history found', async () => {
    mockGetAllBenchmarksForHistory.mockResolvedValueOnce([]);

    const res = await GET(
      req('/api/v1/benchmarks/history?model=DeepSeek-R1-0528&isl=1024&osl=8192'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith('mock-sql', 'dsr1', 1024, 8192);
  });
});

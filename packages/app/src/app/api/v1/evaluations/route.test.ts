import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetAllEvalResults, mockGetDb } = vi.hoisted(() => ({
  mockGetAllEvalResults: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
}));

vi.mock('@semianalysisai/inferencex-db/queries/evaluations', () => ({
  getAllEvalResults: mockGetAllEvalResults,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: Function) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/evaluations', () => {
  it('returns evaluation data', async () => {
    const mockRows = [
      { model: 'dsr1', benchmark: 'mmlu', score: 0.95 },
      { model: 'llama70b', benchmark: 'mmlu', score: 0.88 },
    ];
    mockGetAllEvalResults.mockResolvedValueOnce(mockRows);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockRows);
    expect(mockGetAllEvalResults).toHaveBeenCalledWith('mock-sql');
  });

  it('returns empty array when no evaluations', async () => {
    mockGetAllEvalResults.mockResolvedValueOnce([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns 500 when query throws', async () => {
    mockGetAllEvalResults.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

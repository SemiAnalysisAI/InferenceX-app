import { describe, expect, it, vi, beforeEach, mock } from 'bun:test';

const { mockGetAllEvalResults, mockGetDb } = {
  mockGetAllEvalResults: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
};

mock.module('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

mock.module('@semianalysisai/inferencex-db/queries/evaluations', () => ({
  getAllEvalResults: mockGetAllEvalResults,
}));

mock.module('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

// Imported after mock.module so the route builds its reader from the mocked cachedQuery.
const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/evaluations', () => {
  it('returns empty array when no evaluations', async () => {
    mockGetAllEvalResults.mockResolvedValueOnce([]);

    const res = await GET(new Request('https://example.test/api/v1/evaluations'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns 500 when query throws', async () => {
    mockGetAllEvalResults.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await GET(new Request('https://example.test/api/v1/evaluations'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

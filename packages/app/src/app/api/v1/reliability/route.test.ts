import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetReliabilityStats, mockGetDb } = vi.hoisted(() => ({
  mockGetReliabilityStats: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/reliability', () => ({
  getReliabilityStats: mockGetReliabilityStats,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/reliability', () => {
  it('returns empty array when no data', async () => {
    mockGetReliabilityStats.mockResolvedValueOnce([]);

    const res = await GET(new Request('https://example.test/api/v1/reliability'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns 500 when query throws', async () => {
    mockGetReliabilityStats.mockRejectedValueOnce(new Error('DB unreachable'));

    const res = await GET(new Request('https://example.test/api/v1/reliability'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

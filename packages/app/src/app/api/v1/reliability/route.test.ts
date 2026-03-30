import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetReliabilityStats, mockGetDb } = vi.hoisted(() => ({
  mockGetReliabilityStats: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  JSON_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/reliability', () => ({
  getReliabilityStats: mockGetReliabilityStats,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: Function) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/reliability', () => {
  it('returns reliability data', async () => {
    const mockRows = [
      { provider: 'fireworks', model: 'dsr1', success_rate: 0.99, total_requests: 1000 },
    ];
    mockGetReliabilityStats.mockResolvedValueOnce(mockRows);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockRows);
    expect(mockGetReliabilityStats).toHaveBeenCalledWith('mock-sql');
  });

  it('returns empty array when no data', async () => {
    mockGetReliabilityStats.mockResolvedValueOnce([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns 500 when query throws', async () => {
    mockGetReliabilityStats.mockRejectedValueOnce(new Error('DB unreachable'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

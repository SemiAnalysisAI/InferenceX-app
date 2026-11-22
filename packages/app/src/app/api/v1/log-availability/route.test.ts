import { beforeEach, describe, expect, it, vi, mock } from 'bun:test';

const { mockGetBenchmarkPresence, mockGetDb } = {
  mockGetBenchmarkPresence: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
};

mock.module('@semianalysisai/inferencex-db/connection', () => ({ getDb: mockGetDb }));
// The factory cannot import the module it replaces, so the real exports are captured first.
const actual = { ...(await import('@semianalysisai/inferencex-db/queries/benchmark-presence')) };
mock.module('@semianalysisai/inferencex-db/queries/benchmark-presence', () => ({
  ...actual,
  getBenchmarkPresence: mockGetBenchmarkPresence,
}));
mock.module('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';
// Imported after mock.module so the presence reader is built from the mocked cachedQuery.
const { GET } = await import('./route');

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/log-availability', () => {
  it('returns a presence map for valid, deduplicated ids', async () => {
    mockGetBenchmarkPresence.mockResolvedValueOnce({ trace: [9, 1], log: [4, 2] });
    const response = await GET(req('/api/v1/log-availability?ids=9,4,4'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ 4: true });
    expect(mockGetBenchmarkPresence).toHaveBeenCalledWith('mock-sql');
  });

  it('returns 400 when no valid ids are provided', async () => {
    const response = await GET(req('/api/v1/log-availability?ids=bad,0'));
    expect(response.status).toBe(400);
    expect(mockGetBenchmarkPresence).not.toHaveBeenCalled();
  });
});

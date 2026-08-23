import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetServerLogAvailability, mockGetDb } = vi.hoisted(() => ({
  mockGetServerLogAvailability: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: mockGetDb }));
vi.mock('@semianalysisai/inferencex-db/queries/server-logs', () => ({
  getServerLogAvailability: mockGetServerLogAvailability,
}));
vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/log-availability', () => {
  it('returns a presence map for valid, deduplicated ids', async () => {
    mockGetServerLogAvailability.mockResolvedValueOnce({ 4: true });
    const response = await GET(req('/api/v1/log-availability?ids=9,4,4'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ 4: true });
    expect(mockGetServerLogAvailability).toHaveBeenCalledWith('mock-sql', [4, 9]);
  });

  it('returns 400 when no valid ids are provided', async () => {
    const response = await GET(req('/api/v1/log-availability?ids=bad,0'));
    expect(response.status).toBe(400);
    expect(mockGetServerLogAvailability).not.toHaveBeenCalled();
  });
});

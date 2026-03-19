import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetCacheVersion } = vi.hoisted(() => ({
  mockGetCacheVersion: vi.fn(),
}));

vi.mock('@/lib/api-cache', () => ({
  getCacheVersion: mockGetCacheVersion,
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/cache-version', () => {
  it('returns current cache version', async () => {
    mockGetCacheVersion.mockResolvedValueOnce('2026-03-01T12:00:00.000Z');

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ v: '2026-03-01T12:00:00.000Z' });
  });

  it('returns empty string when no version set', async () => {
    mockGetCacheVersion.mockResolvedValueOnce('');

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ v: '' });
  });
});

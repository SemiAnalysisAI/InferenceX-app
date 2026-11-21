import { describe, expect, it, vi, beforeEach, mock } from 'bun:test';

const { mockGetConversation, mockGetDb } = {
  mockGetConversation: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
};

mock.module('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

mock.module('@semianalysisai/inferencex-db/queries/datasets', () => ({
  getConversation: mockGetConversation,
}));

mock.module('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';

// Imported after mock.module so the route builds its reader from the mocked cachedQuery.
const { GET } = await import('./route');

function req(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/datasets/ds/conversations/x'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConversation.mockResolvedValue({ conv_id: 'x', turns: [] });
});

describe('GET /api/v1/datasets/[slug]/conversations/[convId] — decode exactly once', () => {
  it('passes the already-decoded convId straight through (no second decode)', async () => {
    const params = Promise.resolve({ slug: 'ds', convId: 'a/b%c' });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(mockGetConversation).toHaveBeenCalledWith('mock-sql', 'ds', 'a/b%c');
  });

  it('preserves special characters (% / # ?) exactly as decoded by App Router', async () => {
    const raw = 'conv/50%_a#b?c';
    const params = Promise.resolve({ slug: 'ds', convId: raw });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(mockGetConversation).toHaveBeenCalledWith('mock-sql', 'ds', raw);
  });

  it('returns 404 when the conversation is not found', async () => {
    mockGetConversation.mockResolvedValueOnce(null);
    const params = Promise.resolve({ slug: 'ds', convId: 'missing' });
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });
});

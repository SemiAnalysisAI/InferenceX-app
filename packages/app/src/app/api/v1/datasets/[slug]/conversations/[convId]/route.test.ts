import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetConversation, mockGetDb } = vi.hoisted(() => ({
  mockGetConversation: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  JSON_MODE: false,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/datasets', () => ({
  getConversation: mockGetConversation,
}));

vi.mock('@semianalysisai/inferencex-db/json-provider', () => ({
  getConversation: vi.fn(),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function req(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/datasets/ds/conversations/x'));
}

/**
 * App Router decodes each dynamic route segment EXACTLY ONCE before handing it to
 * the handler, so `params.convId` is already the raw conversation id. These tests
 * pin the route's contract: it must pass that value straight to the query with NO
 * further decodeURIComponent (which would over-decode, mis-key '%'/'/' ids, or
 * throw on a lone '%'). The client (useDatasetConversation) encodeURIComponent's
 * the id before the fetch, so the whole pipeline decodes once end-to-end.
 */
beforeEach(() => {
  vi.clearAllMocks();
  mockGetConversation.mockResolvedValue({ conv_id: 'x', turns: [] });
});

describe('GET /api/v1/datasets/[slug]/conversations/[convId] — decode exactly once', () => {
  it('passes the already-decoded convId straight through (no second decode)', async () => {
    const params = Promise.resolve({ slug: 'ds', convId: 'a/b%c' });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    // 'a/b%c' contains a lone '%'; a second decodeURIComponent here would THROW
    // (→ 500). Passing through means the query sees the raw id verbatim.
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

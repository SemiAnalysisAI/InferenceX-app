import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockListConversations, mockGetDb } = vi.hoisted(() => ({
  mockListConversations: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  JSON_MODE: false,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/datasets', () => ({
  listConversations: mockListConversations,
}));

vi.mock('@semianalysisai/inferencex-db/json-provider', () => ({
  listConversations: vi.fn(),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

const PARAMS = Promise.resolve({ slug: 'test-dataset' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/datasets/[slug]/conversations — search input validation', () => {
  it('returns 400 when search exceeds 100 characters', async () => {
    const longSearch = 'a'.repeat(101);
    const res = await GET(req(`/api/v1/datasets/test-dataset/conversations?search=${longSearch}`), {
      params: PARAMS,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('search too long');
    // DB must not be called.
    expect(mockListConversations).not.toHaveBeenCalled();
  });

  it('accepts a search string exactly at the 100-character limit', async () => {
    const exactSearch = 'a'.repeat(100);
    mockListConversations.mockResolvedValueOnce({ total: 0, items: [] });
    const res = await GET(
      req(`/api/v1/datasets/test-dataset/conversations?search=${exactSearch}`),
      { params: PARAMS },
    );
    expect(res.status).toBe(200);
  });

  it('trims whitespace before applying the length check', async () => {
    // A 101-char string that is 100 chars of spaces + 1 real char should become
    // 1 char after trimming — well under the limit.
    const paddedSearch = `${' '.repeat(100)}a`;
    mockListConversations.mockResolvedValueOnce({ total: 1, items: [] });
    const res = await GET(
      req(`/api/v1/datasets/test-dataset/conversations?search=${paddedSearch}`),
      { params: PARAMS },
    );
    expect(res.status).toBe(200);
    expect(mockListConversations).toHaveBeenCalledWith(
      'mock-sql',
      'test-dataset',
      expect.objectContaining({ search: 'a' }),
    );
  });

  it('returns 404 when the dataset slug is unknown', async () => {
    mockListConversations.mockResolvedValueOnce(null);
    const res = await GET(req('/api/v1/datasets/test-dataset/conversations'), {
      params: PARAMS,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('returns conversation data for a valid request', async () => {
    const mockData = { total: 2, items: [{ conv_id: 'c1' }, { conv_id: 'c2' }] };
    mockListConversations.mockResolvedValueOnce(mockData);
    const res = await GET(
      req('/api/v1/datasets/test-dataset/conversations?search=agent&sort=turns&limit=10&offset=0'),
      { params: PARAMS },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockData);
    expect(mockListConversations).toHaveBeenCalledWith(
      'mock-sql',
      'test-dataset',
      expect.objectContaining({ search: 'agent', sort: 'turns', limit: 10, offset: 0 }),
    );
  });

  it('returns 500 when the query throws', async () => {
    mockListConversations.mockRejectedValueOnce(new Error('Neon timeout'));
    const res = await GET(req('/api/v1/datasets/test-dataset/conversations'), {
      params: PARAMS,
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});

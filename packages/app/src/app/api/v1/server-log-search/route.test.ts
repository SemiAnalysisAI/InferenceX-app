import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSearchServerLogs, mockGetDb } = vi.hoisted(() => ({
  mockSearchServerLogs: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/server-logs', () => ({
  searchServerLogs: mockSearchServerLogs,
  ServerLogSearchTimeoutError: class ServerLogSearchTimeoutError extends Error {
    constructor() {
      super('Server log search exceeded its time budget');
      this.name = 'ServerLogSearchTimeoutError';
    }
  },
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';
import { ServerLogSearchTimeoutError } from '@semianalysisai/inferencex-db/queries/server-logs';
import { GET } from './route';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/server-log-search', () => {
  it('searches complete stored logs with a bounded result count', async () => {
    mockSearchServerLogs.mockResolvedValueOnce({
      matches: [
        {
          fileName: 'results/router.log',
          offset: 12,
          before: 'router ',
          match: 'ready',
          after: '\n',
        },
      ],
      truncated: false,
    });

    const response = await GET(req('/api/v1/server-log-search?id=42&q=ready&limit=20'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 42,
      query: 'ready',
      matches: [
        {
          fileName: 'results/router.log',
          offset: 12,
          before: 'router ',
          match: 'ready',
          after: '\n',
        },
      ],
      truncated: false,
    });
    expect(mockSearchServerLogs).toHaveBeenCalledWith('mock-sql', 42, 'ready', 20);
  });

  it.each([
    '/api/v1/server-log-search?q=ready',
    '/api/v1/server-log-search?id=42&q=',
    `/api/v1/server-log-search?id=42&q=${'x'.repeat(257)}`,
    '/api/v1/server-log-search?id=42&q=ready&limit=0',
    '/api/v1/server-log-search?id=42&q=ready&limit=101',
  ])('rejects invalid search request %s', async (url) => {
    const response = await GET(req(url));
    expect(response.status).toBe(400);
    expect(mockSearchServerLogs).not.toHaveBeenCalled();
  });

  it('returns an uncached 504 when the search runs out of time', async () => {
    mockSearchServerLogs.mockRejectedValueOnce(new ServerLogSearchTimeoutError());
    const response = await GET(req('/api/v1/server-log-search?id=42&q=ready'));
    expect(response.status).toBe(504);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Search timed out. Try a more specific term.',
    });
  });

  it('returns 500 when the database search fails', async () => {
    mockSearchServerLogs.mockRejectedValueOnce(new Error('Connection reset'));
    const response = await GET(req('/api/v1/server-log-search?id=42&q=ready'));
    expect(response.status).toBe(500);
  });
});

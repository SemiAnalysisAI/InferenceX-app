import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetBoundedServerLog, mockGetServerLogChunk, mockGetDb } = vi.hoisted(() => ({
  mockGetBoundedServerLog: vi.fn(),
  mockGetServerLogChunk: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/server-logs', () => ({
  getBoundedServerLog: mockGetBoundedServerLog,
  getServerLogChunk: mockGetServerLogChunk,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (
    _request: Request,
    data: unknown,
    options?: { cacheControl?: string; tag?: string },
  ) =>
    Response.json(data, {
      headers: {
        'Cache-Control': options?.cacheControl ?? 'default',
        'Vercel-Cache-Tag': options?.tag ?? 'db-cdn',
      },
    }),
  cdnHeaders: (tag: string, cacheControl: string) => ({
    'Cache-Control': cacheControl,
    'Vercel-Cache-Tag': tag,
    'X-Content-Type-Options': 'nosniff',
  }),
  serverLogCacheTag: () => 'db-log',
  SERVER_LOG_CACHE_CONTROL: 'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400',
}));

const LOG_CACHE = 'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400';
const MiB = 1024 * 1024;

function bounded(
  serverLog: string | null,
  bytes = serverLog?.length ?? 0,
  fileName = 'server.log',
) {
  return { fileName, bytes, serverLog };
}

import { GET } from './route';
import { NextRequest } from 'next/server';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/server-log', () => {
  it('returns 400 when id is missing', async () => {
    const res = await GET(req('/api/v1/server-log'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('id is required (benchmark_result_id)');
  });

  it('returns 400 when id is not a number', async () => {
    const res = await GET(req('/api/v1/server-log?id=abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('id is required (benchmark_result_id)');
  });

  it('returns 400 when id is zero', async () => {
    const res = await GET(req('/api/v1/server-log?id=0'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('id is required (benchmark_result_id)');
  });

  it('returns 404 when server log not found', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(null);

    const res = await GET(req('/api/v1/server-log?id=999'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('returns server log for valid id', async () => {
    const mockLog = 'Server started on port 8080\nModel loaded successfully';
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded(mockLog));

    const res = await GET(req('/api/v1/server-log?id=42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 42, serverLog: mockLog });
    expect(mockGetBoundedServerLog).toHaveBeenCalledWith('mock-sql', 42, 16 * MiB, undefined);
    expect(res.headers.get('cache-control')).toBe(LOG_CACHE);
    expect(res.headers.get('vercel-cache-tag')).toBe('db-log');
  });

  it('returns a cacheable 413 instead of reading a file over 16 MiB whole', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded(null, 951_652_286));

    const res = await GET(req('/api/v1/server-log?id=42'));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ bytes: 951_652_286, maxBytes: 16 * MiB });
    // Too large to download as well, so the hint must not suggest download=1.
    expect(body.error).toContain('offset and limit');
    expect(body.error).not.toContain('download=1');
    expect(res.headers.get('cache-control')).toBe(LOG_CACHE);
    expect(mockGetServerLogChunk).not.toHaveBeenCalled();
  });

  it('suggests download=1 for a file too large to read whole but small enough to download', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded(null, 20 * MiB));

    const res = await GET(req('/api/v1/server-log?id=42'));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('download=1'),
    });
  });

  it('returns a bounded chunk when offset or limit is provided', async () => {
    mockGetServerLogChunk.mockResolvedValueOnce({
      fileName: 'results/router.log',
      serverLog: 'INFO ready\n',
      offset: 65536,
      nextOffset: 65547,
    });

    const res = await GET(
      req('/api/v1/server-log?id=42&file=results%2Frouter.log&offset=65536&limit=1024'),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: 42,
      fileName: 'results/router.log',
      serverLog: 'INFO ready\n',
      offset: 65536,
      nextOffset: 65547,
    });
    expect(mockGetServerLogChunk).toHaveBeenCalledWith(
      'mock-sql',
      42,
      65536,
      1024,
      'results/router.log',
    );
    expect(mockGetBoundedServerLog).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe(LOG_CACHE);
    expect(res.headers.get('vercel-cache-tag')).toBe('db-log');
  });

  it('uses bounded defaults when only one chunk parameter is provided', async () => {
    mockGetServerLogChunk.mockResolvedValueOnce({
      fileName: 'server.log',
      serverLog: 'start',
      offset: 0,
      nextOffset: null,
    });

    const res = await GET(req('/api/v1/server-log?id=42&offset=0'));
    expect(res.status).toBe(200);
    expect(mockGetServerLogChunk).toHaveBeenCalledWith('mock-sql', 42, 0, 64 * 1024, undefined);
  });

  it('serves a small download from the single sizing query', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(
      bounded('INFO ready\n', 11, 'nested/router log.out'),
    );

    const res = await GET(
      req('/api/v1/server-log?id=42&file=nested%2Frouter%20log.out&download=1'),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-disposition')).toContain(
      'attachment; filename="router log.out"',
    );
    expect(res.headers.get('cache-control')).toBe(LOG_CACHE);
    expect(res.headers.get('vercel-cache-tag')).toBe('db-log');
    await expect(res.text()).resolves.toBe('INFO ready\n');
    expect(mockGetBoundedServerLog).toHaveBeenCalledWith(
      'mock-sql',
      42,
      8 * MiB,
      'nested/router log.out',
    );
    expect(mockGetServerLogChunk).not.toHaveBeenCalled();
  });

  it('streams a large download as a sequence of bounded 8 Mi-character reads', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded(null, 20 * MiB, 'results/server.log'));
    mockGetServerLogChunk
      .mockResolvedValueOnce({
        fileName: 'results/server.log',
        serverLog: 'INFO',
        offset: 0,
        nextOffset: 4,
      })
      .mockResolvedValueOnce({
        fileName: 'results/server.log',
        serverLog: ' ready\n',
        offset: 4,
        nextOffset: null,
      });

    const res = await GET(req('/api/v1/server-log?id=42&download=1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('filename="server.log"');
    await expect(res.text()).resolves.toBe('INFO ready\n');
    expect(mockGetServerLogChunk).toHaveBeenNthCalledWith(1, 'mock-sql', 42, 0, 8 * MiB, undefined);
    expect(mockGetServerLogChunk).toHaveBeenNthCalledWith(2, 'mock-sql', 42, 4, 8 * MiB, undefined);
  });

  it('refuses to stream a download over 512 MiB', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded(null, 951_652_286));

    const res = await GET(req('/api/v1/server-log?id=42&download=1'));

    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBeNull();
    await expect(res.text()).resolves.toContain('above the 536870912-byte download limit');
    expect(mockGetServerLogChunk).not.toHaveBeenCalled();
  });

  it('returns 404 for a download with no linked log', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(null);
    const res = await GET(req('/api/v1/server-log?id=42&download=1'));
    expect(res.status).toBe(404);
  });

  it.each(['download=0', 'download=yes', 'download=1&offset=0', 'download=1&limit=1'])(
    'returns 400 for invalid download parameters %s',
    async (query) => {
      const res = await GET(req(`/api/v1/server-log?id=42&${query}`));
      expect(res.status).toBe(400);
      expect(mockGetServerLogChunk).not.toHaveBeenCalled();
    },
  );

  it.each([
    'offset=-1',
    'offset=1.5',
    'offset=2000000001',
    'limit=0',
    'limit=262145',
    'limit=nope',
  ])('returns 400 for invalid chunk parameter %s', async (query) => {
    const res = await GET(req(`/api/v1/server-log?id=42&${query}`));
    expect(res.status).toBe(400);
    expect(mockGetServerLogChunk).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty filename', async () => {
    const res = await GET(req('/api/v1/server-log?id=42&file='));
    expect(res.status).toBe(400);
    expect(mockGetBoundedServerLog).not.toHaveBeenCalled();
  });

  it('returns a complete named log for compatibility clients', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded('router output', 13, 'router.log'));
    const res = await GET(req('/api/v1/server-log?id=42&file=router.log'));
    await expect(res.json()).resolves.toEqual({
      id: 42,
      fileName: 'router.log',
      serverLog: 'router output',
    });
    expect(mockGetBoundedServerLog).toHaveBeenCalledWith('mock-sql', 42, 16 * MiB, 'router.log');
  });

  it('returns 404 when a requested chunk has no linked log', async () => {
    mockGetServerLogChunk.mockResolvedValueOnce(null);
    const res = await GET(req('/api/v1/server-log?id=999&offset=0'));
    expect(res.status).toBe(404);
  });

  it('returns 500 when query throws', async () => {
    mockGetBoundedServerLog.mockRejectedValueOnce(new Error('Connection reset'));

    const res = await GET(req('/api/v1/server-log?id=42'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('handles large numeric id', async () => {
    mockGetBoundedServerLog.mockResolvedValueOnce(bounded('log data'));

    const res = await GET(req('/api/v1/server-log?id=1234567890'));
    expect(res.status).toBe(200);
    expect(mockGetBoundedServerLog).toHaveBeenCalledWith(
      'mock-sql',
      1234567890,
      16 * MiB,
      undefined,
    );
  });
});

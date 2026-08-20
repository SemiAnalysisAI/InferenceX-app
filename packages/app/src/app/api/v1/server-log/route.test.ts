import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetServerLog, mockGetServerLogChunk, mockGetDb } = vi.hoisted(() => ({
  mockGetServerLog: vi.fn(),
  mockGetServerLogChunk: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/server-logs', () => ({
  getServerLog: mockGetServerLog,
  getServerLogChunk: mockGetServerLogChunk,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

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
    mockGetServerLog.mockResolvedValueOnce(null);

    const res = await GET(req('/api/v1/server-log?id=999'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('returns server log for valid id', async () => {
    const mockLog = 'Server started on port 8080\nModel loaded successfully';
    mockGetServerLog.mockResolvedValueOnce(mockLog);

    const res = await GET(req('/api/v1/server-log?id=42'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 42, serverLog: mockLog });
    expect(mockGetServerLog).toHaveBeenCalledWith('mock-sql', 42);
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
    expect(mockGetServerLog).not.toHaveBeenCalled();
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
    expect(mockGetServerLog).not.toHaveBeenCalled();
  });

  it('returns a complete named log for compatibility clients', async () => {
    mockGetServerLog.mockResolvedValueOnce('router output');
    const res = await GET(req('/api/v1/server-log?id=42&file=router.log'));
    await expect(res.json()).resolves.toEqual({
      id: 42,
      fileName: 'router.log',
      serverLog: 'router output',
    });
    expect(mockGetServerLog).toHaveBeenCalledWith('mock-sql', 42, 'router.log');
  });

  it('returns 404 when a requested chunk has no linked log', async () => {
    mockGetServerLogChunk.mockResolvedValueOnce(null);
    const res = await GET(req('/api/v1/server-log?id=999&offset=0'));
    expect(res.status).toBe(404);
  });

  it('returns 500 when query throws', async () => {
    mockGetServerLog.mockRejectedValueOnce(new Error('Connection reset'));

    const res = await GET(req('/api/v1/server-log?id=42'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });

  it('handles large numeric id', async () => {
    mockGetServerLog.mockResolvedValueOnce('log data');

    const res = await GET(req('/api/v1/server-log?id=1234567890'));
    expect(res.status).toBe(200);
    expect(mockGetServerLog).toHaveBeenCalledWith('mock-sql', 1234567890);
  });
});

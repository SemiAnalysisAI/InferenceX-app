import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetServerLog, mockGetDb } = vi.hoisted(() => ({
  mockGetServerLog: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
}));

vi.mock('@semianalysisai/inferencex-db/queries/server-logs', () => ({
  getServerLog: mockGetServerLog,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: Function) => fn,
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

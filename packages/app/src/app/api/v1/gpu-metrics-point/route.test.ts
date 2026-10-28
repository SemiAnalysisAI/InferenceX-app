import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readRevision, readCached } = vi.hoisted(() => ({
  readRevision: vi.fn(),
  readCached: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics-revision', () => ({
  getGpuMetricsPointRevision: readRevision,
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForPoint: vi.fn(),
}));
vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: () => readCached,
  cachedJson: (_request: Request, data: unknown) =>
    Response.json(data, { headers: { 'Cache-Control': 'public, max-age=3600' } }),
}));

import { GET } from './route';

function request(id = '7') {
  return new NextRequest(`http://localhost/api/v1/gpu-metrics-point?id=${id}`);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/gpu-metrics-point', () => {
  it('returns an uncached 404 without reading the payload cache when no revision exists', async () => {
    readRevision.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(readCached).not.toHaveBeenCalled();
  });

  it('uses the current revision in every payload cache lookup and disables response caching', async () => {
    readRevision.mockResolvedValueOnce('before-ingest').mockResolvedValueOnce('after-ingest');
    readCached
      .mockResolvedValueOnce({ series: [{ id: 1 }] })
      .mockResolvedValueOnce({ series: [{ id: 2 }] });

    const before = await GET(request());
    const after = await GET(request());

    expect(readRevision).toHaveBeenCalledTimes(2);
    expect(readRevision).toHaveBeenCalledWith({}, 7);
    expect(readCached).toHaveBeenNthCalledWith(1, 7, 'before-ingest');
    expect(readCached).toHaveBeenNthCalledWith(2, 7, 'after-ingest');
    expect(await before.json()).toEqual({ series: [{ id: 1 }] });
    expect(await after.json()).toEqual({ series: [{ id: 2 }] });
    expect(before.headers.get('Cache-Control')).toBe('no-store');
    expect(after.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns no-store for invalid ids without querying revisions', async () => {
    const response = await GET(request('1.5'));
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(readRevision).not.toHaveBeenCalled();
    expect(readCached).not.toHaveBeenCalled();
  });

  it('returns no-store when a revision lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    readRevision.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(readCached).not.toHaveBeenCalled();
  });
});

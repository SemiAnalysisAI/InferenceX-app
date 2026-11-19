import { brotliDecompressSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiCache from '@/lib/cache/api-cache';

const { readRevision, readCached, fixtures } = vi.hoisted(() => ({
  readRevision: vi.fn(),
  readCached: vi.fn(),
  fixtures: { mode: false },
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => ({}),
  get FIXTURES_MODE() {
    return fixtures.mode;
  },
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics-revision', () => ({
  getGpuMetricsPointRevision: readRevision,
}));
vi.mock('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForPoint: vi.fn(),
}));
vi.mock('@/lib/cache/api-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiCache>()),
  cachedQuery: () => readCached,
}));

import { GET } from './route';

function request(id = '7', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/v1/gpu-metrics-point?id=${id}`, { headers });
}

const payload = {
  benchmarkResultId: 7,
  series: [{ id: 1, artifactName: 'gpu_metrics_b200', data: [{ index: 0, power: 512.5 }] }],
};

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
    expect(response.headers.get('ETag')).toBeNull();
    expect(readCached).not.toHaveBeenCalled();
  });

  it('uses the current revision in every payload cache lookup and makes browsers revalidate', async () => {
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
    expect(before.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(after.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(before.headers.get('ETag')).not.toBe(after.headers.get('ETag'));
  });

  it('sends the serialized payload bytes unchanged for every encoding', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    const expected = JSON.stringify(payload);

    const identity = await GET(request());
    expect(identity.headers.get('Content-Encoding')).toBeNull();
    expect(identity.headers.get('Content-Type')).toBe('application/json');
    expect(await identity.text()).toBe(expected);

    const br = await GET(request('7', { 'Accept-Encoding': 'gzip, br' }));
    expect(br.headers.get('Content-Encoding')).toBe('br');
    expect(br.headers.get('Vary')).toBe('Accept-Encoding');
    const compressed = Buffer.from(await br.arrayBuffer());
    expect(brotliDecompressSync(compressed).toString('utf8')).toBe(expected);
  });

  it('answers a held revision with a bodiless 304 before loading the payload', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    const first = await GET(request('7', { 'Accept-Encoding': 'br' }));
    const etag = first.headers.get('ETag')!;
    expect(etag).toMatch(/^"[\w-]+-br"$/u);
    expect(readCached).toHaveBeenCalledTimes(1);

    const revalidated = await GET(request('7', { 'Accept-Encoding': 'br', 'If-None-Match': etag }));

    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe('');
    expect(revalidated.headers.get('ETag')).toBe(etag);
    expect(revalidated.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(revalidated.headers.get('Vary')).toBe('Accept-Encoding');
    expect(readRevision).toHaveBeenCalledTimes(2);
    expect(readCached).toHaveBeenCalledTimes(1);
  });

  it('sends the new payload with a new ETag once the revision changes', async () => {
    readRevision.mockResolvedValueOnce('before-ingest').mockResolvedValueOnce('after-ingest');
    const reingested = { ...payload, series: [{ ...payload.series[0], id: 2 }] };
    readCached.mockResolvedValueOnce(payload).mockResolvedValueOnce(reingested);
    const first = await GET(request());
    const etag = first.headers.get('ETag')!;

    const response = await GET(request('7', { 'If-None-Match': etag }));

    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).not.toBe(etag);
    expect(readCached).toHaveBeenLastCalledWith(7, 'after-ingest');
    expect(await response.text()).toBe(JSON.stringify(reingested));
  });

  it('does not let a validator answer for another point or encoding', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    const first = await GET(request('7', { 'Accept-Encoding': 'br' }));
    const etag = first.headers.get('ETag')!;

    const otherPoint = await GET(request('8', { 'Accept-Encoding': 'br', 'If-None-Match': etag }));
    const otherEncoding = await GET(
      request('7', { 'Accept-Encoding': 'gzip', 'If-None-Match': etag }),
    );

    expect(otherPoint.status).toBe(200);
    expect(otherEncoding.status).toBe(200);
    expect(otherEncoding.headers.get('Content-Encoding')).toBe('gzip');
    expect(readCached).toHaveBeenCalledTimes(3);
  });

  it('returns an uncached 404 when the series are unlinked after the revision read', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps fixture responses out of the browser cache', async () => {
    fixtures.mode = true;
    try {
      readRevision.mockResolvedValue('rev-1');
      readCached.mockResolvedValue(payload);
      const response = await GET(request());
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      fixtures.mode = false;
    }
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

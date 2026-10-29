import { brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: any[]) => any, _keys: string[], _opts: unknown) => fn),
}));

const workStore = vi.hoisted(() => ({
  current: undefined as { isStaticGeneration: boolean } | undefined,
}));
vi.mock('next/dist/server/app-render/work-async-storage.external', () => ({
  workAsyncStorage: { getStore: () => workStore.current },
}));

const fixtures = vi.hoisted(() => ({ mode: false }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  get FIXTURES_MODE() {
    return fixtures.mode;
  },
}));

vi.mock('./blob-cache', () => ({
  blobGet: vi.fn(),
  blobSet: vi.fn(),
  blobPurge: vi.fn(),
}));

import {
  cachedQuery,
  purgeAll,
  purgeCollectiveX,
  cachedJson,
  cachedGzipJson,
  negotiateEncoding,
} from './api-cache';
import { revalidateTag, unstable_cache } from 'next/cache';
import { blobGet, blobSet, blobPurge } from './blob-cache';

const mockRevalidateTag = vi.mocked(revalidateTag);
const mockUnstableCache = vi.mocked(unstable_cache);
const mockBlobGet = vi.mocked(blobGet);
const mockBlobSet = vi.mocked(blobSet);
const mockBlobPurge = vi.mocked(blobPurge);
const originalCacheNamespace = process.env.CACHE_NAMESPACE;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CACHE_NAMESPACE;
  workStore.current = undefined;
  mockUnstableCache.mockImplementation((fn: (...args: any[]) => any) => fn as any);
});

afterAll(() => {
  if (originalCacheNamespace === undefined) {
    delete process.env.CACHE_NAMESPACE;
  } else {
    process.env.CACHE_NAMESPACE = originalCacheNamespace;
  }
});

describe('cachedQuery', () => {
  describe('default mode (unstable_cache)', () => {
    it('wraps the function with unstable_cache', () => {
      const fn = vi.fn((x: number) => Promise.resolve(x * 2));
      cachedQuery(fn, 'test-key');

      expect(mockUnstableCache).toHaveBeenCalledWith(fn, ['test-key'], { tags: ['db'] });
    });

    it('isolates the key and tag when CACHE_NAMESPACE is set', () => {
      process.env.CACHE_NAMESPACE = 'staging';
      const fn = vi.fn(() => Promise.resolve('data'));

      cachedQuery(fn, 'test-key');

      expect(mockUnstableCache).toHaveBeenCalledWith(fn, ['staging:test-key'], {
        tags: ['db:staging'],
      });
    });

    it('calls through to the original function and returns its result', async () => {
      const fn = vi.fn((x: number) => Promise.resolve(x * 2));
      const wrapped = cachedQuery(fn, 'multiply');

      const result = await wrapped(5);
      expect(result).toBe(10);
      expect(fn).toHaveBeenCalledWith(5);
    });

    it('passes arguments through to the cached function', async () => {
      const fn = vi.fn((a: string, b: string) => Promise.resolve(`${a}-${b}`));
      const wrapped = cachedQuery(fn, 'concat');

      const result = await wrapped('hello', 'world');
      expect(result).toBe('hello-world');
      expect(fn).toHaveBeenCalledWith('hello', 'world');
    });

    it('does not call blob functions in default mode', async () => {
      const fn = vi.fn(() => Promise.resolve('data'));
      const wrapped = cachedQuery(fn, 'no-blob');

      await wrapped();
      expect(mockBlobGet).not.toHaveBeenCalled();
      expect(mockBlobSet).not.toHaveBeenCalled();
    });

    it('reads a separate page-tagged entry while an ISR page regenerates', async () => {
      const routeFn = vi.fn(() => Promise.resolve('route'));
      const pageFn = vi.fn(() => Promise.resolve('page'));
      // The mock returns plain stand-ins for unstable_cache's wrapped function.
      mockUnstableCache.mockImplementation(((_fn: unknown, keys: string[]) =>
        keys[0].startsWith('page:') ? pageFn : routeFn) as unknown as typeof unstable_cache);
      const fn = vi.fn(() => Promise.resolve('data'));
      const wrapped = cachedQuery(fn, 'split');

      expect(mockUnstableCache).toHaveBeenCalledWith(fn, ['split'], { tags: ['db'] });
      expect(mockUnstableCache).toHaveBeenCalledWith(fn, ['page:split'], { tags: ['db-page'] });
      await expect(wrapped()).resolves.toBe('route');
      workStore.current = { isStaticGeneration: true };
      await expect(wrapped()).resolves.toBe('page');
      workStore.current = { isStaticGeneration: false };
      await expect(wrapped()).resolves.toBe('route');
    });

    it('uses only the custom tag when one is passed', () => {
      const fn = vi.fn(() => Promise.resolve('data'));
      cachedQuery(fn, 'custom', { tag: 'collectivex' });

      expect(mockUnstableCache).toHaveBeenCalledExactlyOnceWith(fn, ['custom'], {
        tags: ['collectivex'],
      });
    });
  });

  describe('blobOnly mode', () => {
    it('returns cached value from blob on hit', async () => {
      mockBlobGet.mockResolvedValue({ answer: 42 });
      const fn = vi.fn(() => Promise.resolve({ answer: 99 }));
      const wrapped = cachedQuery(fn, 'blob-key', { blobOnly: true });

      const result = await wrapped();
      expect(result).toEqual({ answer: 42 });
      expect(mockBlobGet).toHaveBeenCalledWith(expect.stringMatching(/^blob-key:v2:/u));
      expect(fn).not.toHaveBeenCalled();
      expect(mockBlobSet).not.toHaveBeenCalled();
    });

    it('calls fn and stores result on blob miss', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn(() => Promise.resolve({ big: 'payload' }));
      const wrapped = cachedQuery(fn, 'miss-key', { blobOnly: true });

      const result = await wrapped();
      expect(result).toEqual({ big: 'payload' });
      expect(fn).toHaveBeenCalled();
      expect(mockBlobSet).toHaveBeenCalledWith(expect.stringMatching(/^miss-key:v2:/u), {
        big: 'payload',
      });
    });

    it('builds blob key from prefix and args', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn((model: string, date: string) => Promise.resolve([model, date]));
      const wrapped = cachedQuery(fn, 'bench', { blobOnly: true });

      await wrapped('llama', '2025-01-01');
      const key = mockBlobGet.mock.calls[0]![0];
      expect(key).toMatch(/^bench:v2:[A-Za-z0-9_-]+$/u);
      expect(mockBlobSet).toHaveBeenCalledWith(key, ['llama', '2025-01-01']);
    });

    it('hashes oversized argument lists into a bounded deterministic key', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn((ids: number[]) => Promise.resolve(ids.length));
      const wrapped = cachedQuery(fn, 'derived-agentic-metrics-v7', { blobOnly: true });
      const ids = Array.from({ length: 200 }, (_, index) => 434_388 + index);

      await wrapped(ids);
      await wrapped(ids);

      const firstKey = mockBlobGet.mock.calls[0]![0];
      const secondKey = mockBlobGet.mock.calls[1]![0];
      expect(firstKey).toBe(secondKey);
      expect(firstKey).toMatch(/^derived-agentic-metrics-v7:v2:sha256:[a-f0-9]{64}$/u);
      expect(firstKey.length).toBeLessThan(128);
      expect(mockBlobSet).toHaveBeenCalledWith(firstKey, 200);
    });

    it('cannot collide arrays, objects, null, and undefined that stringify similarly', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const wrapped = cachedQuery((value: unknown) => Promise.resolve(value), 'structured', {
        blobOnly: true,
      });

      await wrapped(['a:b']);
      await wrapped(['a', 'b']);
      await wrapped({ value: null });
      await wrapped({ value: undefined });

      expect(new Set(mockBlobGet.mock.calls.map(([key]) => key)).size).toBe(4);
    });

    it('serializes object properties deterministically', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const wrapped = cachedQuery((value: unknown) => Promise.resolve(value), 'structured', {
        blobOnly: true,
      });

      await wrapped({ b: 2, a: 1 });
      await wrapped({ a: 1, b: 2 });

      expect(mockBlobGet.mock.calls[0]![0]).toBe(mockBlobGet.mock.calls[1]![0]);
    });

    it('rejects non-plain structured arguments instead of assigning a colliding key', async () => {
      const wrapped = cachedQuery((value: unknown) => Promise.resolve(value), 'structured', {
        blobOnly: true,
      });

      await expect(wrapped(new Date('2026-08-20T00:00:00Z'))).rejects.toThrow(
        'Blob cache arguments must contain only arrays and plain objects',
      );
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it('serves a successful query result when the blob write fails', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockRejectedValue(new Error('pathname is too long'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fn = vi.fn((_ids: number[]) => Promise.resolve({ answer: 42 }));
      const wrapped = cachedQuery(fn, 'derived-agentic-metrics-v7', { blobOnly: true });

      await expect(wrapped([1, 2, 3])).resolves.toEqual({ answer: 42 });
      expect(warn).toHaveBeenCalledWith(
        '[blob cache] could not persist derived-agentic-metrics-v7; serving uncached result. pathname is too long',
      );

      warn.mockRestore();
    });

    it('versions keys even when no arguments are passed', async () => {
      mockBlobGet.mockResolvedValue('cached');
      const fn = vi.fn(() => Promise.resolve('fresh'));
      const wrapped = cachedQuery(fn, 'no-args', { blobOnly: true });

      await wrapped();
      expect(mockBlobGet).toHaveBeenCalledWith(expect.stringMatching(/^no-args:v2:/u));
    });

    it('does not use unstable_cache in blobOnly mode', () => {
      const fn = vi.fn(() => Promise.resolve(null));
      cachedQuery(fn, 'skip-uc', { blobOnly: true });

      expect(mockUnstableCache).not.toHaveBeenCalled();
    });
  });
});

describe('purgeAll', () => {
  it('expires route data now but only marks page data and CDN responses stale', async () => {
    mockBlobPurge.mockResolvedValue(15);

    const deleted = await purgeAll();

    expect(deleted).toBe(15);
    expect(mockBlobPurge).toHaveBeenCalled();
    // The CDN's background refresh must read fresh data, never a stale server entry.
    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-page', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-cdn', 'max');
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('db-cdn', { expire: 0 });
  });

  it('drops every layer outright when asked to purge immediately', async () => {
    mockBlobPurge.mockResolvedValue(0);

    await purgeAll({ immediate: true });

    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-page', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-cdn', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('collectivex', { expire: 0 });
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(expect.anything(), 'max');
  });

  it('marks the CollectiveX tag stale too — the blob purge removed its entries', async () => {
    mockBlobPurge.mockResolvedValue(1);

    await purgeAll();

    expect(mockRevalidateTag).toHaveBeenCalledWith('collectivex', 'max');
  });

  it('keeps the OperatorX CDN tag and Blob subtree — results ingests do not change OperatorX', async () => {
    mockBlobPurge.mockResolvedValue(0);

    await purgeAll();

    expect(mockBlobPurge).toHaveBeenCalledWith('', ['operatorx/']);
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('operatorx', expect.anything());
  });

  it('returns 0 when no blobs were deleted', async () => {
    mockBlobPurge.mockResolvedValue(0);

    const deleted = await purgeAll();
    expect(deleted).toBe(0);
  });

  it('invalidates only the configured cache namespace', async () => {
    process.env.CACHE_NAMESPACE = 'staging';
    mockBlobPurge.mockResolvedValue(0);

    await purgeAll();

    expect(mockRevalidateTag).toHaveBeenCalledWith('db:staging', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-page:staging', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('db-cdn:staging', 'max');
  });
});

describe('purgeCollectiveX', () => {
  it('marks only the collectivex tag stale — no blobs belong to that scope', () => {
    purgeCollectiveX();

    expect(mockBlobPurge).not.toHaveBeenCalled();
    expect(mockRevalidateTag).toHaveBeenCalledExactlyOnceWith('collectivex', 'max');
  });

  it('drops the CDN entries outright when asked to purge immediately', () => {
    purgeCollectiveX({ immediate: true });

    expect(mockRevalidateTag).toHaveBeenCalledExactlyOnceWith('collectivex', { expire: 0 });
  });
});

function apiRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/v1/benchmarks', { headers });
}

async function bodyText(response: Response): Promise<string> {
  const bytes = Buffer.from(await response.arrayBuffer());
  const encoding = response.headers.get('Content-Encoding');
  if (encoding === 'br') return brotliDecompressSync(bytes).toString();
  if (encoding === 'gzip') return gunzipSync(bytes).toString();
  return bytes.toString();
}

describe('negotiateEncoding', () => {
  it.each([
    [null, 'identity'],
    ['', 'identity'],
    ['identity', 'identity'],
    ['gzip', 'gzip'],
    ['x-gzip', 'gzip'],
    ['gzip, deflate, br, zstd', 'br'],
    ['GZIP, BR', 'br'],
    ['br;q=0.5, gzip', 'gzip'],
    ['br;q=0, gzip;q=0', 'identity'],
    ['deflate', 'identity'],
    ['*', 'br'],
    ['gzip;q=0.4, *;q=0.5', 'br'],
    ['*;q=0, gzip', 'gzip'],
  ] as const)('Accept-Encoding %j selects %s', (header, expected) => {
    expect(negotiateEncoding(header)).toBe(expected);
  });

  it('falls back to identity when no offered coding is acceptable', () => {
    expect(negotiateEncoding('br', ['gzip', 'identity'])).toBe('identity');
    expect(negotiateEncoding('br, gzip;q=0.1', ['gzip', 'identity'])).toBe('gzip');
  });
});

describe('cachedJson', () => {
  it('lets browsers reuse responses for a minute and the CDN for a day', () => {
    const res = cachedJson(apiRequest(), { ok: true });
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
    );
  });

  it('tags responses with the CDN-only tag that ingests mark stale', () => {
    const res = cachedJson(apiRequest(), { ok: true });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db-cdn');
  });

  it('carries a custom cache tag when one is passed', () => {
    const res = cachedJson(apiRequest(), { ok: true }, { tag: 'collectivex' });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('collectivex');
  });

  it('honors a custom Cache-Control for lazily-refreshed routes', () => {
    const res = cachedJson(
      apiRequest(),
      { ok: true },
      { tag: 'collectivex', cacheControl: 'public, max-age=0, s-maxage=60' },
    );
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60');
  });

  it('keeps fixture responses out of the browser cache so E2E intercepts see every request', () => {
    fixtures.mode = true;
    try {
      const res = cachedJson(apiRequest(), { ok: true }, { cacheControl: 'public, max-age=5' });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      fixtures.mode = false;
    }
  });

  it('sets an environment-scoped Vercel-Cache-Tag', () => {
    process.env.CACHE_NAMESPACE = 'staging';

    const res = cachedJson(apiRequest(), { ok: true });

    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db-cdn:staging');
  });

  it.each([
    ['gzip, deflate, br, zstd', 'br'],
    ['gzip', 'gzip'],
    ['identity', null],
    [undefined, null],
  ] as const)('encodes for Accept-Encoding %j as %s', async (acceptEncoding, encoding) => {
    const data = { branch: 'feat/\u{1F680}-rocket', label: '基准测试', rows: [1, 2, 3] };
    const res = cachedJson(
      apiRequest(acceptEncoding === undefined ? {} : { 'Accept-Encoding': acceptEncoding }),
      data,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Content-Encoding')).toBe(encoding);
    expect(res.headers.get('Vary')).toBe('Accept-Encoding');
    expect(JSON.parse(await bodyText(res))).toEqual(data);
  });

  it('streams large payloads across multiple chunks', async () => {
    const res = cachedJson(apiRequest(), { big: 'x'.repeat(200_000) });
    const reader = res.body!.getReader();
    let chunks = 0;
    let readResult = await reader.read();
    while (!readResult.done) {
      chunks++;
      readResult = await reader.read();
    }
    expect(chunks).toBeGreaterThan(1);
  });

  it('compresses a large payload completely', async () => {
    const data = { rows: Array.from({ length: 20_000 }, (_, id) => ({ id, value: id / 7 })) };
    const res = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), data);
    expect(JSON.parse(await bodyText(res))).toEqual(data);
  });

  it('derives a strong ETag from the payload and the chosen encoding', () => {
    const etag = (data: unknown, acceptEncoding: string) =>
      cachedJson(apiRequest({ 'Accept-Encoding': acceptEncoding }), data).headers.get('ETag');

    expect(etag({ a: 1 }, 'br')).toMatch(/^"[\w-]+"$/u);
    expect(etag({ a: 1 }, 'br')).toBe(etag({ a: 1 }, 'br'));
    expect(etag({ a: 2 }, 'br')).not.toBe(etag({ a: 1 }, 'br'));
    expect(
      new Set([etag({ a: 1 }, 'br'), etag({ a: 1 }, 'gzip'), etag({ a: 1 }, 'identity')]).size,
    ).toBe(3);
  });

  it('answers a matching If-None-Match with a bodiless 304 and the cache headers', async () => {
    const data = { rows: [1, 2, 3] };
    const first = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), data);
    const etag = first.headers.get('ETag')!;

    for (const ifNoneMatch of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const res = cachedJson(
        apiRequest({ 'Accept-Encoding': 'br', 'If-None-Match': ifNoneMatch }),
        data,
      );
      expect(res.status).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('ETag')).toBe(etag);
      expect(res.headers.get('Vary')).toBe('Accept-Encoding');
      expect(res.headers.get('Cache-Control')).toBe(first.headers.get('Cache-Control'));
      expect(res.headers.get('Content-Encoding')).toBeNull();
    }
  });

  it('sends the full body when the payload or the negotiated encoding changed', async () => {
    const etag = cachedJson(apiRequest({ 'Accept-Encoding': 'br' }), { v: 1 }).headers.get('ETag')!;

    const changed = cachedJson(apiRequest({ 'Accept-Encoding': 'br', 'If-None-Match': etag }), {
      v: 2,
    });
    expect(changed.status).toBe(200);
    expect(JSON.parse(await bodyText(changed))).toEqual({ v: 2 });

    const otherEncoding = cachedJson(
      apiRequest({ 'Accept-Encoding': 'gzip', 'If-None-Match': etag }),
      { v: 1 },
    );
    expect(otherEncoding.status).toBe(200);
    expect(otherEncoding.headers.get('Content-Encoding')).toBe('gzip');
  });
});

describe('cachedGzipJson', () => {
  const data = { requests: [{ cid: 'trace-é', cancelled: false, ttftMs: null }] };
  const gzip = gzipSync(JSON.stringify(data));
  async function* chunks() {
    yield gzip.subarray(0, 13);
    yield gzip.subarray(13);
  }

  it('preserves complete gzip bytes for gzip clients with the CDN headers', async () => {
    const response = cachedGzipJson(apiRequest({ 'Accept-Encoding': 'gzip, br' }), chunks());
    expect(response.headers.get('Content-Encoding')).toBe('gzip');
    expect(response.headers.get('Vary')).toBe('Accept-Encoding');
    expect(response.headers.get('Vercel-Cache-Tag')).toBe('db-cdn');
    expect(response.headers.get('Cache-Control')).toBe(
      cachedJson(apiRequest(), data).headers.get('Cache-Control'),
    );
    const received = Buffer.from(await response.arrayBuffer());
    expect(received.equals(gzip)).toBe(true);
    expect(mockBlobGet).not.toHaveBeenCalled();
    expect(mockBlobSet).not.toHaveBeenCalled();
  });

  it('decompresses for clients that do not accept gzip', async () => {
    const response = cachedGzipJson(apiRequest(), chunks());
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(await response.json()).toEqual(data);
  });

  it('does not fetch ahead and stops fetching after cancellation', async () => {
    const next = vi.fn().mockResolvedValue({ done: false, value: new Uint8Array([1]) });
    const cleanup = vi.fn().mockResolvedValue({ done: true });
    const response = cachedGzipJson(apiRequest({ 'Accept-Encoding': 'gzip' }), {
      [Symbol.asyncIterator]: () => ({ next, return: cleanup }),
    });
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    const reader = response.body!.getReader();
    await reader.read();
    expect(next).toHaveBeenCalledTimes(1);
    await reader.cancel();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails the response stream rather than silently truncating on read errors', async () => {
    const cleanup = vi.fn().mockResolvedValue({ done: true });
    const response = cachedGzipJson(apiRequest({ 'Accept-Encoding': 'gzip' }), {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('chunk failed')),
        return: cleanup,
      }),
    });
    await expect(response.arrayBuffer()).rejects.toThrow('chunk failed');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

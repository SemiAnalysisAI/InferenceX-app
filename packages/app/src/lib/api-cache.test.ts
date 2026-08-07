import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/cache before importing the module under test
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: any[]) => any, _keys: string[], _opts: unknown) => fn),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  FIXTURES_MODE: false,
}));

vi.mock('./blob-cache', () => ({
  blobGet: vi.fn(),
  blobSet: vi.fn(),
  blobPurge: vi.fn(),
}));

import { cachedQuery, purgeAll, purgeCollectiveX, cachedJson } from './api-cache';
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
  // Default: unstable_cache returns the original function as-is
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
  });

  describe('blobOnly mode', () => {
    it('returns cached value from blob on hit', async () => {
      mockBlobGet.mockResolvedValue({ answer: 42 });
      const fn = vi.fn(() => Promise.resolve({ answer: 99 }));
      const wrapped = cachedQuery(fn, 'blob-key', { blobOnly: true });

      const result = await wrapped();
      expect(result).toEqual({ answer: 42 });
      expect(mockBlobGet).toHaveBeenCalledWith('blob-key');
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
      expect(mockBlobSet).toHaveBeenCalledWith('miss-key', { big: 'payload' });
    });

    it('builds blob key from prefix and args', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn((model: string, date: string) => Promise.resolve([model, date]));
      const wrapped = cachedQuery(fn, 'bench', { blobOnly: true });

      await wrapped('llama', '2025-01-01');
      expect(mockBlobGet).toHaveBeenCalledWith('bench:llama:2025-01-01');
      expect(mockBlobSet).toHaveBeenCalledWith('bench:llama:2025-01-01', ['llama', '2025-01-01']);
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
      expect(firstKey).toMatch(/^derived-agentic-metrics-v7:sha256:[a-f0-9]{64}$/u);
      expect(firstKey.length).toBeLessThan(128);
      expect(mockBlobSet).toHaveBeenCalledWith(firstKey, 200);
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

    it('uses bare prefix when no args are passed', async () => {
      mockBlobGet.mockResolvedValue('cached');
      const fn = vi.fn(() => Promise.resolve('fresh'));
      const wrapped = cachedQuery(fn, 'no-args', { blobOnly: true });

      await wrapped();
      expect(mockBlobGet).toHaveBeenCalledWith('no-args');
    });

    it('does not use unstable_cache in blobOnly mode', () => {
      const fn = vi.fn(() => Promise.resolve(null));
      cachedQuery(fn, 'skip-uc', { blobOnly: true });

      expect(mockUnstableCache).not.toHaveBeenCalled();
    });
  });
});

describe('purgeAll', () => {
  it('calls revalidateTag and blobPurge', async () => {
    mockBlobPurge.mockResolvedValue(15);

    const deleted = await purgeAll();

    expect(deleted).toBe(15);
    expect(mockRevalidateTag).toHaveBeenCalledWith('db', { expire: 0 });
    expect(mockBlobPurge).toHaveBeenCalled();
  });

  it('drops the CollectiveX tag too — the blob purge removed its entries', async () => {
    mockBlobPurge.mockResolvedValue(1);

    await purgeAll();

    expect(mockRevalidateTag).toHaveBeenCalledWith('collectivex', { expire: 0 });
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
  });
});

describe('purgeCollectiveX', () => {
  it('drops only the collectivex tag — no blobs belong to that scope', () => {
    purgeCollectiveX();

    expect(mockBlobPurge).not.toHaveBeenCalled();
    expect(mockRevalidateTag).toHaveBeenCalledWith('collectivex', { expire: 0 });
    expect(mockRevalidateTag).not.toHaveBeenCalledWith('db', { expire: 0 });
  });
});

describe('cachedJson', () => {
  it('sets Cache-Control with max-age=0 and 1 day s-maxage', () => {
    const res = cachedJson({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400');
  });

  it('sets Vercel-Cache-Tag to db', () => {
    const res = cachedJson({ ok: true });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db');
  });

  it('carries a custom cache tag when one is passed', () => {
    const res = cachedJson({ ok: true }, { tag: 'collectivex' });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('collectivex');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400');
  });

  it('honors a custom Cache-Control for lazily-refreshed routes', () => {
    const res = cachedJson(
      { ok: true },
      { tag: 'collectivex', cacheControl: 'public, max-age=0, s-maxage=60' },
    );
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60');
  });

  it('sets an environment-scoped Vercel-Cache-Tag', () => {
    process.env.CACHE_NAMESPACE = 'staging';

    const res = cachedJson({ ok: true });

    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db:staging');
  });

  it('sets Content-Type to application/json', () => {
    const res = cachedJson({ ok: true });
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns the data as JSON body', async () => {
    const data = { users: [1, 2, 3] };
    const res = cachedJson(data);
    const decompressed = res.body!.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(decompressed).text();
    expect(JSON.parse(text)).toEqual(data);
  });

  it('streams large payloads across multiple chunks', async () => {
    const data = { big: 'x'.repeat(200_000) };
    const res = cachedJson(data);
    const reader = res.body!.getReader();
    let chunks = 0;
    let readResult = await reader.read();
    while (!readResult.done) {
      chunks++;
      readResult = await reader.read();
    }
    expect(chunks).toBeGreaterThan(1);
  });

  it('preserves non-BMP characters (emoji, surrogate pairs)', async () => {
    const data = { branch: 'feat/\u{1F680}-rocket', msg: '\u{1F4A9}\u{1F30D}\u{1F525}' };
    const res = cachedJson(data);
    const decompressed = res.body!.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(decompressed).text();
    expect(JSON.parse(text)).toEqual(data);
  });
});

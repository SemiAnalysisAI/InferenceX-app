import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/cache before importing the module under test
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: Function, _keys: string[], _opts: unknown) => fn),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  JSON_MODE: false,
}));

vi.mock('./blob-cache', () => ({
  blobGet: vi.fn(),
  blobSet: vi.fn(),
  blobPurge: vi.fn(),
}));

import { cachedQuery, purgeAll, cachedJson } from './api-cache';
import { revalidateTag, unstable_cache } from 'next/cache';
import { blobGet, blobSet, blobPurge } from './blob-cache';

const mockRevalidateTag = vi.mocked(revalidateTag);
const mockUnstableCache = vi.mocked(unstable_cache);
const mockBlobGet = vi.mocked(blobGet);
const mockBlobSet = vi.mocked(blobSet);
const mockBlobPurge = vi.mocked(blobPurge);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: unstable_cache returns the original function as-is
  mockUnstableCache.mockImplementation((fn: Function) => fn as any);
});

describe('cachedQuery', () => {
  describe('default mode (unstable_cache)', () => {
    it('wraps the function with unstable_cache', () => {
      const fn = vi.fn(async (x: number) => x * 2);
      cachedQuery(fn, 'test-key');

      expect(mockUnstableCache).toHaveBeenCalledWith(fn, ['test-key'], { tags: ['db'] });
    });

    it('calls through to the original function and returns its result', async () => {
      const fn = vi.fn(async (x: number) => x * 2);
      const wrapped = cachedQuery(fn, 'multiply');

      const result = await wrapped(5);
      expect(result).toBe(10);
      expect(fn).toHaveBeenCalledWith(5);
    });

    it('passes arguments through to the cached function', async () => {
      const fn = vi.fn(async (a: string, b: string) => `${a}-${b}`);
      const wrapped = cachedQuery(fn, 'concat');

      const result = await wrapped('hello', 'world');
      expect(result).toBe('hello-world');
      expect(fn).toHaveBeenCalledWith('hello', 'world');
    });

    it('does not call blob functions in default mode', async () => {
      const fn = vi.fn(async () => 'data');
      const wrapped = cachedQuery(fn, 'no-blob');

      await wrapped();
      expect(mockBlobGet).not.toHaveBeenCalled();
      expect(mockBlobSet).not.toHaveBeenCalled();
    });
  });

  describe('blobOnly mode', () => {
    it('returns cached value from blob on hit', async () => {
      mockBlobGet.mockResolvedValue({ answer: 42 });
      const fn = vi.fn(async () => ({ answer: 99 }));
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
      const fn = vi.fn(async () => ({ big: 'payload' }));
      const wrapped = cachedQuery(fn, 'miss-key', { blobOnly: true });

      const result = await wrapped();
      expect(result).toEqual({ big: 'payload' });
      expect(fn).toHaveBeenCalled();
      expect(mockBlobSet).toHaveBeenCalledWith('miss-key', { big: 'payload' });
    });

    it('builds blob key from prefix and args', async () => {
      mockBlobGet.mockResolvedValue(null);
      mockBlobSet.mockResolvedValue(undefined);
      const fn = vi.fn(async (model: string, date: string) => [model, date]);
      const wrapped = cachedQuery(fn, 'bench', { blobOnly: true });

      await wrapped('llama', '2025-01-01');
      expect(mockBlobGet).toHaveBeenCalledWith('bench:llama:2025-01-01');
      expect(mockBlobSet).toHaveBeenCalledWith('bench:llama:2025-01-01', ['llama', '2025-01-01']);
    });

    it('uses bare prefix when no args are passed', async () => {
      mockBlobGet.mockResolvedValue('cached');
      const fn = vi.fn(async () => 'fresh');
      const wrapped = cachedQuery(fn, 'no-args', { blobOnly: true });

      await wrapped();
      expect(mockBlobGet).toHaveBeenCalledWith('no-args');
    });

    it('does not use unstable_cache in blobOnly mode', () => {
      const fn = vi.fn(async () => null);
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

  it('returns 0 when no blobs were deleted', async () => {
    mockBlobPurge.mockResolvedValue(0);

    const deleted = await purgeAll();
    expect(deleted).toBe(0);
  });
});

describe('cachedJson', () => {
  it('sets Cache-Control with max-age=0 and 1 year s-maxage', () => {
    const res = cachedJson({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=31536000');
  });

  it('sets Vercel-Cache-Tag to db', () => {
    const res = cachedJson({ ok: true });
    expect(res.headers.get('Vercel-Cache-Tag')).toBe('db');
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
    while (!(await reader.read()).done) chunks++;
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

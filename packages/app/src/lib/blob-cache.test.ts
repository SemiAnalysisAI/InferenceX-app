import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @vercel/blob
vi.mock('@vercel/blob', () => ({
  del: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

import { blobGet, blobSet, blobPurge } from './blob-cache';
import { del, head, list, put } from '@vercel/blob';

const mockDel = vi.mocked(del);
const mockHead = vi.mocked(head);
const mockList = vi.mocked(list);
const mockPut = vi.mocked(put);

// Save original env
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token-123';
  process.env.BLOB_CACHE_PREFIX = 'test-cache';

  // Default: global fetch returns valid JSON
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = originalEnv.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_CACHE_PREFIX = originalEnv.BLOB_CACHE_PREFIX;
  vi.unstubAllGlobals();
});

describe('graceful no-op when credentials missing', () => {
  it('blobGet returns null when BLOB_READ_WRITE_TOKEN is missing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(await blobGet('key')).toBeNull();
  });

  it('blobGet returns null when BLOB_CACHE_PREFIX is missing', async () => {
    delete process.env.BLOB_CACHE_PREFIX;
    expect(await blobGet('key')).toBeNull();
  });

  it('blobSet no-ops when BLOB_READ_WRITE_TOKEN is missing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await blobSet('key', 'value');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('blobPurge returns 0 when BLOB_CACHE_PREFIX is missing', async () => {
    delete process.env.BLOB_CACHE_PREFIX;
    expect(await blobPurge()).toBe(0);
  });
});

describe('blobGet', () => {
  it('returns parsed JSON on cache hit', async () => {
    const data = { models: ['llama', 'gpt4'], count: 2 };
    mockHead.mockResolvedValue({ url: 'https://blob.example.com/test-cache/mykey.json' } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => data,
    } as Response);

    const result = await blobGet('mykey');
    expect(result).toEqual(data);
    expect(mockHead).toHaveBeenCalledWith('test-cache/mykey.json');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://blob.example.com/test-cache/mykey.json');
  });

  it('returns null when head() throws (cache miss)', async () => {
    mockHead.mockRejectedValue(new Error('not found'));

    const result = await blobGet('missing');
    expect(result).toBeNull();
  });

  it('returns null when fetch response is not ok', async () => {
    mockHead.mockResolvedValue({ url: 'https://blob.example.com/test-cache/bad.json' } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await blobGet('bad');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws a network error', async () => {
    mockHead.mockResolvedValue({ url: 'https://blob.example.com/test-cache/net.json' } as any);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network error'));

    const result = await blobGet('net');
    expect(result).toBeNull();
  });

  it('returns null when json parsing fails', async () => {
    mockHead.mockResolvedValue({ url: 'https://blob.example.com/test-cache/corrupt.json' } as any);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);

    const result = await blobGet('corrupt');
    expect(result).toBeNull();
  });

  it('constructs path using prefix and key with .json extension', async () => {
    mockHead.mockRejectedValue(new Error('miss'));

    await blobGet('bench:llama:2025-01-01');
    expect(mockHead).toHaveBeenCalledWith('test-cache/bench:llama:2025-01-01.json');
  });
});

describe('blobSet', () => {
  it('puts JSON data with correct options', async () => {
    mockPut.mockResolvedValue({} as any);
    const data = { benchmarks: [1, 2, 3] };

    await blobSet('my-data', data);

    expect(mockPut).toHaveBeenCalledWith('test-cache/my-data.json', JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
  });

  it('serializes complex nested objects', async () => {
    mockPut.mockResolvedValue({} as any);
    const nested = { a: { b: { c: [1, 'two', null] } } };

    await blobSet('nested', nested);

    const [, body] = mockPut.mock.calls[0];
    expect(JSON.parse(body as string)).toEqual(nested);
  });

  it('handles string data', async () => {
    mockPut.mockResolvedValue({} as any);

    await blobSet('version', 'v1.2.3');

    const [, body] = mockPut.mock.calls[0];
    expect(body).toBe('"v1.2.3"');
  });

  it('handles null data', async () => {
    mockPut.mockResolvedValue({} as any);

    await blobSet('empty', null);

    const [, body] = mockPut.mock.calls[0];
    expect(body).toBe('null');
  });

  it('swallows "already exists" error from put (race condition)', async () => {
    mockPut.mockRejectedValue(new Error('This blob already exists'));

    await expect(blobSet('racy-key', { x: 1 })).resolves.toBeUndefined();
  });

  it('rethrows non-"already exists" errors', async () => {
    mockPut.mockRejectedValue(new Error('Network timeout'));

    await expect(blobSet('fail-key', { x: 1 })).rejects.toThrow('Network timeout');
  });
});

describe('blobPurge', () => {
  it('deletes all blobs in a single page and returns count', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { url: 'https://blob.example.com/a.json' },
        { url: 'https://blob.example.com/b.json' },
        { url: 'https://blob.example.com/c.json' },
      ],
      hasMore: false,
      cursor: '',
    } as any);
    mockDel.mockResolvedValue(undefined as any);

    const deleted = await blobPurge();

    expect(deleted).toBe(3);
    expect(mockDel).toHaveBeenCalledWith([
      'https://blob.example.com/a.json',
      'https://blob.example.com/b.json',
      'https://blob.example.com/c.json',
    ]);
    expect(mockList).toHaveBeenCalledWith({ prefix: 'test-cache/', cursor: undefined });
  });

  it('paginates through multiple pages', async () => {
    mockList
      .mockResolvedValueOnce({
        blobs: [
          { url: 'https://blob.example.com/1.json' },
          { url: 'https://blob.example.com/2.json' },
        ],
        hasMore: true,
        cursor: 'cursor-abc',
      } as any)
      .mockResolvedValueOnce({
        blobs: [{ url: 'https://blob.example.com/3.json' }],
        hasMore: true,
        cursor: 'cursor-def',
      } as any)
      .mockResolvedValueOnce({
        blobs: [{ url: 'https://blob.example.com/4.json' }],
        hasMore: false,
        cursor: '',
      } as any);
    mockDel.mockResolvedValue(undefined as any);

    const deleted = await blobPurge();

    expect(deleted).toBe(4);
    expect(mockList).toHaveBeenCalledTimes(3);
    expect(mockList).toHaveBeenNthCalledWith(1, { prefix: 'test-cache/', cursor: undefined });
    expect(mockList).toHaveBeenNthCalledWith(2, { prefix: 'test-cache/', cursor: 'cursor-abc' });
    expect(mockList).toHaveBeenNthCalledWith(3, { prefix: 'test-cache/', cursor: 'cursor-def' });
    expect(mockDel).toHaveBeenCalledTimes(3);
  });

  it('returns 0 when no blobs exist', async () => {
    mockList.mockResolvedValue({
      blobs: [],
      hasMore: false,
      cursor: '',
    } as any);

    const deleted = await blobPurge();

    expect(deleted).toBe(0);
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('does not call del for pages with empty blob arrays', async () => {
    mockList
      .mockResolvedValueOnce({
        blobs: [{ url: 'https://blob.example.com/1.json' }],
        hasMore: true,
        cursor: 'next',
      } as any)
      .mockResolvedValueOnce({
        blobs: [],
        hasMore: false,
        cursor: '',
      } as any);
    mockDel.mockResolvedValue(undefined as any);

    const deleted = await blobPurge();

    expect(deleted).toBe(1);
    expect(mockDel).toHaveBeenCalledTimes(1);
  });
});

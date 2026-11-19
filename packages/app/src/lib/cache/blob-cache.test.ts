import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@vercel/blob', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  del: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

import { blobGet, blobGetBytes, blobSet, blobPurge } from './blob-cache';
import {
  BlobServiceRateLimited,
  del,
  get,
  list,
  put,
  type GetBlobResult,
  type ListBlobResult,
  type PutBlobResult,
} from '@vercel/blob';

// Only the fields blobPurge reads; the full list() result also carries sizes and dates.
function listPage(count: number): ListBlobResult {
  return {
    blobs: Array.from({ length: count }, (_, i) => ({
      url: `https://blob.example.com/${i}.json`,
      pathname: `test-cache/${i}.json`,
    })),
    hasMore: false,
    cursor: '',
  } as unknown as ListBlobResult;
}

const mockDel = vi.mocked(del);
const mockGet = vi.mocked(get);
const mockList = vi.mocked(list);
const mockPut = vi.mocked(put);

function stored(body: Uint8Array): GetBlobResult {
  return {
    statusCode: 200,
    stream: new Response(new Uint8Array(body)).body!,
  } as unknown as GetBlobResult;
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token-123';
  process.env.BLOB_CACHE_PREFIX = 'test-cache';
});

afterEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = originalEnv.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_CACHE_PREFIX = originalEnv.BLOB_CACHE_PREFIX;
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
    await blobSet('key', '"value"');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('blobPurge returns 0 when BLOB_CACHE_PREFIX is missing', async () => {
    delete process.env.BLOB_CACHE_PREFIX;
    expect(await blobPurge()).toBe(0);
  });
});

describe('blobGet', () => {
  it('reads the compressed body with a single get() and returns its JSON text', async () => {
    const json = JSON.stringify({ models: ['llama', 'gpt4'], label: '基准' });
    mockGet.mockResolvedValue(stored(brotliCompressSync(json)));

    expect(await blobGet('bench:llama:2025-01-01')).toBe(json);
    expect(mockGet).toHaveBeenCalledExactlyOnceWith('test-cache/bench:llama:2025-01-01.json.br', {
      access: 'public',
    });
  });

  it('returns null when the blob does not exist', async () => {
    mockGet.mockResolvedValue(null);
    expect(await blobGet('missing')).toBeNull();
  });

  it('returns null when get() throws', async () => {
    mockGet.mockRejectedValue(new Error('Failed to fetch blob: 503 Service Unavailable'));
    expect(await blobGet('down')).toBeNull();
  });

  it('returns null for a truncated body instead of partial JSON', async () => {
    const body = brotliCompressSync(JSON.stringify({ rows: Array.from({ length: 5000 }, String) }));
    mockGet.mockResolvedValue(stored(body.subarray(0, -8)));
    expect(await blobGet('truncated')).toBeNull();
  });
});

describe('blobGetBytes', () => {
  it('returns the stored bytes unchanged from the exact key', async () => {
    const body = new Uint8Array([9, 0, 255, 7]);
    mockGet.mockResolvedValue(stored(body));
    expect(await blobGetBytes('generation/g/k.response.br')).toEqual(body);
    expect(mockGet).toHaveBeenCalledExactlyOnceWith('test-cache/generation/g/k.response.br', {
      access: 'public',
    });
  });

  it('treats a non-200 answer as a miss', async () => {
    mockGet.mockResolvedValue({ statusCode: 304, stream: null } as unknown as GetBlobResult);
    expect(await blobGetBytes('stale')).toBeNull();
  });
});

describe('blobSet', () => {
  it('stores the JSON brotli-compressed under the .json.br path', async () => {
    mockPut.mockResolvedValue({} as PutBlobResult);
    const json = JSON.stringify({ benchmarks: [1, 2, 3], label: '基准' });

    await blobSet('my-data', json);

    const [path, body, options] = mockPut.mock.calls[0]!;
    expect(path).toBe('test-cache/my-data.json.br');
    expect(brotliDecompressSync(body as Buffer).toString('utf8')).toBe(json);
    expect(options).toEqual({
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/octet-stream',
    });
  });

  it('swallows "already exists" error from put (race condition)', async () => {
    mockPut.mockRejectedValue(new Error('This blob already exists'));

    await expect(blobSet('racy-key', '{"x":1}')).resolves.toBeUndefined();
  });

  it('rethrows non-"already exists" errors', async () => {
    mockPut.mockRejectedValue(new Error('Network timeout'));

    await expect(blobSet('fail-key', '{"x":1}')).rejects.toThrow('Network timeout');
  });
});

describe('blobPurge', () => {
  it('restricts scoped purges to their exact key subtree', async () => {
    mockList.mockResolvedValue({ blobs: [], hasMore: false, cursor: '' } as any);
    expect(await blobPurge('operatorx/deployment/')).toBe(0);
    expect(mockList).toHaveBeenCalledWith({
      prefix: 'test-cache/operatorx/deployment/',
      cursor: undefined,
    });
  });

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

  it('keeps blobs under the excluded key subtrees', async () => {
    mockList.mockResolvedValue({
      blobs: [
        { url: 'https://blob.example.com/a.json', pathname: 'test-cache/db:v2:a.json' },
        { url: 'https://blob.example.com/o.json', pathname: 'test-cache/operatorx/ns/cmp.json' },
        { url: 'https://blob.example.com/b.json', pathname: 'test-cache/operatorxish.json' },
      ],
      hasMore: false,
      cursor: '',
    } as any);
    mockDel.mockResolvedValue(undefined as any);

    const deleted = await blobPurge('', ['operatorx/']);

    expect(deleted).toBe(2);
    expect(mockDel).toHaveBeenCalledWith([
      'https://blob.example.com/a.json',
      'https://blob.example.com/b.json',
    ]);
  });

  it('keeps blobs uploaded at or after the cutoff', async () => {
    const cutoff = new Date('2026-11-05T12:00:00Z');
    mockList.mockResolvedValue({
      blobs: [
        {
          url: 'https://blob.example.com/old.json',
          pathname: 'test-cache/generation/g1/a.json',
          uploadedAt: new Date('2026-11-05T11:59:59.999Z'),
        },
        {
          url: 'https://blob.example.com/at.json',
          pathname: 'test-cache/generation/g2/a.json',
          uploadedAt: cutoff,
        },
        {
          url: 'https://blob.example.com/new.json',
          pathname: 'test-cache/generation/g2/b.json',
          uploadedAt: new Date('2026-11-05T12:00:01Z'),
        },
        {
          url: 'https://blob.example.com/kept.json',
          pathname: 'test-cache/operatorx/ns/cmp.json',
          uploadedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      hasMore: false,
      cursor: '',
    } as unknown as ListBlobResult);
    mockDel.mockResolvedValue(undefined);

    const deleted = await blobPurge('', ['operatorx/'], cutoff);

    expect(deleted).toBe(1);
    expect(mockDel).toHaveBeenCalledExactlyOnceWith(['https://blob.example.com/old.json']);
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

  describe('large and rate-limited purges', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('deletes a full list page in batches of at most 100 blobs', async () => {
      mockList.mockResolvedValue(listPage(250));
      mockDel.mockResolvedValue(undefined);

      expect(await blobPurge()).toBe(250);
      expect(mockDel.mock.calls.map(([urls]) => (urls as string[]).length)).toEqual([100, 100, 50]);
    });

    it('waits for the retry-after window and resends the rate-limited batch', async () => {
      vi.useFakeTimers();
      mockList.mockResolvedValue(listPage(150));
      mockDel
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new BlobServiceRateLimited(60))
        .mockResolvedValue(undefined);

      const purge = blobPurge();
      await vi.advanceTimersByTimeAsync(59_000);
      expect(mockDel).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      expect(await purge).toBe(150);
      expect(mockDel).toHaveBeenCalledTimes(3);
      expect(mockDel.mock.calls[2]![0]).toEqual(mockDel.mock.calls[1]![0]);
    });

    it('fails after three rate-limit waits instead of outliving the function', async () => {
      vi.useFakeTimers();
      mockList.mockResolvedValue(listPage(10));
      mockDel.mockRejectedValue(new BlobServiceRateLimited(60));

      const purge = blobPurge();
      const outcome = expect(purge).rejects.toBeInstanceOf(BlobServiceRateLimited);
      await vi.advanceTimersByTimeAsync(180_000);
      await outcome;
      expect(mockDel).toHaveBeenCalledTimes(4);
    });

    it('does not retry errors other than rate limiting', async () => {
      mockList.mockResolvedValue(listPage(10));
      mockDel.mockRejectedValue(new Error('store suspended'));

      await expect(blobPurge()).rejects.toThrow('store suspended');
      expect(mockDel).toHaveBeenCalledTimes(1);
    });
  });
});

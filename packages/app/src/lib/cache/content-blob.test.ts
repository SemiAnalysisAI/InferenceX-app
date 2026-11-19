import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const afterTasks = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));

vi.mock('next/server', () => ({
  after: (task: Promise<unknown> | (() => Promise<unknown>)) => {
    afterTasks.pending.push(typeof task === 'function' ? task() : task);
  },
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: vi.fn() }));
vi.mock('next/dist/server/app-render/work-async-storage.external', () => ({
  workAsyncStorage: { getStore: () => undefined },
}));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
vi.mock('@vercel/blob', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  put: vi.fn(),
}));

import { put } from '@vercel/blob';

import {
  cachedJsonStoringContentBlob,
  contentBlobKey,
  contentBlobKeyOf,
  contentBlobRedirect,
  copyingToContentBlob,
} from './content-blob';

const mockPut = vi.mocked(put);
const fetchMock = vi.fn<typeof fetch>();
const originalEnv = { ...process.env };
const KEY = contentBlobKey('ns-v1', 'abc');
const URL_OF_KEY =
  'https://store1.public.blob.vercel-storage.com/test-cache/content/ns-v1/abc.json.gz';

const request = (acceptEncoding = 'gzip, br') =>
  new Request('http://localhost/api/v1/x', { headers: { 'Accept-Encoding': acceptEncoding } });

async function* chunksOf(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part);
}

async function drain(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  let text = '';
  for await (const chunk of chunks) text += new TextDecoder().decode(chunk);
  return text;
}

function uploadedBody(): Promise<string> {
  const body = mockPut.mock.calls[0]?.[1];
  if (!(body instanceof ReadableStream)) throw new Error('no streamed upload');
  return new Response(body).text();
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.pending = [];
  vi.stubGlobal('fetch', fetchMock);
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_store1_secret';
  process.env.BLOB_CACHE_PREFIX = 'test-cache';
  mockPut.mockResolvedValue({
    url: '',
    downloadUrl: '',
    pathname: '',
    contentType: '',
    contentDisposition: '',
    etag: '',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.BLOB_READ_WRITE_TOKEN = originalEnv.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_CACHE_PREFIX = originalEnv.BLOB_CACHE_PREFIX;
});

describe('contentBlobKeyOf', () => {
  it('names the inputs, in order', () => {
    expect(contentBlobKeyOf('ns', ['1:a', '2:b'])).not.toBe(contentBlobKeyOf('ns', ['2:b', '1:a']));
    expect(contentBlobKeyOf('ns', ['1:a', '2:b'])).toBe(contentBlobKeyOf('ns', ['1:a', '2:b']));
  });
});

describe('contentBlobRedirect', () => {
  it('redirects gzip clients to a stored blob with the CDN cache headers', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const response = await contentBlobRedirect(request(), KEY);
    expect(fetchMock).toHaveBeenCalledWith(URL_OF_KEY, { method: 'HEAD' });
    expect(response?.status).toBe(307);
    expect(response?.headers.get('Location')).toBe(URL_OF_KEY);
    expect(response?.headers.get('Vary')).toBe('Accept-Encoding');
    expect(response?.headers.get('Cache-Control')).toContain('s-maxage=86400');
  });

  it('serves the route itself while the blob is missing or unreachable', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await contentBlobRedirect(request(), KEY)).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await contentBlobRedirect(request(), KEY)).toBeNull();
  });

  it('never redirects clients that cannot decode gzip', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    expect(await contentBlobRedirect(request('identity'), KEY)).toBeNull();
    expect(await contentBlobRedirect(request('br'), KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is off without a Blob store', async () => {
    delete process.env.BLOB_CACHE_PREFIX;
    expect(await contentBlobRedirect(request(), KEY)).toBeNull();
    process.env.BLOB_CACHE_PREFIX = 'test-cache';
    process.env.BLOB_READ_WRITE_TOKEN = 'malformed';
    expect(await contentBlobRedirect(request(), KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('cachedJsonStoringContentBlob', () => {
  const data = { version: 1, requests: [[0, 1, null]] };

  it('serves the JSON and stores its gzip under the key after the response', async () => {
    const response = cachedJsonStoringContentBlob(request('identity'), data, KEY);
    expect(await response.text()).toBe(JSON.stringify(data));
    await Promise.all(afterTasks.pending);
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [path, body, options] = mockPut.mock.calls[0]!;
    expect(path).toBe('test-cache/content/ns-v1/abc.json.gz');
    expect(gunzipSync(body as Uint8Array).toString()).toBe(JSON.stringify(data));
    expect(options).toMatchObject({
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/gzip',
      multipart: false,
    });
  });

  it('stores nothing without a key', async () => {
    cachedJsonStoringContentBlob(request(), data, null);
    await Promise.all(afterTasks.pending);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('keeps the response when storing fails', async () => {
    mockPut.mockRejectedValue(new Error('rate limited'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = cachedJsonStoringContentBlob(request('identity'), data, KEY);
    expect(await response.json()).toEqual(data);
    await Promise.all(afterTasks.pending);
    expect(warn).toHaveBeenCalled();
  });
});

describe('copyingToContentBlob', () => {
  const parts = ['{"requests":', '[1,2]', '}'];
  const sha256 = createHash('sha256').update(parts.join('')).digest('hex');

  it('uploads exactly the bytes it serves when they match the digest', async () => {
    const served = await drain(copyingToContentBlob(chunksOf(...parts), KEY, sha256));
    expect(served).toBe(parts.join(''));
    expect(await uploadedBody()).toBe(parts.join(''));
    expect(mockPut.mock.calls[0]?.[2]).toMatchObject({ multipart: true });
  });

  it('aborts the upload when the bytes do not match the digest', async () => {
    const served = await drain(copyingToContentBlob(chunksOf(...parts), KEY, 'f'.repeat(64)));
    expect(served).toBe(parts.join(''));
    await expect(uploadedBody()).rejects.toThrow('was not copied whole');
  });

  it('aborts the upload when the response stops early', async () => {
    const iterator = copyingToContentBlob(chunksOf(...parts), KEY, sha256)[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    await expect(uploadedBody()).rejects.toThrow('was not copied whole');
  });

  it('keeps serving when the upload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockPut.mockRejectedValue(new Error('store unavailable'));
    const copying = copyingToContentBlob(chunksOf(...parts), KEY, sha256);
    await Promise.all(afterTasks.pending);
    expect(await drain(copying)).toBe(parts.join(''));
    expect(warn).toHaveBeenCalled();
  });

  it('passes chunks through untouched without a Blob store', () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const chunks = chunksOf(...parts);
    expect(copyingToContentBlob(chunks, KEY, sha256)).toBe(chunks);
    expect(mockPut).not.toHaveBeenCalled();
  });
});

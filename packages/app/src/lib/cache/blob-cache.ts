import { promisify } from 'node:util';
import { brotliCompress, brotliDecompress, constants as zlibConstants } from 'node:zlib';

import { BlobServiceRateLimited, del, get, list, put } from '@vercel/blob';

import { GZIP_JSON_CONTENT_TYPE } from '@/lib/api/gzip-json-response';

/** Each deleted blob counts as one operation toward Blob's per-minute rate limit. */
const PURGE_BATCH_SIZE = 100;
/** Rate-limit waits one purge may spend; three 60 s waits fit the 300 s function limit. */
const PURGE_RATE_LIMIT_WAITS = 3;
const STORED_BROTLI_QUALITY = 4;
const DECODE_CHUNK_BYTES = 4 * 1024 * 1024;

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && Boolean(process.env.BLOB_CACHE_PREFIX);
}

function getPrefix(): string {
  return `${process.env.BLOB_CACHE_PREFIX}/`;
}

export const CONTENT_BLOB_KEY_PREFIX = 'content/';
const CONTENT_BLOB_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function contentBlobUrl(key: string): string | null {
  if (!blobEnabled()) return null;
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.split('_')[3];
  return storeId
    ? `https://${storeId}.public.blob.vercel-storage.com/${getPrefix()}${CONTENT_BLOB_KEY_PREFIX}${key}`
    : null;
}

export async function putContentBlob(
  key: string,
  body: Buffer | ReadableStream<Uint8Array>,
): Promise<void> {
  try {
    await put(`${getPrefix()}${CONTENT_BLOB_KEY_PREFIX}${key}`, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: CONTENT_BLOB_MAX_AGE_SECONDS,
      contentType: GZIP_JSON_CONTENT_TYPE,
      multipart: body instanceof ReadableStream,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) return;
    throw error;
  }
}

export async function blobGet(key: string): Promise<string | null> {
  if (!blobEnabled()) return null;
  try {
    const result = await get(`${getPrefix()}${key}.json.br`, { access: 'public' });
    if (result?.statusCode !== 200) return null;
    const compressed = await new Response(result.stream).arrayBuffer();
    const json = await decompress(compressed, { chunkSize: DECODE_CHUNK_BYTES });
    return json.toString('utf8');
  } catch {
    return null;
  }
}

export async function blobSet(key: string, json: string): Promise<void> {
  if (!blobEnabled()) return;
  const body = await compress(json, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: STORED_BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(json),
    },
  });
  try {
    await put(`${getPrefix()}${key}.json.br`, body, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/octet-stream',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) return;
    throw error;
  }
}

/**
 * Delete cached blobs, optionally within a key prefix and keeping the key
 * subtrees in `keep`. No-op when unconfigured. Deletes go out in small batches,
 * and a rate-limited call waits for Blob's `retryAfter` and is sent again, so a
 * purge of thousands of blobs finishes instead of failing on the limit.
 */
export async function blobPurge(keyPrefix = '', keep: string[] = []): Promise<number> {
  if (!blobEnabled()) return 0;
  const prefix = `${getPrefix()}${keyPrefix}`;
  const kept = keep.map((key) => `${getPrefix()}${key}`);
  let waitsLeft = PURGE_RATE_LIMIT_WAITS;
  const withRateLimitRetry = async <A, T>(
    operation: (arg: A) => Promise<T>,
    arg: A,
  ): Promise<T> => {
    for (;;) {
      try {
        return await operation(arg);
      } catch (error) {
        if (!(error instanceof BlobServiceRateLimited) || waitsLeft === 0) throw error;
        waitsLeft -= 1;
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, (error.retryAfter || 60) * 1000);
        await promise;
      }
    }
  };
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const result = await withRateLimitRetry(list, { prefix, cursor });
    const urls = result.blobs
      .filter((b) => !kept.some((k) => b.pathname.startsWith(k)))
      .map((b) => b.url);
    for (let start = 0; start < urls.length; start += PURGE_BATCH_SIZE) {
      const batch = urls.slice(start, start + PURGE_BATCH_SIZE);
      await withRateLimitRetry(del, batch);
      deleted += batch.length;
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return deleted;
}

import { promisify } from 'node:util';
import { brotliCompress, brotliDecompress, constants as zlibConstants } from 'node:zlib';

import { BlobServiceRateLimited, del, get, list, put } from '@vercel/blob';

/** Each deleted blob counts as one operation toward Blob's per-minute rate limit. */
const PURGE_BATCH_SIZE = 100;
/** Rate-limit waits one purge may spend; three 60 s waits fit the 300 s function limit. */
const PURGE_RATE_LIMIT_WAITS = 3;
/**
 * Brotli quality for stored bodies. On the 12.7 MB history payload q4 is 8.6x smaller
 * than the JSON and costs 90 ms once per write. Decoding costs the same at every quality.
 */
const STORED_BROTLI_QUALITY = 4;
/**
 * Output chunk for the threadpool decoder. At zlib's default 16 KiB a 12.7 MB body takes
 * ~800 pool round trips and decodes at half the synchronous speed. At 4 MiB it matches it.
 */
const DECODE_CHUNK_BYTES = 4 * 1024 * 1024;

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && Boolean(process.env.BLOB_CACHE_PREFIX);
}

function getPrefix(): string {
  return `${process.env.BLOB_CACHE_PREFIX}/`;
}

/**
 * JSON text stored under `key`, or null on a miss, a read error, or when Blob is
 * not configured. `get()` builds the store URL from the token, so a read is one request.
 */
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

/** Store JSON text under `key`. No-ops when Blob is not configured. */
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

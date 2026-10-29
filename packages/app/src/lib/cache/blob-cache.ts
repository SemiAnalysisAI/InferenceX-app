import { BlobServiceRateLimited, del, head, list, put } from '@vercel/blob';

/** Each deleted blob counts as one operation toward Blob's per-minute rate limit. */
const PURGE_BATCH_SIZE = 100;
/** Rate-limit waits one purge may spend; three 60 s waits fit the 300 s function limit. */
const PURGE_RATE_LIMIT_WAITS = 3;

function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && Boolean(process.env.BLOB_CACHE_PREFIX);
}

function getPrefix(): string {
  return `${process.env.BLOB_CACHE_PREFIX}/`;
}

/** Read a cached value from blob storage. Returns null on miss or when blob is not configured. */
export async function blobGet<T>(key: string): Promise<T | null> {
  if (!blobEnabled()) return null;
  const path = `${getPrefix()}${key}.json`;
  try {
    const meta = await head(path);
    const res = await fetch(meta.url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Write a value to blob storage. No-ops when blob is not configured. */
export async function blobSet(key: string, data: unknown): Promise<void> {
  if (!blobEnabled()) return;
  const path = `${getPrefix()}${key}.json`;
  try {
    await put(path, JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
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

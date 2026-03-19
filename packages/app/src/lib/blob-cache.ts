import { del, head, list, put } from '@vercel/blob';

function getPrefix(): string {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required');
  }
  if (!process.env.BLOB_CACHE_PREFIX) {
    throw new Error('BLOB_CACHE_PREFIX is required');
  }
  return `${process.env.BLOB_CACHE_PREFIX}/`;
}

/** Read a cached value from blob storage. Returns null on miss. */
export async function blobGet<T>(key: string): Promise<T | null> {
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

/** Write a value to blob storage. No-ops if the key already exists (race-safe). */
export async function blobSet(key: string, data: unknown): Promise<void> {
  const path = `${getPrefix()}${key}.json`;
  try {
    await put(path, JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) return;
    throw err;
  }
}

/** Delete all cached blobs. */
export async function blobPurge(): Promise<number> {
  const prefix = getPrefix();
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const result = await list({ prefix, cursor });
    if (result.blobs.length > 0) {
      await del(result.blobs.map((b) => b.url));
      deleted += result.blobs.length;
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  return deleted;
}

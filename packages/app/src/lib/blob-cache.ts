import { del, head, list, put } from '@vercel/blob';

const BLOB_ENABLED = !!process.env.BLOB_READ_WRITE_TOKEN && !!process.env.BLOB_CACHE_PREFIX;

if (!BLOB_ENABLED) {
  console.log('Blob cache disabled: BLOB_READ_WRITE_TOKEN or BLOB_CACHE_PREFIX not set');
}

function getPrefix(): string {
  return `${process.env.BLOB_CACHE_PREFIX}/`;
}

/** Read a cached value from blob storage. Returns null on miss or when blob is not configured. */
export async function blobGet<T>(key: string): Promise<T | null> {
  if (!BLOB_ENABLED) return null;
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
  if (!BLOB_ENABLED) return;
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

/** Delete all cached blobs. Returns 0 when blob is not configured. */
export async function blobPurge(): Promise<number> {
  if (!BLOB_ENABLED) return 0;
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

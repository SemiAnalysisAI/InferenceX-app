import { revalidateTag } from 'next/cache';
import { unstable_cache } from 'next/cache';

import { blobGet, blobPurge, blobSet } from './blob-cache';

interface CachedQueryOptions {
  /** Use blob storage directly, skipping unstable_cache. Use for payloads known to exceed 2MB. */
  blobOnly?: boolean;
}

/**
 * Cache a function's result using unstable_cache (fast, local).
 * Set `blobOnly: true` for payloads known to exceed Next.js's 2MB unstable_cache limit.
 */
export function cachedQuery<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  options?: CachedQueryOptions,
): (...args: Args) => Promise<T> {
  if (options?.blobOnly) {
    return async (...args: Args): Promise<T> => {
      const blobKey = args.length > 0 ? `${keyPrefix}:${args.join(':')}` : keyPrefix;

      const cached = await blobGet<T>(blobKey);
      if (cached) return cached;

      const result = await fn(...args);
      await blobSet(blobKey, result);
      return result;
    };
  }

  const nextCached = unstable_cache(fn, [keyPrefix], { tags: ['db'] });
  return async (...args: Args): Promise<T> => nextCached(...args);
}

/** Purge both unstable_cache (via revalidateTag) and blob storage. */
export async function purgeAll(): Promise<number> {
  const deleted = await blobPurge();
  revalidateTag('db', { expire: 0 });
  return deleted;
}

/** 1 year — Vercel max. Purged on demand via revalidateTag('db'), no TTL needed. */
const CDN_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=31536000',
  'Vercel-Cache-Tag': 'db',
};

/** CDN-cached streamed + gzip-compressed JSON response — supports up to 20 MB on Vercel CDN. */
export function cachedJson<T>(data: T): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const CHUNK = 64 * 1024;
  const raw = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += CHUNK) {
        controller.enqueue(bytes.subarray(i, i + CHUNK));
      }
      controller.close();
    },
  });
  const compressed = raw.pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ...CDN_HEADERS,
    },
  });
}

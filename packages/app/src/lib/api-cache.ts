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

/** Purge both unstable_cache (via revalidateTag) and blob storage, then bump cache version. */
export async function purgeAll(): Promise<number> {
  const deleted = await blobPurge();
  await blobSet('cache-version', { v: new Date().toISOString() });
  revalidateTag('db', { expire: 0 });
  return deleted;
}

/** Read the current cache version (UTC timestamp set on last invalidation). */
export async function getCacheVersion(): Promise<string> {
  const data = await blobGet<{ v: string }>('cache-version');
  return data?.v ?? '';
}

/** 1 year — Vercel max. Purged on demand via revalidateTag('db'), no TTL needed. */
const CDN_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=31536000',
  'Vercel-Cache-Tag': 'db',
};

/** CDN-cached streamed JSON response — supports up to 20 MB on Vercel CDN. */
export function cachedJson<T>(data: T): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const CHUNK = 64 * 1024;
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += CHUNK) {
        controller.enqueue(bytes.subarray(i, i + CHUNK));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/json', ...CDN_HEADERS },
  });
}

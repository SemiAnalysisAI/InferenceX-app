import { revalidateTag, unstable_cache } from 'next/cache';

import { JSON_MODE } from '@semianalysisai/inferencex-db/connection';

import { blobGet, blobPurge, blobSet } from './blob-cache';

/**
 * CollectiveX data lives in its own database and gets its own cache scope:
 * every CollectiveX response carries this CDN/unstable_cache tag (via
 * `cachedJson(..., { tag })`), so run deletion can purge the CollectiveX
 * cache without dropping the main dashboard's. CollectiveX routes read their
 * DB directly — no blob layer, so the tag is the entire scope.
 */
export const COLLECTIVEX_CACHE_SCOPE = 'collectivex';

/**
 * Short CDN window shared by the CollectiveX latest/runs routes: new sweep
 * runs are discovered lazily at the origin, so freshness is bounded by this
 * TTL rather than by an ingest-time purge.
 */
export const COLLECTIVEX_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

interface CachedQueryOptions {
  /** Use blob storage directly, skipping unstable_cache. Use for payloads known to exceed 2MB. */
  blobOnly?: boolean;
  /** Cache tag for the unstable_cache path (default 'db'). */
  tag?: string;
}

/**
 * Cache a function's result using unstable_cache (fast, local).
 * Set `blobOnly: true` for payloads known to exceed Next.js's 2MB unstable_cache limit.
 * In JSON_MODE, skip all caching — data is already in memory.
 */
export function cachedQuery<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  options?: CachedQueryOptions,
): (...args: Args) => Promise<T> {
  // JSON dump mode: data is in-memory, no blob/cache needed
  if (JSON_MODE) return fn;

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

  const nextCached = unstable_cache(fn, [keyPrefix], { tags: [options?.tag ?? 'db'] });
  return (...args: Args): Promise<T> => nextCached(...args);
}

/** Purge both unstable_cache (via revalidateTag) and blob storage. */
export async function purgeAll(): Promise<number> {
  const deleted = await blobPurge();
  revalidateTag('db', { expire: 0 });
  // CollectiveX responses are cached only under their own tag (no blobs), so
  // a full purge must drop that tag explicitly — this line is the sole
  // mechanism that clears CollectiveX from the CDN.
  purgeCollectiveX();
  return deleted;
}

/**
 * Purge only the CollectiveX cache scope. CollectiveX routes read straight
 * from their own DB (no blob layer), so this is just the CDN/unstable_cache
 * tag.
 */
export function purgeCollectiveX(): void {
  revalidateTag(COLLECTIVEX_CACHE_SCOPE, { expire: 0 });
}

/** 1 day unless overridden. Purged on demand via revalidateTag with the matching tag. */
const cdnHeaders = (tag: string, cacheControl?: string) => ({
  'Cache-Control': cacheControl ?? 'public, max-age=0, s-maxage=86400',
  'Vercel-Cache-Tag': tag,
  'X-Content-Type-Options': 'nosniff',
});

/** CDN-cached streamed + gzip-compressed JSON response — supports up to 20 MB on Vercel CDN. */
export function cachedJson<T>(
  data: T,
  options?: { tag?: string; cacheControl?: string },
): Response {
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
      ...cdnHeaders(options?.tag ?? 'db', options?.cacheControl),
    },
  });
}

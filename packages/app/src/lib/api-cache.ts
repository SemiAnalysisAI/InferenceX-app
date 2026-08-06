import { createHash } from 'node:crypto';

import { revalidateTag, unstable_cache } from 'next/cache';
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
 * CDN/unstable_cache tag for CollectiveX responses, namespaced the same way as
 * the main database tag. Environments that share a Vercel project share its
 * cache tags, so an unnamespaced `collectivex` would let a purge in one
 * environment drop another's cached responses. `COLLECTIVEX_CACHE_SCOPE` stays
 * unnamespaced on purpose — it is the public identifier callers pass to
 * `/api/v1/invalidate?scope=`.
 */
export function collectiveXCacheTag(): string {
  const namespace = cacheNamespace();
  return namespace ? `${COLLECTIVEX_CACHE_SCOPE}:${namespace}` : COLLECTIVEX_CACHE_SCOPE;
}

/**
 * Short CDN window shared by the CollectiveX latest/runs routes: new sweep
 * runs are discovered lazily at the origin, so freshness is bounded by this
 * TTL rather than by an ingest-time purge.
 */
export const COLLECTIVEX_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

function cacheNamespace(): string {
  return process.env.CACHE_NAMESPACE?.trim() ?? '';
}

function cacheKey(keyPrefix: string): string {
  const namespace = cacheNamespace();
  return namespace ? `${namespace}:${keyPrefix}` : keyPrefix;
}

function cacheTag(): string {
  const namespace = cacheNamespace();
  return namespace ? `db:${namespace}` : 'db';
}

interface CachedQueryOptions {
  /** Use blob storage directly, skipping unstable_cache. Use for payloads known to exceed 2MB. */
  blobOnly?: boolean;
  /** Cache tag for the unstable_cache path (default 'db'). */
  tag?: string;
}

// Leave room for BLOB_CACHE_PREFIX and the `.json` suffix in the final Vercel
// Blob pathname. Short keys keep their existing human-readable form (and warm
// cache entries); large argument lists use a fixed-size digest instead.
const MAX_INLINE_BLOB_KEY_BYTES = 512;

function blobKeyForArgs(keyPrefix: string, args: unknown[]): string {
  if (args.length === 0) return keyPrefix;

  const inlineKey = `${keyPrefix}:${args.join(':')}`;
  if (Buffer.byteLength(inlineKey, 'utf8') <= MAX_INLINE_BLOB_KEY_BYTES) return inlineKey;

  const digest = createHash('sha256').update(JSON.stringify(args)).digest('hex');
  return `${keyPrefix}:sha256:${digest}`;
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
      const blobKey = blobKeyForArgs(keyPrefix, args);

      const cached = await blobGet<T>(blobKey);
      if (cached) return cached;

      const result = await fn(...args);
      try {
        await blobSet(blobKey, result);
      } catch (error) {
        // Blob storage is an optimization, not part of the data contract. A
        // cache outage or rejected pathname must not turn a successful DB read
        // into an API 500.
        console.warn(
          `[blob cache] could not persist ${keyPrefix}; serving uncached result. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return result;
    };
  }

  const nextCached = unstable_cache(fn, [cacheKey(keyPrefix)], {
    tags: [options?.tag ?? cacheTag()],
  });
  return (...args: Args): Promise<T> => nextCached(...args);
}

/** Purge both unstable_cache (via revalidateTag) and blob storage. */
export async function purgeAll(): Promise<number> {
  const deleted = await blobPurge();
  revalidateTag(cacheTag(), { expire: 0 });
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
  revalidateTag(collectiveXCacheTag(), { expire: 0 });
}

/**
 * 1 day unless overridden. Purged on demand via revalidateTag with the matching
 * tag. `tag` defaults to the environment-scoped database tag; CollectiveX routes
 * pass their own scope (and a shorter cacheControl).
 */
function cdnHeaders(tag: string = cacheTag(), cacheControl?: string): Record<string, string> {
  return {
    'Cache-Control': cacheControl ?? 'public, max-age=0, s-maxage=86400',
    'Vercel-Cache-Tag': tag,
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * CDN-cached plain-text response (e.g. CSV) with the same cache headers and
 * purge tag as cachedJson. Uncompressed — use only for small payloads.
 */
export function cachedText(data: string, contentType: string): Response {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      ...cdnHeaders(),
    },
  });
}

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
      ...cdnHeaders(options?.tag, options?.cacheControl),
    },
  });
}

import { createHash } from 'node:crypto';

import { revalidateTag, unstable_cache } from 'next/cache';
import { blobGet, blobPurge, blobSet } from './blob-cache';

export const COLLECTIVEX_CACHE_SCOPE = 'collectivex';

export function collectiveXCacheTag(): string {
  const namespace = cacheNamespace();
  return namespace ? `${COLLECTIVEX_CACHE_SCOPE}:${namespace}` : COLLECTIVEX_CACHE_SCOPE;
}

export const COLLECTIVEX_CACHE_CONTROL =
  'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export const OPERATORX_CACHE_SCOPE = 'operatorx';

export function operatorXCacheTag(): string {
  const namespace = cacheNamespace();
  return namespace ? `${OPERATORX_CACHE_SCOPE}:${namespace}` : OPERATORX_CACHE_SCOPE;
}

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
  blobOnly?: boolean;
  tag?: string;
}

const BLOB_KEY_ENCODING_VERSION = 'v2';
const MAX_INLINE_BLOB_KEY_BYTES = 512;

function canonicalCacheValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null) return ['null'];
  if (value === undefined) return ['undefined'];

  switch (typeof value) {
    case 'string':
    case 'boolean': {
      return [typeof value, value];
    }
    case 'number': {
      if (Number.isNaN(value)) return ['number', 'NaN'];
      if (value === Number.POSITIVE_INFINITY) return ['number', 'Infinity'];
      if (value === Number.NEGATIVE_INFINITY) return ['number', '-Infinity'];
      if (Object.is(value, -0)) return ['number', '-0'];
      return ['number', String(value)];
    }
    case 'bigint': {
      return ['bigint', value.toString()];
    }
    case 'object': {
      if (ancestors.has(value)) throw new TypeError('Blob cache arguments must not be cyclic');
      if (
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      ) {
        throw new TypeError('Blob cache arguments must contain only arrays and plain objects');
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError('Blob cache arguments must not contain symbol keys');
      }

      ancestors.add(value);
      let encoded: unknown;
      if (Array.isArray(value)) {
        encoded = ['array', value.map((item) => canonicalCacheValue(item, ancestors))];
      } else {
        const objectValue = value as Record<string, unknown>;
        encoded = [
          'object',
          Object.keys(objectValue)
            .toSorted()
            .map((key) => [key, canonicalCacheValue(objectValue[key], ancestors)]),
        ];
      }
      ancestors.delete(value);
      return encoded;
    }
    default: {
      throw new TypeError(`Unsupported Blob cache argument type: ${typeof value}`);
    }
  }
}

function blobKeyForArgs(keyPrefix: string, args: unknown[]): string {
  const serialized = JSON.stringify(canonicalCacheValue(args, new Set()));
  const inlineKey = `${keyPrefix}:${BLOB_KEY_ENCODING_VERSION}:${Buffer.from(serialized).toString('base64url')}`;
  if (Buffer.byteLength(inlineKey, 'utf8') <= MAX_INLINE_BLOB_KEY_BYTES) return inlineKey;

  const digest = createHash('sha256').update(serialized).digest('hex');
  return `${keyPrefix}:${BLOB_KEY_ENCODING_VERSION}:sha256:${digest}`;
}

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

export function cachedDerivedData<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
): (...args: Args) => Promise<T> {
  return cachedQuery(fn, `derived:${keyPrefix}`);
}

export async function purgeAll(): Promise<number> {
  const deleted = await blobPurge();
  revalidateTag(cacheTag(), { expire: 0 });
  purgeCollectiveX();
  purgeOperatorX();
  return deleted;
}

export function purgeCollectiveX(): void {
  revalidateTag(collectiveXCacheTag(), { expire: 0 });
}

function cdnHeaders(tag: string = cacheTag(), cacheControl?: string): Record<string, string> {
  return {
    'Cache-Control': cacheControl ?? 'public, max-age=0, s-maxage=86400',
    'Vercel-Cache-Tag': tag,
    'X-Content-Type-Options': 'nosniff',
  };
}

export function cachedText(data: string, contentType: string): Response {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      ...cdnHeaders(),
    },
  });
}

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

export function purgeOperatorX(): void {
  revalidateTag(operatorXCacheTag(), { expire: 0 });
}

export function cachedGzipJson(chunks: AsyncIterable<Uint8Array>): Response {
  const iterator = chunks[Symbol.asyncIterator]();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (cancelled) return;
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          if (!cancelled) controller.error(error);
          await iterator.return?.();
        }
      },
      async cancel() {
        cancelled = true;
        await iterator.return?.();
      },
    },
    { highWaterMark: 0 },
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ...cdnHeaders(),
    },
  });
}

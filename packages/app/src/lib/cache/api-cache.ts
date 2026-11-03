import { createHash, randomUUID } from 'node:crypto';
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
  createBrotliCompress,
  createGzip,
} from 'node:zlib';

import { revalidateTag, unstable_cache } from 'next/cache';
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import { CONTENT_BLOB_KEY_PREFIX, blobEnabled, blobGet, blobPurge, blobSet } from './blob-cache';

/**
 * CollectiveX data lives in its own database and gets its own cache scope:
 * every CollectiveX response carries this CDN/unstable_cache tag (via
 * `cachedJson(..., { tag })`), so a CollectiveX ingest can purge the CollectiveX
 * cache without dropping the main dashboard's. CollectiveX routes read their
 * DB directly — no blob layer, so the tag is the entire scope. Responses stay
 * cached until the CollectiveX ingest workflow purges it
 * (`/api/v1/invalidate?scope=collectivex`).
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
 * OperatorX reads its own database and has its own scope, like CollectiveX: its
 * responses carry this tag; merged comparisons also use a revision-keyed Blob subtree.
 * CDN responses stay cached until an OperatorX ingest purges it
 * (`/api/v1/invalidate?scope=operatorx`).
 */
export const OPERATORX_CACHE_SCOPE = 'operatorx';

/** CDN tag for OperatorX responses, namespaced like the other scopes. */
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

/**
 * Server data tag for entries read while an ISR page regenerates. A stale
 * unstable_cache entry is refetched in the foreground during static
 * generation, so ingests can mark this tag stale. Pages tagged with it keep
 * serving their previous HTML instead of blocking the next visitor on a render.
 */
function pageCacheTag(): string {
  const namespace = cacheNamespace();
  return namespace ? `db-page:${namespace}` : 'db-page';
}

/**
 * CDN tag for dashboard API responses. It is separate from the server data
 * tag so an ingest can expire server entries immediately while the CDN keeps
 * serving the previous response until its background refresh finishes.
 */
function cdnCacheTag(): string {
  const namespace = cacheNamespace();
  return namespace ? `db-cdn:${namespace}` : 'db-cdn';
}

interface CachedQueryOptions {
  /** Use blob storage directly, skipping unstable_cache. Use for payloads known to exceed 2MB. */
  blobOnly?: boolean;
  revisioned?: boolean;
  /** Cache tag for the unstable_cache path (default 'db'). */
  tag?: string;
}

// Blob argument encoding is explicitly versioned. v1 used `args.join(':')`,
// which was not injective for arrays, objects, null, and undefined. v2 keys
// never read a v1 entry; the next ordinary prefix purge removes those orphaned
// values along with every other cache generation.
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
        // The prototype check above establishes the plain string-keyed object boundary.
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

const COMPRESS_CACHED_JSON_CHARS = 64 * 1024;

type CachedEntry<T> = { readonly value: T } | { readonly brotli: string };

function packCachedEntry<T>(value: T): CachedEntry<T> {
  const json = JSON.stringify(value);
  if (json === undefined || json.length <= COMPRESS_CACHED_JSON_CHARS) return { value };
  const compressed = brotliCompressSync(json, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: json.length,
    },
  });
  return { brotli: compressed.toString('base64') };
}

function unpackCachedEntry<T>(entry: CachedEntry<T>): T {
  if (!('brotli' in entry)) return entry.value;
  return JSON.parse(
    brotliDecompressSync(Buffer.from(entry.brotli, 'base64')).toString('utf8'),
  ) as T;
}

let blobGeneration: (() => Promise<string>) | undefined;

/**
 * Cache a function's result using unstable_cache (fast, local).
 * Set `blobOnly: true` for payloads that should live in Blob storage instead.
 */
export function cachedQuery<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  options?: CachedQueryOptions,
): (...args: Args) => Promise<T> {
  if (options?.blobOnly) {
    const inflight = new Map<string, Promise<{ json: string; value: T }>>();
    const fill = async (path: string, args: Args) => {
      const cached = await blobGet(path);
      if (cached !== null) {
        const value = JSON.parse(cached) as T;
        if (value) return { json: cached, value };
      }
      const value = await fn(...args);
      const json = JSON.stringify(value);
      try {
        await blobSet(path, json);
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
      return { json, value };
    };
    return async (...args: Args): Promise<T> => {
      const blobKey = blobKeyForArgs(keyPrefix, args);
      if (!blobEnabled()) return fn(...args);
      blobGeneration ??= cachedQuery(() => Promise.resolve(randomUUID()), 'blob-generation');
      const path = options.revisioned ? blobKey : `generation/${await blobGeneration()}/${blobKey}`;
      const pending = inflight.get(path);
      if (pending) {
        const { json } = await pending;
        return JSON.parse(json) as T;
      }
      const flight = fill(path, args);
      inflight.set(path, flight);
      try {
        const { value } = await flight;
        return value;
      } finally {
        inflight.delete(path);
      }
    };
  }

  const packed = (...args: Args): Promise<CachedEntry<T>> => fn(...args).then(packCachedEntry);
  const fnSource = fn.toString();

  if (options?.tag) {
    const tagged = unstable_cache(packed, [cacheKey(keyPrefix), fnSource], {
      tags: [options.tag],
    });
    return async (...args: Args): Promise<T> => unpackCachedEntry(await tagged(...args));
  }

  // Route handlers need an expired entry to refetch before they answer, or the
  // CDN's background refresh would cache stale data for another day. ISR page
  // renders refetch stale entries themselves, so they read a separately keyed
  // entry under the stale-while-revalidate page tag.
  const routeCached = unstable_cache(packed, [cacheKey(keyPrefix), fnSource], {
    tags: [cacheTag()],
  });
  const pageCached = unstable_cache(packed, [cacheKey(`page:${keyPrefix}`), fnSource], {
    tags: [pageCacheTag()],
  });
  return async (...args: Args): Promise<T> =>
    unpackCachedEntry(
      await (workAsyncStorage.getStore()?.isStaticGeneration
        ? pageCached(...args)
        : routeCached(...args)),
    );
}

/**
 * Cache compact, derived server payloads in Next's tagged cache.
 *
 * This deliberately has no Blob fallback: callers use it only after reducing
 * raw database rows to a page-owned payload that stays below Next's cache
 * limit. Arguments are part of the unstable_cache key, so callers should pass
 * only canonical, meaningful selector values.
 */
export function cachedDerivedData<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  keyPrefix: string,
): (...args: Args) => Promise<T> {
  return cachedQuery(fn, `derived:${keyPrefix}`);
}

/**
 * Purge the dashboard and CollectiveX caches and the configured Blob prefix.
 * OperatorX is excluded. Its data is independent of results ingests, and only
 * its own ingest (`purgeOperatorX`) can make its cached responses stale.
 *
 * By default route-handler server entries (Blob and unstable_cache) expire
 * immediately so the next origin read comes from the database. CDN responses
 * and ISR page data are only marked stale, so visitors get the previous
 * payload once while it refreshes in the background. `immediate` drops every
 * layer at once, for corrections and retractions that must never be served again.
 */
export async function purgeAll({
  immediate = false,
}: { immediate?: boolean } = {}): Promise<number> {
  const deleted = await blobPurge(
    '',
    immediate
      ? [`${OPERATORX_CACHE_SCOPE}/`]
      : [`${OPERATORX_CACHE_SCOPE}/`, CONTENT_BLOB_KEY_PREFIX],
  );
  const stale = immediate ? { expire: 0 } : 'max';
  revalidateTag(cacheTag(), { expire: 0 });
  revalidateTag(pageCacheTag(), stale);
  revalidateTag(cdnCacheTag(), stale);
  // CollectiveX responses are cached only under their own tag (no blobs), so
  // a full purge must drop that tag explicitly.
  purgeCollectiveX({ immediate });
  return deleted;
}

/**
 * Purge only the CollectiveX cache scope. CollectiveX routes read straight
 * from their own DB (no blob layer), so this is just the CDN tag. By default
 * the CDN serves the previous response once while it refreshes. `immediate`
 * drops it so the next request waits for the origin, for corrected or retracted
 * results.
 */
export function purgeCollectiveX({ immediate = false }: { immediate?: boolean } = {}): void {
  revalidateTag(collectiveXCacheTag(), immediate ? { expire: 0 } : 'max');
}

/**
 * Browsers reuse a response for 60 s, then revalidate it with its ETag, which
 * costs a round trip but no body. The CDN keeps it for a day and refreshes in
 * the background after that; ingests purge it on demand via the CDN tag.
 * Vercel strips `s-maxage` and `stale-while-revalidate` before the browser,
 * so a browser never shows a stale dashboard for longer than `max-age`.
 */
const DEFAULT_CACHE_CONTROL = 'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400';

/**
 * Fixture builds back the E2E suite, which stubs API responses per test with
 * `cy.intercept`. An intercept never sees a response the browser serves from
 * its HTTP cache (or revalidates to a 304), so fixture responses are not stored.
 */
const FIXTURES_CACHE_CONTROL = 'no-store';

/**
 * Response cache headers. `tag` defaults to the environment-scoped dashboard
 * CDN tag. CollectiveX and OperatorX routes pass their own scope.
 */
export function cdnHeaders(
  tag: string = cdnCacheTag(),
  cacheControl?: string,
): Record<string, string> {
  return {
    'Cache-Control': FIXTURES_MODE
      ? FIXTURES_CACHE_CONTROL
      : (cacheControl ?? DEFAULT_CACHE_CONTROL),
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

export type ResponseEncoding = 'br' | 'gzip' | 'identity';

const ENCODING_PREFERENCE: readonly ResponseEncoding[] = ['br', 'gzip', 'identity'];

/**
 * Choose the response content coding from `Accept-Encoding` (RFC 9110
 * §12.5.3): the highest q-value wins and ties prefer br, then gzip. Unlisted
 * identity ranks below any accepted compression, and it is the fallback when
 * nothing else is acceptable. A request without the header gets identity,
 * because clients that omit it (curl, scripts) usually cannot decode bodies.
 */
export function negotiateEncoding(
  acceptEncoding: string | null,
  offered: readonly ResponseEncoding[] = ENCODING_PREFERENCE,
): ResponseEncoding {
  if (!acceptEncoding) return 'identity';
  const weights = new Map<string, number>();
  for (const entry of acceptEncoding.split(',')) {
    const [rawCoding = '', ...params] = entry.split(';');
    const coding = rawCoding.trim().toLowerCase();
    if (!coding) continue;
    let weight = 1;
    for (const param of params) {
      const [key = '', value = ''] = param.split('=');
      if (key.trim().toLowerCase() !== 'q') continue;
      const parsed = Number(value.trim());
      weight = Number.isFinite(parsed) ? parsed : 0;
    }
    weights.set(coding === 'x-gzip' ? 'gzip' : coding, weight);
  }
  const wildcard = weights.get('*');
  let best: ResponseEncoding = 'identity';
  let bestWeight = 0;
  for (const coding of ENCODING_PREFERENCE) {
    if (!offered.includes(coding)) continue;
    const weight =
      weights.get(coding) ?? wildcard ?? (coding === 'identity' ? Number.MIN_VALUE : 0);
    if (weight > bestWeight) {
      best = coding;
      bestWeight = weight;
    }
  }
  return best;
}

function entityTag(source: Uint8Array | string, coding: string): string {
  const digest = createHash('sha256').update(source).digest('base64url').slice(0, 32);
  return coding === 'identity' ? `"${digest}"` : `"${digest}-${coding}"`;
}

/** If-None-Match uses weak comparison (RFC 9110 §13.1.2). */
function matchesIfNoneMatch(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch.split(',').some((candidate) => {
    const tag = candidate.trim();
    return (tag.startsWith('W/') ? tag.slice(2) : tag) === etag;
  });
}

const STREAM_CHUNK_BYTES = 64 * 1024;
// Quality 9 is about 2x gzip's CPU and 8-25% smaller on the dashboard
// payloads. Quality 10+ is 10-40x slower, too slow for a cold CDN miss.
const BROTLI_QUALITY = 9;
const MIB = 1024 * 1024;

function brotliQualityFor(size: number): number {
  if (size < MIB) return BROTLI_QUALITY;
  return size < 4 * MIB ? 8 : 7;
}

function identityBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += STREAM_CHUNK_BYTES) {
        controller.enqueue(bytes.subarray(i, i + STREAM_CHUNK_BYTES));
      }
      controller.close();
    },
  });
}

function compressedBody(
  bytes: Uint8Array,
  encoding: 'br' | 'gzip',
  brotliQuality: number,
): ReadableStream<Uint8Array> {
  const encoder =
    encoding === 'br'
      ? createBrotliCompress({
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: brotliQuality,
            [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
          },
        })
      : createGzip();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      encoder.on('data', (chunk: Buffer) => {
        if (!cancelled) controller.enqueue(chunk);
      });
      encoder.once('end', () => {
        if (!cancelled) controller.close();
      });
      encoder.once('error', (error) => {
        if (!cancelled) controller.error(error);
      });
      for (let i = 0; i < bytes.length; i += STREAM_CHUNK_BYTES) {
        encoder.write(bytes.subarray(i, i + STREAM_CHUNK_BYTES));
      }
      encoder.end();
    },
    cancel() {
      cancelled = true;
      encoder.destroy();
    },
  });
}

interface CachedJsonOptions {
  tag?: string;
  cacheControl?: string;
  version?: string;
}

function jsonValidation(
  request: Request,
  source: Uint8Array | string,
  options: CachedJsonOptions | undefined,
  brotliQuality = BROTLI_QUALITY,
) {
  const encoding = negotiateEncoding(request.headers.get('Accept-Encoding'));
  const etag = entityTag(
    source,
    encoding === 'br' && brotliQuality !== BROTLI_QUALITY ? `br${brotliQuality}` : encoding,
  );
  const headers = {
    ETag: etag,
    Vary: 'Accept-Encoding',
    ...cdnHeaders(options?.tag, options?.cacheControl),
  };
  const notModified = matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)
    ? new Response(null, { status: 304, headers })
    : null;
  return { encoding, headers, notModified };
}

export function notModifiedJson(
  request: Request,
  options: CachedJsonOptions & { version: string },
): Response | null {
  return jsonValidation(request, options.version, options).notModified;
}

/**
 * CDN-cached streamed JSON response — supports up to 20 MB on Vercel CDN.
 * The body is brotli, gzip, or identity per the request's Accept-Encoding,
 * with `Vary: Accept-Encoding` and a strong ETag; a matching If-None-Match
 * gets a bodiless 304.
 */
export function cachedJson<T>(request: Request, data: T, options?: CachedJsonOptions): Response {
  return cachedJsonBytes(request, new TextEncoder().encode(JSON.stringify(data)), options);
}

export function cachedJsonBytes(
  request: Request,
  bytes: Uint8Array,
  options?: CachedJsonOptions,
): Response {
  const brotliQuality = options?.version ? BROTLI_QUALITY : brotliQualityFor(bytes.byteLength);
  const {
    encoding,
    headers: cacheHeaders,
    notModified,
  } = jsonValidation(request, options?.version ?? bytes, options, brotliQuality);
  if (notModified) return notModified;
  if (encoding === 'identity') {
    return new Response(identityBody(bytes), {
      headers: { 'Content-Type': 'application/json', ...cacheHeaders },
    });
  }
  return new Response(compressedBody(bytes, encoding, brotliQuality), {
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding, ...cacheHeaders },
  });
}

/** Isolated Blob key subtree for this deployment's OperatorX comparisons. */
export function operatorXBlobPrefix(): string {
  const namespace = createHash('sha256').update(cacheNamespace()).digest('hex');
  return `${OPERATORX_CACHE_SCOPE}/${namespace}/`;
}

/** Purge OperatorX's CDN tag and shared merged-comparison blobs. */
export async function purgeOperatorX({
  immediate = false,
}: { immediate?: boolean } = {}): Promise<void> {
  // OperatorX has no unstable_cache layer: once its blobs are gone, the CDN's
  // background refresh reads fresh data, so the stale response is served once.
  await blobPurge(operatorXBlobPrefix());
  revalidateTag(operatorXCacheTag(), immediate ? { expire: 0 } : 'max');
}

/**
 * Serve existing gzip bytes with the same CDN contract, pulling only on
 * demand. Clients that do not accept gzip get the decompressed JSON. There is
 * no ETag: the bytes are never buffered to hash them.
 */
export function cachedGzipJson(request: Request, chunks: AsyncIterable<Uint8Array>): Response {
  const iterator = chunks[Symbol.asyncIterator]();
  let cancelled = false;
  const gzipBody = new ReadableStream<Uint8Array>(
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
  const gzip =
    negotiateEncoding(request.headers.get('Accept-Encoding'), ['gzip', 'identity']) === 'gzip';
  const body = gzip
    ? gzipBody
    : gzipBody.pipeThrough<Uint8Array>(
        new DecompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>,
      );
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      Vary: 'Accept-Encoding',
      ...cdnHeaders(),
    },
  });
}

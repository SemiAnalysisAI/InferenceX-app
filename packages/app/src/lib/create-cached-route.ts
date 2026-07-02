/**
 * createCachedRoute — factory for the standard v1 GET handler pattern:
 *   cachedQuery(queryFn, keyPrefix, opts) → try { cachedJson(data) } catch → 500 JSON
 *
 * The optional `parseParams` callback runs before the query:
 * - Return `{ error, status }` to send an early error response.
 * - Return `{ args }` (possibly empty array) to call the query with those args.
 *
 * Cache keys, response shapes, headers, and error messages are identical to the
 * hand-written boilerplate they replace — this is a pure structural refactor.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

/** Mirror of the options accepted by cachedQuery (api-cache.ts does not export this type). */
interface CachedQueryOptions {
  blobOnly?: boolean;
}

/** Signals a 4xx validation error back to the factory handler. */
export interface RouteParamError {
  error: string;
  status: number;
}

/** Successful param parse: args to forward to the cached query function. */
export interface RouteParamSuccess<Args extends unknown[]> {
  args: Args;
}

export type ParseParamsResult<Args extends unknown[]> = RouteParamError | RouteParamSuccess<Args>;

/** Options accepted by createCachedRoute. */
export interface CreateCachedRouteOptions<Args extends unknown[]> {
  /**
   * Human-readable resource name used in the console.error message, e.g.
   * "availability" → "Error fetching availability: …"
   */
  resource: string;
  /**
   * Blob-only or other cachedQuery options. Defaults to undefined (standard
   * unstable_cache path).
   */
  cacheOptions?: CachedQueryOptions;
  /**
   * Parse and validate query parameters. Return `{ error, status }` to reject
   * early, or `{ args }` to proceed. If omitted, the query is called with no
   * arguments.
   */
  parseParams?: (request: NextRequest) => ParseParamsResult<Args>;
}

/**
 * Build a Next.js App Router GET handler backed by cachedQuery + cachedJson.
 *
 * When `parseParams` is omitted the returned handler takes no required
 * parameters (the request argument is unused), so it can be exported directly
 * as a no-arg GET handler for routes that need no query-string validation.
 *
 * @param queryFn   The raw async DB function — same function you'd pass to cachedQuery directly.
 * @param keyPrefix Stable cache key prefix — MUST NOT change (would silently double cache storage).
 * @param opts      Resource name, optional cacheOptions, optional param parser.
 */
export function createCachedRoute<T, Args extends unknown[]>(
  queryFn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  opts: CreateCachedRouteOptions<Args> & {
    parseParams: (request: NextRequest) => ParseParamsResult<Args>;
  },
): (request: NextRequest) => Promise<Response>;

export function createCachedRoute<T>(
  queryFn: () => Promise<T>,
  keyPrefix: string,
  opts: Omit<CreateCachedRouteOptions<[]>, 'parseParams'>,
): () => Promise<Response>;

export function createCachedRoute<T, Args extends unknown[]>(
  queryFn: (...args: Args) => Promise<T>,
  keyPrefix: string,
  opts: CreateCachedRouteOptions<Args>,
): ((request: NextRequest) => Promise<Response>) | (() => Promise<Response>) {
  const getCached = cachedQuery(queryFn, keyPrefix, opts.cacheOptions);

  if (opts.parseParams) {
    const parseParams = opts.parseParams;
    return async (request: NextRequest): Promise<Response> => {
      const result = parseParams(request);
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      try {
        const data = await getCached(...result.args);
        return cachedJson(data);
      } catch (error) {
        console.error(`Error fetching ${opts.resource}:`, error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    };
  }

  return async (): Promise<Response> => {
    try {
      const data = await (getCached as () => Promise<T>)();
      return cachedJson(data);
    } catch (error) {
      console.error(`Error fetching ${opts.resource}:`, error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

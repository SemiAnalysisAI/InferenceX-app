import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson } from '@/lib/api-cache';
import { PUBLIC_API_ERRORS, publicApiError, tooManyIdsError } from '@/lib/public-api-errors';

/**
 * Shared GET-handler factories for the agentic benchmark routes, which all
 * key off `benchmark_results.id`. Two shapes exist:
 *  - bulk `?ids=1,2,3` routes returning a map keyed by id
 *  - single `?id=N` routes returning one payload or 404
 *
 * Both preserve the v1 error contract: 400 with `{error}` for bad params,
 * 404 `{error: 'Not found'}` when a single-id lookup misses, and 500
 * `{error: 'Internal server error'}` (with a console.error) on query failure.
 * Success payloads go through `cachedJson` for CDN caching + gzip.
 */

/**
 * Parse, dedupe, validate, and ascending-sort the `ids` query param.
 * Sorted so the same set of ids in any order hits the same cache entry.
 * Returns a NextResponse (400) when the param is missing, empty, or too long.
 */
export function parseIdsParam(request: NextRequest, maxIds: number): number[] | NextResponse {
  const raw = request.nextUrl.searchParams.get('ids');
  if (!raw) {
    return publicApiError(PUBLIC_API_ERRORS.idsRequired, 400);
  }

  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (ids.length === 0) {
    return publicApiError(PUBLIC_API_ERRORS.noValidIds, 400);
  }
  if (ids.length > maxIds) {
    return publicApiError(tooManyIdsError(maxIds), 400);
  }
  return ids.toSorted((a, b) => a - b);
}

/** Build a GET handler for a bulk `?ids=…` route. */
export function idsQueryRoute<T>(options: {
  maxIds: number;
  /** Human-readable name used in the 500-path console.error. */
  logLabel: string;
  fetch: (ids: number[]) => Promise<T>;
}): (request: NextRequest) => Promise<Response> {
  const { maxIds, logLabel, fetch } = options;
  return async (request: NextRequest) => {
    const ids = parseIdsParam(request, maxIds);
    if (ids instanceof NextResponse) return ids;
    try {
      return cachedJson(await fetch(ids));
    } catch (error) {
      console.error(`Error fetching ${logLabel}:`, error);
      return publicApiError(PUBLIC_API_ERRORS.internal, 500);
    }
  };
}

/** Build a GET handler for a single `?id=N` route (404 when the fetch misses). */
export function idQueryRoute<T>(options: {
  logLabel: string;
  fetch: (id: number) => Promise<T | null>;
}): (request: NextRequest) => Promise<Response> {
  const { logLabel, fetch } = options;
  return async (request: NextRequest) => {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!id || !Number.isFinite(id)) {
      return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
    }
    try {
      const data = await fetch(id);
      if (!data) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
      return cachedJson(data);
    } catch (error) {
      console.error(`Error fetching ${logLabel}:`, error);
      return publicApiError(PUBLIC_API_ERRORS.internal, 500);
    }
  };
}

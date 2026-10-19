import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError, tooManyIdsError } from '@/lib/api/public-api-errors';

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

export function idsQueryRoute<T>(options: {
  maxIds: number;
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

export function idQueryRoute<T>(options: {
  logLabel: string;
  fetch: (id: number) => Promise<T | null>;
}): (request: NextRequest) => Promise<Response> {
  const { logLabel, fetch } = options;
  return async (request: NextRequest) => {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {
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

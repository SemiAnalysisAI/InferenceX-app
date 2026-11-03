import type { NextRequest } from 'next/server';

import { cachedJsonResponse } from '@/lib/cache/api-cache';
import { loadBenchmarks, parseBenchmarksQuery } from '@/lib/benchmarks/benchmarks-endpoint.server';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';

export const dynamic = 'force-dynamic';

const benchmarksResponse = cachedJsonResponse(loadBenchmarks, 'benchmarks-response-v1');

export async function GET(request: NextRequest) {
  const query = parseBenchmarksQuery(request.nextUrl.searchParams);
  if (query instanceof Response) return query;
  try {
    return await benchmarksResponse(request, query);
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

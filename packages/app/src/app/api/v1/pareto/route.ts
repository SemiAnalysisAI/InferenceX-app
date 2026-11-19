import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import { computeParetoResponse, parseParetoRequest } from '@/lib/api/pareto-api';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { loadBenchmarks, parseBenchmarksQuery } from '@/lib/benchmarks/benchmarks-endpoint.server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let parsed: ReturnType<typeof parseParetoRequest>;
  try {
    parsed = parseParetoRequest(request.nextUrl.searchParams);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const query = parseBenchmarksQuery(parsed.sourceParams);
  if (query instanceof Response) return query;
  try {
    const rows = await loadBenchmarks(query);
    return cachedJson(
      request,
      computeParetoResponse(rows, parsed.selection, `/api/v1/benchmarks?${parsed.sourceParams}`),
    );
  } catch (error) {
    console.error('Error computing Pareto boundaries:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

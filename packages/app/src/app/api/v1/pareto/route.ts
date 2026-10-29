import { NextRequest, NextResponse } from 'next/server';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson } from '@/lib/cache/api-cache';
import { computeParetoResponse, parseParetoRequest } from '@/lib/api/pareto-api';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { GET as getBenchmarks } from '../benchmarks/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let parsed: ReturnType<typeof parseParetoRequest>;
  try {
    parsed = parseParetoRequest(request.nextUrl.searchParams);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  try {
    // Reuse the raw endpoint's cache, fixture mode, snapshot and power-validity semantics.
    const url = new URL('/api/v1/benchmarks', request.url);
    url.search = parsed.sourceParams.toString();
    // The source request carries no Accept-Encoding, so cachedJson answers with plain JSON.
    const response = await getBenchmarks(new NextRequest(url));
    if (!response.ok) return response;
    const rows: BenchmarkRow[] = await response.json();
    return cachedJson(
      request,
      computeParetoResponse(rows, parsed.selection, `${url.pathname}${url.search}`),
    );
  } catch (error) {
    console.error('Error computing Pareto boundaries:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

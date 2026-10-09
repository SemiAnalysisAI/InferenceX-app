import { NextRequest, NextResponse } from 'next/server';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson } from '@/lib/api-cache';
import { computeParetoResponse, parseParetoRequest } from '@/lib/pareto-api';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/public-api-errors';
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
    const response = await getBenchmarks(new NextRequest(url));
    if (!response.ok) return response;
    // Direct handler calls do not pass through fetch's automatic decompression.
    // cachedJson streams gzip even for fixture responses.
    const decoded =
      response.headers.get('Content-Encoding') === 'gzip' && response.body
        ? new Response(response.body.pipeThrough(new DecompressionStream('gzip')))
        : response;
    const rows: BenchmarkRow[] = await decoded.json();
    return cachedJson(
      computeParetoResponse(rows, parsed.selection, `${url.pathname}${url.search}`),
    );
  } catch (error) {
    console.error('Error computing Pareto boundaries:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

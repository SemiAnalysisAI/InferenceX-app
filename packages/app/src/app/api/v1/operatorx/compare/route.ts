import { type NextRequest, NextResponse } from 'next/server';

import { errorStatus, getComparison } from '@/lib/operatorx/service';
import { comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPS = new Set(['gemm', 'moe']);

/** Cross-hardware comparison of one op's workload source (default: the best-covered). */
export async function GET(request: NextRequest) {
  const op = request.nextUrl.searchParams.get('op') ?? '';
  if (!OPS.has(op)) return NextResponse.json({ error: 'op must be gemm or moe' }, { status: 400 });
  try {
    const comparison = await getComparison(op as 'gemm' | 'moe');
    const view = comparisonView(comparison, request.nextUrl.searchParams.get('workload'));
    return NextResponse.json(view, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('OperatorX comparison', error);
    return NextResponse.json(
      { error: 'OperatorX comparison unavailable' },
      { status: errorStatus(error) },
    );
  }
}

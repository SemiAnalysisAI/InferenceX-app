import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/api-cache';
import {
  errorMessage,
  errorStatus,
  getComparison,
  isPartialComparison,
} from '@/lib/operatorx/service';
import { comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPS = new Set(['gemm', 'moe']);

/**
 * Cross-hardware comparison of one op's workload source (default: the best-covered), or of
 * every case one model contributes (`model`).
 */
export async function GET(request: NextRequest) {
  const op = request.nextUrl.searchParams.get('op') ?? '';
  if (!OPS.has(op)) return NextResponse.json({ error: 'op must be gemm or moe' }, { status: 400 });
  try {
    const comparison = await getComparison(op as 'gemm' | 'moe');
    const params = request.nextUrl.searchParams;
    const view = comparisonView(comparison, params.get('workload'), params.get('model'));
    // A comparison missing an unreadable run is served but not cached.
    return isPartialComparison(comparison)
      ? NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } })
      : cachedJson(view, { tag: operatorXCacheTag() });
  } catch (error) {
    console.error('OperatorX comparison', error);
    return NextResponse.json(
      { error: errorMessage(error, 'OperatorX comparison unavailable') },
      { status: errorStatus(error) },
    );
  }
}

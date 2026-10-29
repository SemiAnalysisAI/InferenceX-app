import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/cache/api-cache';
import { METRICS } from '@/components/operatorx/compare/metrics';
import { distributionView } from '@/lib/operatorx/distribution-view';
import {
  errorMessage,
  errorStatus,
  getComparison,
  isPartialComparison,
} from '@/lib/operatorx/service';
import { type ComparisonOp, comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPS = new Set(['gemm', 'moe', 'attention']);

/**
 * Cross-hardware comparison of one op family's workload source (default: the
 * best-covered), or of every case one model contributes (`model`), at one device split
 * (`parallel`, e.g. `tp8`; default: one device).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const op = params.get('op') ?? '';
  if (!OPS.has(op))
    return NextResponse.json({ error: 'op must be gemm, moe or attention' }, { status: 400 });
  const distributionRequested = [
    'distributionMetric',
    'distributionHardware',
    'distributionMatchedOnly',
    'distributionNormalized',
  ].some((key) => params.has(key));
  const metric = params.get('distributionMetric') ?? 'tflops';
  const matched = params.get('distributionMatchedOnly') ?? 'true';
  const normalized = params.get('distributionNormalized') ?? 'false';
  if (
    distributionRequested &&
    (!METRICS.some((candidate) => candidate.id === metric) ||
      !['true', 'false'].includes(matched) ||
      !['true', 'false'].includes(normalized))
  )
    return NextResponse.json({ error: 'Invalid distribution parameters' }, { status: 400 });
  try {
    const comparison = await getComparison(op as ComparisonOp);
    const view = comparisonView(
      comparison,
      params.get('workload'),
      params.get('model'),
      params.get('parallel'),
    );
    const requestedHardware = params.get('distributionHardware');
    const hardware =
      requestedHardware === null
        ? view.hardware.map((item) => item.id)
        : requestedHardware.split(',').map((key) => key.trim());
    if (
      distributionRequested &&
      (hardware.length === 0 ||
        hardware.some((key) => !view.hardware.some((item) => item.id === key)))
    )
      return NextResponse.json({ error: 'Invalid distribution hardware' }, { status: 400 });
    const body = distributionRequested
      ? {
          ...view,
          distribution: distributionView(view, {
            metric: metric as (typeof METRICS)[number]['id'],
            hardware,
            matchedOnly: matched === 'true',
            normalized: normalized === 'true',
          }),
        }
      : view;
    // A comparison missing an unreadable run is served but not cached.
    return isPartialComparison(comparison)
      ? NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
      : cachedJson(request, body, { tag: operatorXCacheTag() });
  } catch (error) {
    console.error('OperatorX comparison', error);
    return NextResponse.json(
      { error: errorMessage(error, 'OperatorX comparison unavailable') },
      { status: errorStatus(error) },
    );
  }
}

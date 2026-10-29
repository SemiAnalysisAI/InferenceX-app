import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/cache/api-cache';
import { METRICS } from '@/components/operatorx/compare/metrics';
import { distributionView } from '@/lib/operatorx/distribution-view';
import { rooflineSummary } from '@/lib/operatorx/roofline-summary';
import {
  errorMessage,
  errorStatus,
  getComparison,
  isPartialComparison,
} from '@/lib/operatorx/service';
import {
  comparisonView,
  type ComputePrecision,
} from '@semianalysisai/inferencex-db/operatorx/compare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPS = new Set(['gemm', 'moe']);

/** Cross-hardware comparison of one op's workload source (default: the best-covered). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const op = params.get('op') ?? '';
  if (!OPS.has(op)) return NextResponse.json({ error: 'op must be gemm or moe' }, { status: 400 });
  const distributionRequested = [
    'distributionMetric',
    'distributionHardware',
    'distributionMatchedOnly',
    'distributionNormalized',
  ].some((key) => params.has(key));
  const metric = params.get('distributionMetric') ?? 'tflops';
  const matched = params.get('distributionMatchedOnly') ?? 'true';
  const normalized = params.get('distributionNormalized') ?? 'false';
  const summaryRequested = ['rooflinePrecision', 'rooflineHardware', 'rooflineNormalized'].some(
    (key) => params.has(key),
  );
  const summaryPrecision = params.get('rooflinePrecision');
  const summaryNormalized = params.get('rooflineNormalized') ?? 'true';
  if (
    summaryRequested &&
    ((summaryPrecision !== null && !['bf16', 'fp8', 'fp4'].includes(summaryPrecision)) ||
      !['true', 'false'].includes(summaryNormalized))
  )
    return NextResponse.json({ error: 'Invalid roofline summary parameters' }, { status: 400 });
  if (
    distributionRequested &&
    (!METRICS.some((candidate) => candidate.id === metric) ||
      !['true', 'false'].includes(matched) ||
      !['true', 'false'].includes(normalized))
  )
    return NextResponse.json({ error: 'Invalid distribution parameters' }, { status: 400 });
  try {
    const comparison = await getComparison(op as 'gemm' | 'moe');
    const view = comparisonView(comparison, params.get('workload'));
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
    const summaryHardware = params.has('rooflineHardware')
      ? params
          .get('rooflineHardware')!
          .split(',')
          .map((hw) => hw.trim())
      : view.hardware.map((hw) => hw.id);
    if (
      summaryRequested &&
      summaryHardware.some((hw) => !view.hardware.some((item) => item.id === hw))
    )
      return NextResponse.json({ error: 'Invalid roofline hardware' }, { status: 400 });
    const body = {
      ...view,
      ...(distributionRequested
        ? {
            distribution: distributionView(view, {
              metric: metric as (typeof METRICS)[number]['id'],
              hardware,
              matchedOnly: matched === 'true',
              normalized: normalized === 'true',
            }),
          }
        : {}),
      ...(summaryRequested
        ? {
            rooflineSummary: rooflineSummary(view, {
              precision:
                (summaryPrecision as ComputePrecision | null) ?? view.defaults.rooflinePrecision,
              hardware: summaryHardware,
              normalized: summaryNormalized === 'true',
            }),
          }
        : {}),
    };
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

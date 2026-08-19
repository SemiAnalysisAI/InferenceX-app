import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { CHART_SERIES_VERSION } from '@semianalysisai/inferencex-db/etl/compute-chart-series';
import {
  getTraceServerMetricSource,
  type MetricSourceSeries,
} from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `trace-server-metric-source-v${CHART_SERIES_VERSION}`;

const getCachedMetricSource = cachedQuery(
  (id: number, source: string): Promise<MetricSourceSeries | null> =>
    getTraceServerMetricSource(getDb(), id, source),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/** GET /api/v1/trace-server-metric-source?id=N&source=SOURCE_ID */
export async function GET(request: NextRequest): Promise<Response> {
  const id = Number(request.nextUrl.searchParams.get('id'));
  const source = request.nextUrl.searchParams.get('source')?.trim();
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'id is required (benchmark_result_id)' }, { status: 400 });
  }
  if (!source || source.length > 512) {
    return NextResponse.json({ error: 'source is required' }, { status: 400 });
  }
  try {
    const data = await getCachedMetricSource(id, source);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching trace server metric source:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

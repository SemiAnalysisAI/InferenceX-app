import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getRequestChartData,
  REQUEST_CHART_DATA_VERSION,
  type RequestChartDataWire,
} from '@semianalysisai/inferencex-db/queries/request-chart-data';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `request-chart-data-v${REQUEST_CHART_DATA_VERSION}`;

const getCachedRequestChartData = cachedQuery(
  (id: number): Promise<RequestChartDataWire | null> => getRequestChartData(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/**
 * GET /api/v1/request-chart-data?id=N
 *
 * Returns the compact request fields used by the default point charts. The
 * full request timeline remains a separate, timeline-view-only download.
 */
export const GET = idQueryRoute({
  logLabel: 'request chart data',
  fetch: getCachedRequestChartData,
});

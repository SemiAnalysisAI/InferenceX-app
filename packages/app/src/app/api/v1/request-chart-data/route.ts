import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getRequestChartData,
  REQUEST_CHART_DATA_VERSION,
  type RequestChartDataWire,
} from '@semianalysisai/inferencex-db/queries/request-chart-data';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `request-chart-data-v${REQUEST_CHART_DATA_VERSION}`;

const getCachedRequestChartData = cachedQuery(
  (id: number): Promise<RequestChartDataWire | null> => getRequestChartData(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

export const GET = idQueryRoute({
  logLabel: 'request chart data',
  fetch: getCachedRequestChartData,
});

import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getTraceServerMetrics,
  type TraceServerMetrics,
} from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedTraceServerMetrics = cachedQuery(
  (id: number): Promise<TraceServerMetrics | null> => getTraceServerMetrics(getDb(), id),
  'trace-server-metrics',
  { blobOnly: true },
);

/**
 * GET /api/v1/trace-server-metrics?id=N
 *
 * Returns parsed time-series for the agentic detail view: KV cache usage,
 * prefix cache hit rate per interval, queue depth, and per-source prompt
 * token rates. Times are in seconds from benchmark start. 404 if the point
 * has no stored server_metrics_export.json blob.
 */
export const GET = idQueryRoute({
  logLabel: 'trace server metrics',
  fetch: getCachedTraceServerMetrics,
});

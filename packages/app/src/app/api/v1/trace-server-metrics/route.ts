import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  getTraceServerMetrics,
  type TraceServerMetrics,
} from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// chart_series is canonical DB data. Ingest/backfill operations purge Blob and
// Next.js caches through /api/v1/invalidate after changing it.
export const CACHE_KEY_PREFIX = 'trace-server-metrics';

const getCachedTraceServerMetrics = cachedQuery(
  (id: number): Promise<TraceServerMetrics | null> => {
    if (JSON_MODE) return jsonProvider.getTraceServerMetrics(id);
    return getTraceServerMetrics(getDb(), id);
  },
  CACHE_KEY_PREFIX,
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

import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getTraceServerMetrics,
  TRACE_SERVER_METRICS_VERSION,
  type TraceServerMetrics,
} from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// Key derived from TRACE_SERVER_METRICS_VERSION (governs chart_series plus
// the separately queried point-metadata payload).
// The blob cache is write-once with no post-backfill purge, so the
// version-derived key is what rolls the namespace on a bump — a hand-written
// string would serve stale blob-cached series forever.
/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `trace-server-metrics-v${TRACE_SERVER_METRICS_VERSION}`;

const getCachedTraceServerMetrics = cachedQuery(
  (id: number): Promise<TraceServerMetrics | null> => getTraceServerMetrics(getDb(), id),
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

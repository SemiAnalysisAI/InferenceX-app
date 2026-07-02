import { STATS_VERSION } from '@semianalysisai/inferencex-db/queries/agentic-aggregates';
import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  getDerivedAgenticMetrics,
  type DerivedAgenticMetricMap,
} from '@semianalysisai/inferencex-db/queries/derived-agentic-metrics';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// blobOnly: the response is one entry per id with two numbers, but the
// derivation work parses thousands of JSONL records per blob — cache the
// computed result so a chart-refresh hits the warm path.
//
// The cache key is derived from STATS_VERSION (the payload governs the derived
// metrics read out of `aggregate_stats`). blobSet is write-once and nothing
// purges post-backfill, so a hand-written version string would serve stale
// data forever after a bump — deriving the key from the constant means a
// STATS_VERSION bump automatically rolls the cache namespace.
/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `derived-agentic-metrics-v${STATS_VERSION}`;

const getCachedDerivedAgenticMetrics = cachedQuery(
  (ids: number[]): Promise<DerivedAgenticMetricMap> => {
    if (JSON_MODE) return Promise.resolve(jsonProvider.getDerivedAgenticMetrics(ids));
    return getDerivedAgenticMetrics(getDb(), ids);
  },
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/**
 * GET /api/v1/derived-agentic-metrics?ids=1,2,3
 *
 * Returns per-id derived metrics computed live from the stored aiperf
 * profile_export.jsonl blobs:
 *  - normalized_session_time_s: mean across sessions of session e2e time
 *    (Σ per-turn request_latency) rescaled by mean_load / session_load.
 *  - p90_prefill_tps_per_user: P90 of per-turn prefill TPS/user (ISL / TTFT)
 *    across every turn in every session.
 *  - p75/p90_normalized_e2e_400_s: percentile of per-request
 *    TTFT + 399 × observed ITL.
 *
 * Ids without a trace_replay blob or with unparseable records are omitted.
 */
export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'derived agentic metrics',
  fetch: getCachedDerivedAgenticMetrics,
});

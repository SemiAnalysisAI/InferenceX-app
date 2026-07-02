import { getDb } from '@semianalysisai/inferencex-db/connection';
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
// Bumped to v3 for per-request normalized-E2E @ 400 output tokens.
// Stale v1 cache entries return undefined for the new field and silently
// blank the chart with "No data available".
const getCachedDerivedAgenticMetrics = cachedQuery(
  (ids: number[]): Promise<DerivedAgenticMetricMap> => getDerivedAgenticMetrics(getDb(), ids),
  'derived-agentic-metrics-v3',
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

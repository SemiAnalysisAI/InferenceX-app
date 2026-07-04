import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  getTraceHistograms,
  type TraceHistogramMap,
} from '@semianalysisai/inferencex-db/queries/trace-histograms';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// blobOnly: a 50-id histogram payload can easily exceed Next.js's 2MB
// unstable_cache limit (each point carries one int per request, ~500-1000+
// requests for agentic), which manifests as a 500 from the route. Blob
// storage lets us cache the larger response without losing the warm-cache hit.
//
// Key derived from REQUEST_TIMELINE_VERSION: the histograms are read out of the
// `request_timeline` payload (getTraceHistograms keys its fast path off that
// constant). The blob cache is write-once with no post-backfill purge, so the
// version-derived key is what rolls the namespace on a bump — the previously
// unversioned key would serve stale histograms forever.
export const CACHE_KEY_PREFIX = `trace-histograms-v${REQUEST_TIMELINE_VERSION}`;

const getCachedTraceHistograms = cachedQuery(
  (ids: number[]): Promise<TraceHistogramMap> => {
    if (JSON_MODE) return Promise.resolve(jsonProvider.getTraceHistograms(ids));
    return getTraceHistograms(getDb(), ids);
  },
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/**
 * GET /api/v1/trace-histograms?ids=1,2,3
 *
 * Returns per-request ISL/OSL arrays parsed from the stored aiperf
 * `profile_export.jsonl` blobs, keyed by `benchmark_results.id`.
 * Ids without a trace_replay blob are omitted from the response.
 */
export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'trace histograms',
  fetch: getCachedTraceHistograms,
});

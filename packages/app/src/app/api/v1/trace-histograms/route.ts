import { getDb } from '@semianalysisai/inferencex-db/connection';
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
const getCachedTraceHistograms = cachedQuery(
  (ids: number[]): Promise<TraceHistogramMap> => getTraceHistograms(getDb(), ids),
  'trace-histograms',
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

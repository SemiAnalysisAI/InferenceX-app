import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getAgenticAggregates,
  type AgenticAggregateMap,
} from '@semianalysisai/inferencex-db/queries/agentic-aggregates';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// blobOnly: response stays small (a few numbers per id), but generating it
// parses ~5-10 MB of decompressed JSONL + JSON per id. Cache so the
// "Aggregates" toggle stays snappy.
const getCachedAgenticAggregates = cachedQuery(
  (ids: number[]): Promise<AgenticAggregateMap> => getAgenticAggregates(getDb(), ids),
  'agentic-aggregates',
  { blobOnly: true },
);

/**
 * GET /api/v1/agentic-aggregates?ids=1,2,3
 *
 * Returns per-id mean/p50/p75/p90/p99 for ISL, OSL, KV cache utilization,
 * and prefix cache hit rate — computed live from the stored aiperf
 * profile_export.jsonl + server_metrics_json blobs. Ids without a
 * trace_replay blob (or with no usable samples) get nulls.
 */
export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'agentic aggregates',
  fetch: getCachedAgenticAggregates,
});

import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getAgenticAggregates,
  STATS_VERSION,
  type AgenticAggregateMap,
} from '@semianalysisai/inferencex-db/queries/agentic-aggregates';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// blobOnly: response stays small (a few numbers per id), but generating it
// parses ~5-10 MB of decompressed JSONL + JSON per id. Cache so the
// "Aggregates" toggle stays snappy.
//
// Key derived from STATS_VERSION (governs the `aggregate_stats` payload). The
// blob cache is write-once with no post-backfill purge, so deriving the key
// from the constant is what rolls the namespace on a version bump — a
// hand-written string would pin the route to stale blob hits forever.
/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `agentic-aggregates-v${STATS_VERSION}`;

const getCachedAgenticAggregates = cachedQuery(
  (ids: number[]): Promise<AgenticAggregateMap> => getAgenticAggregates(getDb(), ids),
  CACHE_KEY_PREFIX,
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

import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getRequestTimeline,
  type RequestTimeline,
} from '@semianalysisai/inferencex-db/queries/request-timeline';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// Key derived from REQUEST_TIMELINE_VERSION (governs the `request_timeline`
// payload). The blob cache is write-once with no post-backfill purge, so the
// version-derived key is what rolls the namespace on a bump — a hand-written
// string would serve stale blob-cached timelines forever.
/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `request-timeline-v${REQUEST_TIMELINE_VERSION}`;

const getCachedRequestTimeline = cachedQuery(
  (id: number): Promise<RequestTimeline | null> => getRequestTimeline(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/**
 * GET /api/v1/request-timeline?id=N
 *
 * Returns the per-request Gantt timeline for one agentic benchmark point.
 * Each request entry has ns-from-start offsets for credit/start/ack/end,
 * plus TTFT, ISL, OSL, conversation id, turn index, worker id. 404 if the
 * point has no stored profile_export.jsonl blob.
 */
export const GET = idQueryRoute({
  logLabel: 'request timeline',
  fetch: getCachedRequestTimeline,
});

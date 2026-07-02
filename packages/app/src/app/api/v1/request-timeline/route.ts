import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getRequestTimeline,
  type RequestTimeline,
} from '@semianalysisai/inferencex-db/queries/request-timeline';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedRequestTimeline = cachedQuery(
  (id: number): Promise<RequestTimeline | null> => getRequestTimeline(getDb(), id),
  'request-timeline',
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

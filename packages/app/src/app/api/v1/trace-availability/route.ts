import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getTraceAvailability,
  type TraceAvailabilityMap,
} from '@semianalysisai/inferencex-db/queries/trace-availability';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedTraceAvailability = cachedQuery(
  (ids: number[]): Promise<TraceAvailabilityMap> => getTraceAvailability(getDb(), ids),
  'trace-availability',
);

/**
 * GET /api/v1/trace-availability?ids=1,2,3
 *
 * Returns `{[id]: true}` for ids that have a stored trace_replay blob.
 * Lightweight presence check used by the scatter tooltip to decide whether
 * to render the "View charts" button — see queries/trace-availability.ts.
 */
export const GET = idsQueryRoute({
  maxIds: 500,
  logLabel: 'trace availability',
  fetch: getCachedTraceAvailability,
});

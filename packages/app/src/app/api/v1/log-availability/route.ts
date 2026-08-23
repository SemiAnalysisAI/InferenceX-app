import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getServerLogAvailability,
  type ServerLogAvailabilityMap,
} from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedServerLogAvailability = cachedQuery(
  (ids: number[]): Promise<ServerLogAvailabilityMap> => getServerLogAvailability(getDb(), ids),
  'server-log-availability',
);

/**
 * GET /api/v1/log-availability?ids=1,2,3
 *
 * Returns `{[id]: true}` for benchmark points with a linked server log. The
 * chart uses this lightweight check before offering its "View logs" action.
 */
export const GET = idsQueryRoute({
  maxIds: 500,
  logLabel: 'server log availability',
  fetch: getCachedServerLogAvailability,
});

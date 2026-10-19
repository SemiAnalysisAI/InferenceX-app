import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getServerLogAvailability,
  type ServerLogAvailabilityMap,
} from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedServerLogAvailability = cachedQuery(
  (ids: number[]): Promise<ServerLogAvailabilityMap> => getServerLogAvailability(getDb(), ids),
  'server-log-availability',
);

export const GET = idsQueryRoute({
  maxIds: 500,
  logLabel: 'server log availability',
  fetch: getCachedServerLogAvailability,
});

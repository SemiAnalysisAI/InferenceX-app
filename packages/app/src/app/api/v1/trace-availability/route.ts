import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getTraceAvailability,
  type TraceAvailabilityMap,
} from '@semianalysisai/inferencex-db/queries/trace-availability';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedTraceAvailability = cachedQuery(
  (ids: number[]): Promise<TraceAvailabilityMap> => getTraceAvailability(getDb(), ids),
  'trace-availability',
);

export const GET = idsQueryRoute({
  maxIds: 500,
  logLabel: 'trace availability',
  fetch: getCachedTraceAvailability,
});

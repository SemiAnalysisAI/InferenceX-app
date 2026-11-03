import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getBenchmarkPresence } from '@semianalysisai/inferencex-db/queries/benchmark-presence';

import { cachedQuery } from '@/lib/cache/api-cache';

/**
 * Trace and server-log presence for every point. One cache entry serves the
 * dashboard's presence route and every `?ids=` availability lookup.
 */
export const getCachedBenchmarkPresence = cachedQuery(
  () => getBenchmarkPresence(getDb()),
  'benchmark-presence',
);

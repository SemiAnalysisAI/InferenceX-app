import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getBenchmarkPresence } from '@semianalysisai/inferencex-db/queries/benchmark-presence';

import { cachedQuery } from '@/lib/cache/api-cache';

export const getCachedBenchmarkPresence = cachedQuery(
  () => getBenchmarkPresence(getDb()),
  'benchmark-presence',
);

import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import {
  getBenchmarkPresence,
  mergeBenchmarkPresence,
} from '@semianalysisai/inferencex-db/queries/benchmark-presence';

import { cachedQuery } from '@/lib/cache/api-cache';

export const getCachedBenchmarkPresence = cachedQuery(
  async () => mergeBenchmarkPresence(await readEachDb((sql) => getBenchmarkPresence(sql))),
  'benchmark-presence',
);

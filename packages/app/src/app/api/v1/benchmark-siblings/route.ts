import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getBenchmarkSiblings,
  type BenchmarkSiblings,
} from '@semianalysisai/inferencex-db/queries/benchmark-siblings';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedSiblings = cachedQuery(
  (id: number): Promise<BenchmarkSiblings | null> => getBenchmarkSiblings(getDb(), id),
  'benchmark-siblings-v3',
);

export const GET = idQueryRoute({
  logLabel: 'benchmark siblings',
  fetch: getCachedSiblings,
});

import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeReliabilityStats } from '@semianalysisai/inferencex-db/queries/across-dbs';
import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { sumReliabilityByDay } from '@/components/reliability/daily-totals';
import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'reliability-daily',
  fetch: async () =>
    sumReliabilityByDay(mergeReliabilityStats(await readEachDb(getReliabilityStats))),
  fixture: () => sumReliabilityByDay(loadFixture('reliability')),
  logLabel: 'daily reliability stats',
});

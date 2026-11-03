import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { sumReliabilityByDay } from '@/components/reliability/daily-totals';
import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

/** The `/reliability` dashboard's input: `/api/v1/reliability` rows summed per day and GPU. */
export const GET = cachedReadRoute({
  cacheKey: 'reliability-daily',
  fetch: async () => sumReliabilityByDay(await getReliabilityStats(getDb())),
  fixture: () => sumReliabilityByDay(loadFixture('reliability')),
  logLabel: 'daily reliability stats',
});

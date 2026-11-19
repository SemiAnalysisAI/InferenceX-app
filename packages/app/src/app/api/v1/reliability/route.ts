import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeReliabilityStats } from '@semianalysisai/inferencex-db/queries/across-dbs';
import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'reliability',
  fetch: async () => mergeReliabilityStats(await readEachDb(getReliabilityStats)),
  fixture: () => loadFixture('reliability'),
  logLabel: 'reliability stats',
});

import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { cachedReadRoute } from '@/lib/cached-read-route';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'reliability',
  fetch: () => getReliabilityStats(getDb()),
  fixture: () => loadFixture('reliability'),
  logLabel: 'reliability stats',
});

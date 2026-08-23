import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getAvailabilityData } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedReadRoute } from '@/lib/cached-read-route';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'availability',
  fetch: () => getAvailabilityData(getDb()),
  fixture: () => loadFixture('availability'),
  logLabel: 'availability',
});

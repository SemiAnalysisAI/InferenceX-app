import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeAvailabilityRows } from '@semianalysisai/inferencex-db/queries/across-dbs';
import { getAvailabilityData } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'availability',
  fetch: async () => mergeAvailabilityRows(await readEachDb(getAvailabilityData)),
  fixture: () => loadFixture('availability'),
  logLabel: 'availability',
});

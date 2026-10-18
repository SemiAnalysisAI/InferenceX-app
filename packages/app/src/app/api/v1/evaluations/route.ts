import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'evaluations',
  fetch: () => getAllEvalResults(getDb()),
  fixture: () => loadFixture('evaluations'),
  logLabel: 'evaluations',
});

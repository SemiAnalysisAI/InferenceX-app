import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { compactEvalRows } from '@/components/evaluation/compact-rows';
import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'evaluations-compact',
  fetch: async () => compactEvalRows(await getAllEvalResults(getDb())),
  fixture: () => compactEvalRows(loadFixture('evaluations')),
  logLabel: 'compact evaluations',
});

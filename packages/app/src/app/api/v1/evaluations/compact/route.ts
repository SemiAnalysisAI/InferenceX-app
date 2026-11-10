import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeEvalResults } from '@semianalysisai/inferencex-db/queries/across-dbs';
import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { compactEvalRows } from '@/components/evaluation/compact-rows';
import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'evaluations-compact',
  fetch: async () => compactEvalRows(mergeEvalResults(await readEachDb(getAllEvalResults))),
  fixture: () => compactEvalRows(loadFixture('evaluations')),
  logLabel: 'compact evaluations',
});

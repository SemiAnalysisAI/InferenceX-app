import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeEvalResults } from '@semianalysisai/inferencex-db/queries/across-dbs';
import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'evaluations',
  fetch: async () => mergeEvalResults(await readEachDb(getAllEvalResults)),
  fixture: () => loadFixture('evaluations'),
  logLabel: 'evaluations',
});

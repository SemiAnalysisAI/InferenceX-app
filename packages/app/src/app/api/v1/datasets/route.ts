import { getDb } from '@semianalysisai/inferencex-db/connection';

import { listDatasets, type DatasetRecord } from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedReadRoute } from '@/lib/api/cached-read-route';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute<DatasetRecord[]>({
  cacheKey: 'datasets',
  fetch: () => listDatasets(getDb()),
  logLabel: 'datasets',
});

import { getDb } from '@semianalysisai/inferencex-db/connection';

import { listDatasets, type DatasetRecord } from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedReadRoute } from '@/lib/cached-read-route';

export const dynamic = 'force-dynamic';

/** GET /api/v1/datasets — all ingested cc-traces-weka datasets (registry cards). */
export const GET = cachedReadRoute<DatasetRecord[]>({
  cacheKey: 'datasets',
  fetch: () => listDatasets(getDb()),
  logLabel: 'datasets',
});

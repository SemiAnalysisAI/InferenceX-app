import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getLatestImages } from '@semianalysisai/inferencex-db/queries/latest-images';

import { cachedReadRoute } from '@/lib/cached-read-route';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  // v3: rows carry benchmark_type and nullable isl/osl so AgentX rows are labeled.
  cacheKey: 'latest-images-v3',
  fetch: () => getLatestImages(getDb()),
  logLabel: 'latest images',
  blobOnly: true,
});

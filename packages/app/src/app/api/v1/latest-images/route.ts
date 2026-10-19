import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getLatestImages } from '@semianalysisai/inferencex-db/queries/latest-images';

import { cachedReadRoute } from '@/lib/api/cached-read-route';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'latest-images-v4',
  fetch: () => getLatestImages(getDb()),
  logLabel: 'latest images',
  blobOnly: true,
});

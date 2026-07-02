import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getLatestImages } from '@semianalysisai/inferencex-db/queries/latest-images';

import { createCachedRoute } from '@/lib/create-cached-route';

export const dynamic = 'force-dynamic';

export const GET = createCachedRoute(() => getLatestImages(getDb()), 'latest-images', {
  resource: 'latest images',
  cacheOptions: { blobOnly: true },
});

import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';
import { mergeLatestImages } from '@semianalysisai/inferencex-db/queries/across-dbs';
import { getLatestImages } from '@semianalysisai/inferencex-db/queries/latest-images';

import { cachedReadRoute } from '@/lib/api/cached-read-route';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  // v4: keep disaggregated and non-disaggregated configurations distinct.
  cacheKey: 'latest-images-v4',
  fetch: async () => mergeLatestImages(await readEachDb(getLatestImages)),
  logLabel: 'latest images',
  blobOnly: true,
});

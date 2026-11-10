import { getPayloadDb } from '@semianalysisai/inferencex-db/lib/payload-db';
import { getServerLogFileNames } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedServerLogFileNames = cachedQuery(
  async (id: number) => getServerLogFileNames(await getPayloadDb(id), id),
  'server-log-files',
);

/** GET /api/v1/server-log-files?id=1 — artifact-relative .log/.out filenames. */
export const GET = idQueryRoute({
  logLabel: 'server log filenames',
  fetch: getCachedServerLogFileNames,
});

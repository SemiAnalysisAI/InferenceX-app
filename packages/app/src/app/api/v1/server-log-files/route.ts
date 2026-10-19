import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getServerLogFileNames } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedServerLogFileNames = cachedQuery(
  (id: number) => getServerLogFileNames(getDb(), id),
  'server-log-files',
);

export const GET = idQueryRoute({
  logLabel: 'server log filenames',
  fetch: getCachedServerLogFileNames,
});

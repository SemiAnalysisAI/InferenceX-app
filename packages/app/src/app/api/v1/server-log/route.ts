import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getServerLog } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedQuery } from '@/lib/api-cache';
import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedServerLog = cachedQuery((id: number) => getServerLog(getDb(), id), 'server-log', {
  blobOnly: true,
});

export const GET = idQueryRoute({
  logLabel: 'server log',
  fetch: async (id: number) => {
    const serverLog = await getCachedServerLog(id);
    return serverLog === null ? null : { id, serverLog };
  },
});

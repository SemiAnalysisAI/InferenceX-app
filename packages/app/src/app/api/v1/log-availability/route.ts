import { getCachedBenchmarkPresence } from '@/lib/benchmarks/benchmark-presence.server';
import { presentIds } from '@/lib/benchmarks/benchmark-presence';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/log-availability?ids=1,2,3
 *
 * Returns `{[id]: true}` for benchmark points with a linked server log, read
 * from the cached presence set of every point (queries/benchmark-presence.ts).
 */
export const GET = idsQueryRoute({
  maxIds: 500,
  logLabel: 'server log availability',
  fetch: async (ids) => {
    const { log } = await getCachedBenchmarkPresence();
    return presentIds(log, ids);
  },
});

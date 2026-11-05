import { getCachedBenchmarkPresence } from '@/lib/benchmarks/benchmark-presence.server';
import { presentIds } from '@/lib/benchmarks/benchmark-presence';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/trace-availability?ids=1,2,3
 *
 * Returns `{[id]: true}` for ids that have a stored trace_replay blob, read
 * from the cached presence set of every point (queries/benchmark-presence.ts).
 */
export const GET = idsQueryRoute({
  maxIds: 500,
  logLabel: 'trace availability',
  fetch: async (ids) => {
    const { trace } = await getCachedBenchmarkPresence();
    return presentIds(trace, ids);
  },
});

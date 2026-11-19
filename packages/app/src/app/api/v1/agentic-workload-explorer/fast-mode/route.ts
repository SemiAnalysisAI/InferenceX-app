import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeFastModePayload,
  readStatsCache,
  statsCacheKey,
  type FastModePayload,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { coalesceCompute } from '@/lib/agentic-workload-explorer/stats-cache';

export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('fast-mode', vis, traceVersion);

  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return computeFastModePayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data as FastModePayload;
  }

  return (await coalesceCompute(key, async () => {
    const db = createDirectDb();
    try {
      return await computeAndCacheStatsKind(db, 'fast-mode', vis, traceVersion);
    } finally {
      await db.destroy();
    }
  })) as FastModePayload;
});

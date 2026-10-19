import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computePlatformPayload,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('platform', vis, traceVersion);

  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return computePlatformPayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  const db = createDirectDb();
  try {
    return await computeAndCacheStatsKind(db, 'platform', vis, traceVersion);
  } finally {
    await db.destroy();
  }
});

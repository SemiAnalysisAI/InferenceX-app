import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeTrafficPayload,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

// Served from stats_cache (cron-warmed ~every 15 min, self-healing on miss).
// The old inline path ran two full-table counts, a peak-hour GROUP BY, and a
// min/max window scan live on every request (~0.9–2.4 s). Payload is bounded
// (agg totals + 30-day daily + ≤168-cell heatmap + 30-day streaming split), so
// the finished JSON is cached wholesale. See packages/db/src/stats.ts.
export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('traffic', vis, traceVersion);

  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return computeTrafficPayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  const db = createDirectDb();
  try {
    return await computeAndCacheStatsKind(db, 'traffic', vis, traceVersion);
  } finally {
    await db.destroy();
  }
});

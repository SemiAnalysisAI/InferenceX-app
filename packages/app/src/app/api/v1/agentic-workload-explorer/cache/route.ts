import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeCachePayload,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

// Served from stats_cache (cron-warmed ~every 15 min, self-healing on miss).
// The old inline path ran full-table cache-token SUMs plus per-model and
// per-client GROUP BYs live on every request (~0.6–0.85 s). All parts of this
// payload are bounded (agg totals + 30-day daily + ≤44 models + ≤50 clients),
// so the finished JSON is cached wholesale. See packages/db/src/stats.ts.
export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('cache', vis, traceVersion);

  const cached = await readStatsCache(key);
  // migration 029 not yet applied — fall back to a live compute over HTTP.
  if (cached === 'missing-table') return computeCachePayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  // Cold miss: compute inline over pooled pg, cache, return.
  const db = createDirectDb();
  try {
    return await computeAndCacheStatsKind(db, 'cache', vis, traceVersion);
  } finally {
    await db.destroy();
  }
});

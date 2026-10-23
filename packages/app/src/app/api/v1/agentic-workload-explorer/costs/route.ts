import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeCostsPayload,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

// Served from stats_cache (cron-warmed ~every 15 min, self-healing on miss).
// The old inline path fired five full-history scans (summary, 30-day daily,
// per-model, per-client top-50, per-model token breakdown → costBreakdown).
// Payload is bounded, so the finished JSON — including the computed
// costBreakdown — is cached wholesale. See packages/db/src/stats.ts.
export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('costs', vis, traceVersion);

  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return computeCostsPayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  const db = createDirectDb();
  try {
    return await computeAndCacheStatsKind(db, 'costs', vis, traceVersion);
  } finally {
    await db.destroy();
  }
});

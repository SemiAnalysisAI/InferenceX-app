import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeSessionInsightsPayload,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

// Served from stats_cache (cron-warmed ~every 15 min, self-healing on miss).
// The old inline path was the single slowest endpoint (up to ~5.8 s at tv=7):
// it group-aggregated every visible session and paid the per-session
// sessionsVisFilter EXISTS tax. The per-session raw aggregates are NOT shipped
// — the duration/turn/cost histograms + percentiles are computed server-side
// (binning ported verbatim into packages/db/src/stats.ts) and only the bounded
// bins + stats + daily/hourly series are cached, so the finished JSON stays
// small and byte-identical to the old response.
export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('session-insights', vis, traceVersion);

  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return computeSessionInsightsPayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  const db = createDirectDb();
  try {
    return await computeAndCacheStatsKind(db, 'session-insights', vis, traceVersion);
  } finally {
    await db.destroy();
  }
});

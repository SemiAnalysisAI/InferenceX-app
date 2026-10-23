import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeErrorsPayload,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

// Served from stats_cache (cron-warmed ~every 15 min, self-healing on miss).
// The old inline path fired five full-history scans in parallel (summary,
// 48h timeline, status-code GROUP BY, per-model GROUP BY, recent 50) — ~1.4 s.
// Payload is bounded (agg + ≤48 timeline + few status codes + ≤44 models +
// ≤50 recent), so the finished JSON is cached wholesale. sanitizeModels is
// applied at compute time so the cached bytes match the old response.
export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const key = statsCacheKey('errors', vis, traceVersion);

  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return computeErrorsPayload(getDb(), vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  const db = createDirectDb();
  try {
    return await computeAndCacheStatsKind(db, 'errors', vis, traceVersion);
  } finally {
    await db.destroy();
  }
});

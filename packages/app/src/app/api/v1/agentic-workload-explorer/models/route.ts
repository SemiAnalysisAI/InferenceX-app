import { createDirectDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  getTokensByModel,
  getModelTimeSeries,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import {
  computeAndCacheModels,
  isRollupNotReadyError,
  readStatsCache,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { sanitizeModels } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';

// Served from stats_cache (per-model token totals + daily time-series come
// from rollup_requests_daily). Old inline path re-scanned the requests table
// on every request (13–15 s). See packages/db/src/stats.ts.
export const maxDuration = 300;

/** Pre-cache fallback (migration 029 not yet applied). Byte-identical to the
 * original handler. */
async function legacyModels(vis: string[] | null, tv: number | null) {
  const [tokensByModel, timeSeries] = await Promise.all([
    getTokensByModel(vis, null, tv),
    getModelTimeSeries(vis, tv),
  ]);
  return {
    tokensByModel: sanitizeModels(tokensByModel),
    timeSeries: sanitizeModels(timeSeries),
  };
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);

  const key = statsCacheKey('models', vis, traceVersion);
  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return legacyModels(vis, traceVersion);
  if (cached) {
    return cached.data;
  }

  // Cold miss: compute inline over pooled pg, cache, return.
  const db = createDirectDb();
  try {
    return await computeAndCacheModels(db, vis, traceVersion);
  } catch (error) {
    if (isRollupNotReadyError(error)) return legacyModels(vis, traceVersion);
    throw error;
  } finally {
    await db.destroy();
  }
});

import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheOverview,
  computeOverviewPayload,
  readStatsCache,
  statsCacheKey,
  isRollupNotReadyError,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import {
  getOverviewStats,
  getTokensByModel,
  getTTFTStats,
  getTPOTStats,
  getPrefillSpeedStats,
  getHourlyUsageCounts,
  getHourlyUsageCountsForUtcDay,
  getDailyUsageCounts,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseModelFilter, parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { computeCostBreakdown } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';

// The unfiltered overview is served from stats_cache, built once for the frozen
// snapshot; a miss is computed inline. The old inline path summed the whole
// requests table on every request (16–21 s over the Neon HTTP driver). See
// packages/db/src/proxytrace/stats.ts.
export const maxDuration = 300;

const hasErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;
const shouldUseLegacy = (error: unknown): boolean =>
  hasErrorCode(error, '42P01') || isRollupNotReadyError(error);

/**
 * Pre-cache assembly, kept as a fallback for a snapshot database that lacks
 * the stats_cache / rollup tables (e.g. a freshly reloaded snapshot whose
 * caches have not been rebuilt yet).
 */
async function legacyOverview(vis: string[] | null, model: string | null, tv: number | null) {
  const [
    stats,
    tokensByModel,
    ttftStats,
    tpotStats,
    prefillSpeedStats,
    usageHistogram,
    usageHistogramTodayUtc,
    usageHistogramYesterdayUtc,
    dailyUsageHistogram,
  ] = await Promise.all([
    getOverviewStats(vis, model, tv),
    getTokensByModel(vis, model, tv),
    getTTFTStats(vis, model, tv),
    getTPOTStats(vis, model, tv),
    getPrefillSpeedStats(vis, model, tv),
    getHourlyUsageCounts(vis, model, tv),
    getHourlyUsageCountsForUtcDay(vis, model, tv, 0),
    getHourlyUsageCountsForUtcDay(vis, model, tv, 1),
    getDailyUsageCounts(vis, model, tv),
  ]);
  return {
    ...stats,
    costBreakdown: computeCostBreakdown(tokensByModel),
    ttftStats,
    tpotStats,
    prefillSpeedStats,
    usageHistogram,
    usageHistogramTodayUtc,
    usageHistogramYesterdayUtc,
    dailyUsageHistogram,
  };
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const filter = parseModelFilter(req.nextUrl.searchParams);
  if (filter instanceof Response) return filter;
  const { model } = filter;
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);

  // Model-filtered views are not one of the warmed combos — compute directly
  // over the Neon HTTP driver using the optimized (rollup + indexed) queries.
  if (model !== null) {
    try {
      return await computeOverviewPayload(getDb(), vis, model, traceVersion);
    } catch (error) {
      if (shouldUseLegacy(error)) return legacyOverview(vis, model, traceVersion);
      throw error;
    }
  }

  const key = statsCacheKey('overview', vis, traceVersion);
  const cached = await readStatsCache(key);
  if (cached === 'missing-table') return legacyOverview(vis, null, traceVersion);
  if (cached) {
    return cached.data;
  }

  // Cold miss: compute inline over pooled pg (<3 s), cache, return.
  const db = createDirectDb();
  try {
    return await computeAndCacheOverview(db, vis, traceVersion);
  } catch (error) {
    if (shouldUseLegacy(error)) return legacyOverview(vis, null, traceVersion);
    throw error;
  } finally {
    await db.destroy();
  }
});

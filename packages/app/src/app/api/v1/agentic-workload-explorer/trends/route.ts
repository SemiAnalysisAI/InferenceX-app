import { createDirectDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  isRollupNotReadyError,
  readStatsCache,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import {
  computeAndCacheTrends,
  COMPACTION_CLIFF_DROP_RATIO,
  COMPACTION_IDLE_GAP_MS,
  COMPACTION_MIN_PREV_CACHE_READ,
  COMPACTION_WINDOW_DAYS,
  dailyCliVersionMix,
  dailyCompactionRate,
  dailyLatencyTrend,
  dailyModelLive,
  LATENCY_WINDOW_DAYS,
  sanitizeTrendsPayload,
  trendsCacheKey,
  type TrendsPayload,
} from '@semianalysisai/inferencex-db/proxytrace/trends';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { AS_OF_ISO } from '@semianalysisai/inferencex-db/proxytrace/shared/as-of';

export const maxDuration = 300;

async function legacyTrends(vis: string[] | null, tv: number | null): Promise<TrendsPayload> {
  const db = createDirectDb();
  try {
    const [dailyModel, dailyCompaction, dailyCliVersion, dailyLatency] = await Promise.all([
      dailyModelLive(db, vis, tv),
      dailyCompactionRate(db, vis, tv),
      dailyCliVersionMix(db, vis, tv),
      dailyLatencyTrend(db, vis, tv),
    ]);
    return {
      dailyModel,
      dailyCompaction,
      dailyCliVersion,
      dailyLatency,
      meta: {
        compactionWindowDays: COMPACTION_WINDOW_DAYS,
        latencyWindowDays: LATENCY_WINDOW_DAYS,
        compactionIdleGapMs: COMPACTION_IDLE_GAP_MS,
        compactionMinPrevCacheRead: COMPACTION_MIN_PREV_CACHE_READ,
        compactionCliffDropRatio: COMPACTION_CLIFF_DROP_RATIO,
        generatedAt: AS_OF_ISO,
      },
    };
  } finally {
    await db.destroy();
  }
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);

  const key = trendsCacheKey(vis, traceVersion);
  const cached = await readStatsCache(key);
  if (cached === 'missing-table')
    return sanitizeTrendsPayload(await legacyTrends(vis, traceVersion));
  if (cached) {
    return sanitizeTrendsPayload(cached.data as TrendsPayload);
  }

  const db = createDirectDb();
  try {
    return sanitizeTrendsPayload(await computeAndCacheTrends(db, vis, traceVersion));
  } catch (error) {
    if (isRollupNotReadyError(error)) {
      return sanitizeTrendsPayload(await legacyTrends(vis, traceVersion));
    }
    throw error;
  } finally {
    await db.destroy();
  }
});

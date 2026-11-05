import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computePerformanceStreamingPayload,
  computePerformancePayload,
  readStatsCache,
  statsCacheKey,
  type PerformancePayload,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseModelFilter, parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { coalesceCompute } from '@/lib/agentic-workload-explorer/stats-cache';

export const maxDuration = 300;

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const filter = parseModelFilter(req.nextUrl.searchParams);
  if (filter instanceof Response) return filter;
  const { model } = filter;
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);

  if (model !== null) {
    return computePerformanceStreamingPayload(getDb(), vis, model, traceVersion);
  }

  const key = statsCacheKey('performance', vis, traceVersion);
  const cached = await readStatsCache(key);
  if (cached === 'missing-table') {
    const payload = await computePerformancePayload(getDb(), vis, null, traceVersion);
    return payload.streaming;
  }
  if (cached) {
    return (cached.data as PerformancePayload).streaming;
  }

  const payload = (await coalesceCompute(key, async () => {
    const db = createDirectDb();
    try {
      return await computeAndCacheStatsKind(db, 'performance', vis, traceVersion);
    } finally {
      await db.destroy();
    }
  })) as PerformancePayload;
  return payload.streaming;
});

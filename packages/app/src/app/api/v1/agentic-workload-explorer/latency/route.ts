import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computePerformanceLatencyPayload,
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

  // Model filters are intentionally live and never cached: model is a
  // free-form, high-cardinality dimension. The returned payload is still
  // server-binned and bounded.
  if (model !== null) {
    return computePerformanceLatencyPayload(getDb(), vis, model, traceVersion);
  }

  const key = statsCacheKey('performance', vis, traceVersion);
  const cached = await readStatsCache(key);
  if (cached === 'missing-table') {
    const payload = await computePerformancePayload(getDb(), vis, null, traceVersion);
    return payload.latency;
  }
  if (cached) {
    return (cached.data as PerformancePayload).latency;
  }

  // Both performance routes coalesce on this one cache key, so simultaneous
  // cold latency/streaming requests share one pooled compute.
  const payload = (await coalesceCompute(key, async () => {
    const db = createDirectDb();
    try {
      return await computeAndCacheStatsKind(db, 'performance', vis, traceVersion);
    } finally {
      await db.destroy();
    }
  })) as PerformancePayload;
  return payload.latency;
});

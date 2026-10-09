import { isHarness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  getHarnessToolSample,
  getToolAnalytics,
  getToolTimings,
  readToolAnalyticsCache,
  toolAnalyticsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';

// Serves only from tool_analytics_cache — the underlying queries return one
// row per tool event and can't run inline at production scale (Neon HTTP
// 64 MB cap). The frozen snapshot is never recomputed: a miss returns
// `warming: true`, which the page shows as "not available in this snapshot".
//
// Standardized: always uses anon visibility and all trace versions so every
// user shares a single cache row per kind.
//
// `?harness=` has no cache row, so it runs the same queries live over a
// session sample of that harness (see getHarnessToolSample).
export const maxDuration = 300;

const VIS: string[] = [];
const TRACE_VERSION = null;

export const GET = withExplorerRoute(async ({ req }) => {
  const harness = req.nextUrl.searchParams.get('harness');
  if (isHarness(harness)) {
    const db = getDb();
    const { sessionIds, ...sample } = await getHarnessToolSample(db, harness);
    const [analytics, toolTimings] = await Promise.all([
      getToolAnalytics(VIS, db, TRACE_VERSION, sessionIds),
      getToolTimings(VIS, db, TRACE_VERSION, sessionIds),
    ]);
    return { ...analytics, toolTimings, sample };
  }
  const key = toolAnalyticsCacheKey('analytics', VIS, TRACE_VERSION);
  const cached = await readToolAnalyticsCache(key);
  if (cached === 'missing-table') return { setupRequired: true };
  if (!cached) {
    return { warming: true };
  }
  return {
    ...(cached.data as Record<string, unknown>),
    cachedAt: cached.cachedAt.toISOString(),
  };
});

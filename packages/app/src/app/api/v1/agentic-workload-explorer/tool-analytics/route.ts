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

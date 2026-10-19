import { isHarness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  getHarnessToolSample,
  getToolSequences,
  readToolAnalyticsCache,
  toolAnalyticsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { analyzeToolSequences } from '@semianalysisai/inferencex-db/proxytrace/sequence-insights';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';

// Cache-only, same design as ../route.ts — sequence analysis scans every tool
// event per session and is only ever recomputed by the main ProxyTrace
// deployment.
// Standardized: always anon visibility, all trace versions, single cache row.
// `?harness=` runs live over the same session sample as ../route.ts.
export const maxDuration = 300;

const VIS: string[] = [];
const TRACE_VERSION = null;

const EMPTY_INSIGHTS = {
  totalSessions: 0,
  totalCalls: 0,
  collapsedSteps: 0,
  repeatShare: 0,
  longestStreak: null,
  motifs: [],
  streaks: [],
  loops: [],
};

export const GET = withExplorerRoute(async ({ req }) => {
  const harness = req.nextUrl.searchParams.get('harness');
  if (isHarness(harness)) {
    const db = getDb();
    const { sessionIds } = await getHarnessToolSample(db, harness);
    const sequences = await getToolSequences(VIS, db, TRACE_VERSION, sessionIds);
    return analyzeToolSequences(sequences.map((s) => s.toolSequence));
  }
  const key = toolAnalyticsCacheKey('sequences', VIS, TRACE_VERSION);
  const cached = await readToolAnalyticsCache(key);
  if (cached === 'missing-table') {
    return { ...EMPTY_INSIGHTS, setupRequired: true };
  }
  if (!cached) {
    return { ...EMPTY_INSIGHTS, warming: true };
  }
  return {
    ...(cached.data as Record<string, unknown>),
    cachedAt: cached.cachedAt.toISOString(),
  };
});

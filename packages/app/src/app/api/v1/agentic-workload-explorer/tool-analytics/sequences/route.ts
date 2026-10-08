import {
  readToolAnalyticsCache,
  toolAnalyticsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';

// Cache-only, same design as ../route.ts — sequence analysis scans every tool
// event per session and is only ever recomputed by the main ProxyTrace
// deployment.
// Standardized: always anon visibility, all trace versions, single cache row.
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

export const GET = withExplorerRoute(async () => {
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

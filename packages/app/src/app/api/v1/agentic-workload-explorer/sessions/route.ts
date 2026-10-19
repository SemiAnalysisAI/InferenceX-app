import { isHarness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import {
  getRecentSessions,
  getSessionStats,
  SESSION_SORT_KEYS,
  type SessionSort,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parsePagination, parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

function parseMinReqs(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function parseSort(params: URLSearchParams): SessionSort {
  const key = SESSION_SORT_KEYS.find((k) => k === params.get('sort')) ?? 'active';
  return { key, dir: params.get('dir') === 'asc' ? 'asc' : 'desc' };
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const searchParams = req.nextUrl.searchParams;
  const { limit, offset } = parsePagination(searchParams);
  const search = searchParams.get('search') || null;
  const traceVersion = parseTraceVersion(searchParams);
  const harness = searchParams.get('harness');
  const harnessFilter = isHarness(harness) ? harness : null;
  const minReqs = parseMinReqs(searchParams.get('minReqs'));
  const sort = parseSort(searchParams);

  const privacyMode = null;

  const [sessions, stats] = await Promise.all([
    getRecentSessions(
      limit,
      offset,
      vis,
      search,
      traceVersion,
      privacyMode,
      harnessFilter,
      minReqs,
      sort,
    ),
    offset === 0
      ? getSessionStats(vis, traceVersion, privacyMode, harnessFilter, minReqs)
      : Promise.resolve(null),
  ]);
  return { sessions, stats };
});

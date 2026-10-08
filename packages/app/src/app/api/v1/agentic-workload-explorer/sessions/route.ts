import { isHarness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import {
  getRecentSessions,
  getSessionStats,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parsePagination } from '@/lib/agentic-workload-explorer/request';

function parseVersion(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseMinReqs(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const searchParams = req.nextUrl.searchParams;
  const { limit, offset } = parsePagination(searchParams);
  const search = searchParams.get('search') || null;
  const traceVersion = parseVersion(searchParams.get('version'));
  const harness = searchParams.get('harness');
  const harnessFilter = isHarness(harness) ? harness : null;
  const minReqs = parseMinReqs(searchParams.get('minReqs'));

  // Privacy-mode filtering is admin-only upstream; the read-only viewer only
  // ever sees anonymized sessions, so it is always unfiltered here.
  const privacyMode = null;

  // Infinite-scroll pages (offset > 0) only read `sessions`; the header stats
  // come from the first page, so don't recount them on every scroll.
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
    ),
    offset === 0
      ? getSessionStats(vis, traceVersion, privacyMode, harnessFilter, minReqs)
      : Promise.resolve(null),
  ]);
  return { sessions, stats };
});

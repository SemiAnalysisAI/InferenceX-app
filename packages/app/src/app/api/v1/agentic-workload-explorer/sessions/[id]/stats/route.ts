import {
  getSessionById,
  getSessionTokenStats,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';

export const GET = withExplorerRoute(async ({ vis, params }) => {
  const { id } = params;

  if (vis !== null) {
    const session = await getSessionById(id, vis);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
  }

  const rows = await getSessionTokenStats(id, vis);
  const entries = rows.map((r, i) => ({
    request: i + 1,
    cacheRead: r.cacheReadInputTokens ?? 0,
    cacheWrite: r.cacheWriteTokens ?? 0,
    output: r.outputTokens ?? 0,
  }));
  return { entries };
});

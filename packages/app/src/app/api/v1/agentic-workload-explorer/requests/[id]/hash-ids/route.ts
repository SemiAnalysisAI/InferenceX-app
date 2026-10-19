import { getRequestHashIds } from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';

export const GET = withExplorerRoute(async ({ vis, params }) => {
  const hashIds = await getRequestHashIds(params.id, vis);
  if (hashIds === undefined) {
    return Response.json({ error: 'Request not found' }, { status: 404 });
  }
  return { hashIds: hashIds ?? [] };
});

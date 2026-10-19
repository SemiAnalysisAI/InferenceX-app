import {
  getSessionById,
  getRequestsBySession,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parsePagination } from '@/lib/agentic-workload-explorer/request';
import { sanitizeModel } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';

export const GET = withExplorerRoute(async ({ vis, req, params }) => {
  const { id } = params;
  const searchParams = req.nextUrl.searchParams;
  const { limit, offset } = parsePagination(searchParams, { limit: 20 });
  const sort = searchParams.get('sort') === 'desc' ? ('desc' as const) : ('asc' as const);
  // hashes=0 returns hash_ids as null plus a hashCount per request; the lists
  // are ~90% of the payload and most tabs only show the count.
  const includeHashIds = searchParams.get('hashes') !== '0';

  const [session, { requests, total }] = await Promise.all([
    getSessionById(id, vis),
    getRequestsBySession(id, limit, offset, sort, vis, includeHashIds),
  ]);
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return {
    session,
    requests: requests.map((r) => ({
      ...r,
      model: sanitizeModel(r.model as string | null),
      request_body: sanitizeBodyModel(r.request_body),
      response_body: sanitizeBodyModel(r.response_body),
    })),
    total,
    limit,
    offset,
  };
});

function sanitizeBodyModel(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sanitizeBodyModel);
  if (!val || typeof val !== 'object') return val;
  const obj = val as Record<string, unknown>;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const s = k === 'model' && typeof v === 'string' ? sanitizeModel(v) : sanitizeBodyModel(v);
    if (s !== v) changed = true;
    out[k] = s;
  }
  return changed ? out : val;
}

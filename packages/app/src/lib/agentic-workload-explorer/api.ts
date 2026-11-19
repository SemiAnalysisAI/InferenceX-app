import type { NextRequest } from 'next/server';

import { jsonCamel } from './case';

export const CDN_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const CDN_CACHE: ResponseInit = { headers: { 'Cache-Control': CDN_CACHE_CONTROL } };

export const ANON_ONLY_VISIBILITY: string[] = [];

interface ExplorerRouteContext {
  vis: string[] | null;
  req: NextRequest;
  params: Record<string, string>;
}

type NextRouteHandler = (
  req: NextRequest,
  ctx?: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const REPLICA_CONFLICT_RETRIES = 3;

function isReplicaConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '40001';
}

async function withReplicaRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isReplicaConflict(error) || attempt >= REPLICA_CONFLICT_RETRIES) throw error;
      await new Promise((resolve) => {
        setTimeout(resolve, 200 * 2 ** attempt);
      });
    }
  }
}

export function withExplorerRoute(
  handler: (ctx: ExplorerRouteContext) => Promise<unknown>,
): NextRouteHandler {
  return async (req, routeCtx) => {
    const params = routeCtx?.params ? await routeCtx.params : {};
    try {
      const data = await withReplicaRetry(() =>
        handler({ vis: ANON_ONLY_VISIBILITY, req, params }),
      );
      if (data instanceof Response) return data;
      return jsonCamel(data, CDN_CACHE);
    } catch (error) {
      console.error('Agentic Workload Explorer API error:', error);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

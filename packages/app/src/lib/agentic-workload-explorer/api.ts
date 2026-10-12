import type { NextRequest } from 'next/server';

import { jsonCamel } from './case';

// The database is a static read-only snapshot and every visitor sees the same
// anonymized data, so successful responses are shared from Vercel's CDN.
// Browsers always revalidate (max-age=0); the CDN serves its copy for a day and
// up to a week stale while refreshing. Every deployment starts with an empty
// CDN cache, so redeploying after a data reload is enough to invalidate.
// Errors are returned without this header and are never cached.
export const CDN_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const CDN_CACHE: ResponseInit = { headers: { 'Cache-Control': CDN_CACHE_CONTROL } };

/**
 * Visibility filter handed to every query. The explorer has no login and no
 * admin, so it is always the non-null "anonymized rows only" marker: DB helpers
 * restrict to `privacy_mode = 'anon'` whenever it is not `null`.
 */
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

// The database is a Neon read replica. When WAL replay removes row versions a
// running query still needs, Postgres cancels it with SQLSTATE 40001
// ("canceling statement due to conflict with recovery"). Handlers are
// read-only, so retrying is safe.
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

/**
 * Wrap a read-only explorer route: anonymized visibility, replica-conflict
 * retry, camelCase JSON, and the shared CDN cache header. Handlers return data
 * to serialize, or a Response to send as-is (e.g. a 400 or 404).
 */
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

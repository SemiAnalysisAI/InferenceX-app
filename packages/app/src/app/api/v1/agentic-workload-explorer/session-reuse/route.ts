import { readStatsCache, statsCacheKey } from '@semianalysisai/inferencex-db/proxytrace/stats';
import {
  DEFAULT_REUSE_DAYS,
  parseReuseDays,
  selectReuseDays,
  sessionReuseCsv,
  type SessionReusePayload,
} from '@semianalysisai/inferencex-db/proxytrace/shared/session-reuse';
import { CDN_CACHE_CONTROL, withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };

/** Cache-only reads, including cold starts and exports. Heavy queries run after the response. */
export const GET = withExplorerRoute(async ({ vis, req }) => {
  const params = req.nextUrl.searchParams;
  const rawDays = params.get('days');
  const days = rawDays === null ? [...DEFAULT_REUSE_DAYS] : parseReuseDays(rawDays);
  const format = params.get('format') ?? 'json';
  if (!days || !['json', 'csv'].includes(format) || params.has('model')) {
    return Response.json(
      {
        error:
          'Use integer days from 1 to 28 and format=json or csv. This view includes all models.',
      },
      { status: 400, headers },
    );
  }
  const version = parseTraceVersion(params);
  const cached = await readStatsCache(statsCacheKey('session-reuse', vis, version));
  if (cached === 'missing-table') return Response.json({ setupRequired: true }, { headers });
  // The frozen snapshot is never recomputed, so a miss is permanent.
  if (!cached) return Response.json({ warming: true }, { headers });
  const data = selectReuseDays(cached.data as SessionReusePayload, days);
  if (format === 'csv')
    return new Response(sessionReuseCsv(data), {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="session-reuse.csv"',
      },
    });
  return Response.json(
    { ...data, cachedAt: cached.cachedAt.toISOString() },
    { headers: { 'Cache-Control': CDN_CACHE_CONTROL } },
  );
});

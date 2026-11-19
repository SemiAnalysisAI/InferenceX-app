import { sql } from 'kysely';
import { getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  requestsVisFilter,
  traceVersionFilter,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { sanitizeModels } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';
import { NOW } from '@semianalysisai/inferencex-db/proxytrace/as-of';

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const db = getDb();

  // Route breakdown: endpoint, call count, success/error counts, avg/p95 latency
  const routeStats = await sql<{
    endpoint: string;
    total: number;
    success_count: number;
    error_count: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
  }>`
    SELECT
      endpoint,
      count(*)::int AS total,
      count(*) FILTER (WHERE response_status_code >= 200 AND response_status_code < 400)::int AS success_count,
      count(*) FILTER (WHERE response_status_code >= 400 OR response_status_code IS NULL)::int AS error_count,
      coalesce(avg(duration_ms)::int, 0) AS avg_duration_ms,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p95_duration_ms
    FROM requests
    WHERE ${requestsVisFilter(vis)}
      AND ${traceVersionFilter(traceVersion)}
      AND timestamp > ${NOW} - interval '7 days'
    GROUP BY endpoint
    ORDER BY total DESC
  `.execute(db);

  // Hourly request counts by endpoint (last 48h)
  const hourlyByEndpoint = await sql<{
    hour: string;
    endpoint: string;
    count: number;
  }>`
    SELECT
      date_trunc('hour', timestamp) AS hour,
      endpoint,
      count(*)::int AS count
    FROM requests
    WHERE ${requestsVisFilter(vis)}
      AND ${traceVersionFilter(traceVersion)}
      AND timestamp > ${NOW} - interval '48 hours'
    GROUP BY hour, endpoint
    ORDER BY hour
  `.execute(db);

  // Status code distribution (last 7d)
  const statusDistribution = await sql<{
    status_group: string;
    count: number;
  }>`
    SELECT
      CASE
        WHEN response_status_code >= 200 AND response_status_code < 300 THEN '2xx'
        WHEN response_status_code >= 300 AND response_status_code < 400 THEN '3xx'
        WHEN response_status_code >= 400 AND response_status_code < 500 THEN '4xx'
        WHEN response_status_code >= 500 THEN '5xx'
        ELSE 'unknown'
      END AS status_group,
      count(*)::int AS count
    FROM requests
    WHERE ${requestsVisFilter(vis)}
      AND ${traceVersionFilter(traceVersion)}
      AND timestamp > ${NOW} - interval '7 days'
    GROUP BY status_group
    ORDER BY status_group
  `.execute(db);

  // Recent errors (last 50 non-2xx requests)
  const recentErrors = await sql<{
    id: string;
    timestamp: string;
    endpoint: string;
    model: string | null;
    response_status_code: number | null;
    duration_ms: number | null;
    error: string | null;
  }>`
    SELECT
      id, timestamp, endpoint, model,
      response_status_code, duration_ms, error
    FROM requests
    WHERE ${requestsVisFilter(vis)}
      AND ${traceVersionFilter(traceVersion)}
      AND (response_status_code >= 400 OR response_status_code IS NULL)
      AND timestamp > ${NOW} - interval '24 hours'
    ORDER BY timestamp DESC
    LIMIT 50
  `.execute(db);

  return {
    routeStats: routeStats.rows,
    hourlyByEndpoint: hourlyByEndpoint.rows,
    statusDistribution: statusDistribution.rows,
    recentErrors: sanitizeModels(recentErrors.rows),
  };
});

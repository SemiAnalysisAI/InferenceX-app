import { sql, type Kysely } from 'kysely';
import {
  buildSessionReusePayload,
  sessionReuseWindow,
  type ReuseBucket,
  type ReuseWindow,
} from './shared/session-reuse';
import { requestsVisFilter } from './operations';
import type { Database } from './types';
import { asOfDate } from './shared/as-of';

/**
 * All visible successful calls establish chronology; selecting a trace version
 * never resets session origins or stretches gaps. Only aggregate histograms
 * leave PostgreSQL. No request bodies, headers or inferred identity links.
 */
export function sessionReuseQuery(
  vis: string[] | null,
  traceVersion: number | null,
  window: ReuseWindow,
) {
  const selected = traceVersion === null ? sql`TRUE` : sql`r.trace_version = ${traceVersion}`;
  return sql<ReuseBucket>`WITH base AS MATERIALIZED (
    SELECT r.session_id,r.client_id,r.timestamp,
      (r.timestamp AT TIME ZONE 'UTC')::date AS day,
      r.subagent_label='Web Search Agent' AS search_assisted, ${selected} AS selected
    FROM requests r WHERE r.timestamp >= ${window.observationStart}::timestamptz
      AND r.timestamp < ${window.asOf}::timestamptz
      AND r.response_status_code BETWEEN 200 AND 299
      AND ${requestsVisFilter(vis, 'r')}
  ), days AS MATERIALIZED (
    SELECT session_id,day,min(timestamp) AS first_at,max(timestamp) AS last_at,
      count(*)::float8 AS calls,count(*) FILTER(WHERE selected)::float8 AS selected_calls,
      coalesce(bool_or(search_assisted),false) AS search_assisted
    FROM base GROUP BY session_id,day
  ), gaps AS (
    SELECT *,extract(epoch FROM first_at-lag(last_at) OVER(PARTITION BY session_id ORDER BY day))/86400.0 AS gap_days
    FROM days
  ), profiles AS MATERIALIZED (
    SELECT session_id,min(first_at) AS first_at,max(last_at) AS last_at,
      count(*) AS active_days,sum(selected_calls)::float8 AS selected_calls,
      (array_agg(calls ORDER BY day))[1] AS first_day_calls,
      bool_or(search_assisted) AS search_assisted,
      ceil(coalesce(max(gap_days),0))::int AS gap_bucket,
      ceil(extract(epoch FROM max(last_at)-min(first_at))/86400.0)::int AS age_bucket
    FROM gaps GROUP BY session_id
  ), eligible AS MATERIALIZED (
    SELECT * FROM profiles WHERE first_at >= ${window.cohortStart}::timestamptz
      AND first_at < ${window.cohortEnd}::timestamptz AND selected_calls>0
  ), memberships AS MATERIALIZED (
    SELECT e.*,c.cohort FROM eligible e CROSS JOIN LATERAL (VALUES
      ('all',TRUE),('multiDay',e.active_days>1),('smallStart',e.first_day_calls<=5),
      ('searchAssisted',e.search_assisted)) AS c(cohort,include) WHERE c.include
  ), call_ages AS (
    SELECT e.session_id,ceil(extract(epoch FROM b.timestamp-e.first_at)/86400.0)::int AS bucket,
      count(*)::float8 AS calls
    FROM base b JOIN eligible e USING(session_id) WHERE b.selected
    GROUP BY e.session_id,bucket
  ), activity_days AS MATERIALIZED (
    SELECT client_id,day,count(*)::int AS calls FROM base
    WHERE selected AND timestamp >= ${window.activityStart}::timestamptz GROUP BY client_id,day
  ), activity_credentials AS (
    SELECT client_id,sum(calls)::int AS calls FROM activity_days GROUP BY client_id
  )
  SELECT 'sessionAge' AS kind,cohort,age_bucket AS bucket,count(*)::float8 AS count
    FROM memberships GROUP BY cohort,age_bucket
  UNION ALL SELECT 'returnGap',cohort,gap_bucket,count(*)::float8 FROM memberships GROUP BY cohort,gap_bucket
  UNION ALL SELECT 'callAge',m.cohort,a.bucket,sum(a.calls)::float8
    FROM call_ages a JOIN memberships m USING(session_id) GROUP BY m.cohort,a.bucket
  UNION ALL SELECT 'coverage','calls',0,coalesce(sum(selected_calls),0)::float8 FROM profiles
  UNION ALL SELECT 'coverage','sessions',0,count(*)::float8 FROM profiles WHERE selected_calls>0
  UNION ALL SELECT 'coverage','beforeCohort',0,count(*)::float8 FROM profiles
    WHERE selected_calls>0 AND first_at < ${window.cohortStart}::timestamptz
  UNION ALL SELECT 'coverage','tooRecent',0,count(*)::float8 FROM profiles
    WHERE selected_calls>0 AND first_at >= ${window.cohortEnd}::timestamptz
  UNION ALL SELECT 'activityDailyCalls','',calls,count(*)::float8 FROM activity_days GROUP BY calls
  UNION ALL SELECT 'activityPeriodCalls','',calls,count(*)::float8 FROM activity_credentials GROUP BY calls`;
}

export async function computeSessionReusePayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
  now = asOfDate(),
) {
  const window = sessionReuseWindow(now);
  const { rows } = await sessionReuseQuery(vis, traceVersion, window).execute(db);
  return buildSessionReusePayload(rows, window, traceVersion, vis === null ? 'all' : 'anon');
}

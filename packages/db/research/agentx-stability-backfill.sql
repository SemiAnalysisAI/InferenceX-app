\set ON_ERROR_STOP on

-- Idempotently backfill descriptive AgentX stability fields from the stored
-- request timeline. These are observed non-overlapping-window ranges, not
-- confidence intervals or rerun prediction intervals.
--
-- Required psql variables:
--   expected_branch_id  Neon branch id this write is allowed to target
-- Optional psql variables:
--   min_id              inclusive benchmark_results.id (default 0)
--   max_id              inclusive benchmark_results.id (default bigint max)

\if :{?expected_branch_id}
\else
  \echo 'Refusing to run: expected_branch_id is required.'
  \quit 3
\endif

\if :{?min_id}
\else
  \set min_id 0
\endif

\if :{?max_id}
\else
  \set max_id 9223372036854775807
\endif

SELECT current_setting('neon.branch_id', true) = :'expected_branch_id' AS on_expected_branch
\gset

\if :on_expected_branch
  \echo 'Verified Neon branch' :expected_branch_id
\else
  \echo 'Refusing to run: connected Neon branch does not match' :expected_branch_id
  \quit 3
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE TEMP TABLE _agentx_stability_patch ON COMMIT DROP AS
WITH candidates AS (
  SELECT
    br.id,
    floor((br.metrics->>'duration_seconds')::float8 / 600)::int AS expected_windows,
    atr.request_timeline
  FROM benchmark_results br
  JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id
  WHERE br.benchmark_type = 'agentic_traces'
    AND br.error IS NULL
    AND br.id BETWEEN :min_id::bigint AND :max_id::bigint
    AND (br.metrics->>'duration_seconds')::float8 >= 1200
    AND jsonb_typeof(atr.request_timeline->'requests') = 'array'
), raw AS (
  SELECT
    c.id,
    c.expected_windows,
    COALESCE(
      NULLIF(r->>'credit', '')::float8,
      NULLIF(r->>'start', '')::float8
    ) AS timestamp_ns,
    COALESCE(NULLIF(r->>'srcTrace', ''), NULLIF(r->>'cid', ''), 'unknown') AS root_id,
    NULLIF(r->>'ttftMs', '')::float8 / 1000 AS ttft_s,
    CASE
      WHEN NULLIF(r->>'end', '')::float8 > NULLIF(r->>'start', '')::float8
        THEN (NULLIF(r->>'end', '')::float8 - NULLIF(r->>'start', '')::float8) / 1e9
    END AS e2el_s,
    NULLIF(r->>'tpotMs', '')::float8 / 1000 AS itl_s
  FROM candidates c
  CROSS JOIN LATERAL jsonb_array_elements(c.request_timeline->'requests') r
  WHERE COALESCE(NULLIF(r->>'phase', ''), 'profiling') = 'profiling'
    AND COALESCE((r->>'cancelled')::boolean, false) = false
), timed AS (
  SELECT
    *,
    min(timestamp_ns) OVER (PARTITION BY id) AS origin_ns
  FROM raw
  WHERE timestamp_ns IS NOT NULL
), windowed AS (
  SELECT
    *,
    floor((timestamp_ns - origin_ns) / 600e9)::int AS window_index
  FROM timed
), window_metrics AS (
  SELECT
    id,
    expected_windows,
    window_index,
    count(*)::int AS request_count,
    percentile_cont(.75) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s > 0) AS p75_ttft,
    percentile_cont(.9) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s > 0) AS p90_ttft,
    percentile_cont(.75) WITHIN GROUP (ORDER BY e2el_s)
      FILTER (WHERE e2el_s > 0) AS p75_e2el,
    percentile_cont(.9) WITHIN GROUP (ORDER BY e2el_s)
      FILTER (WHERE e2el_s > 0) AS p90_e2el,
    percentile_cont(.75) WITHIN GROUP (ORDER BY itl_s)
      FILTER (WHERE itl_s > 0) AS p75_itl,
    percentile_cont(.9) WITHIN GROUP (ORDER BY itl_s)
      FILTER (WHERE itl_s > 0) AS p90_itl
  FROM windowed
  WHERE window_index >= 0
    AND window_index < expected_windows
  GROUP BY id, expected_windows, window_index
), window_summary AS (
  SELECT
    id,
    max(expected_windows)::int AS expected_window_count,
    count(*)::int AS observed_window_count,
    min(request_count)::int AS min_window_requests,
    min(p75_ttft) AS p75_ttft_min,
    max(p75_ttft) AS p75_ttft_max,
    min(p90_ttft) AS p90_ttft_min,
    max(p90_ttft) AS p90_ttft_max,
    min(p75_e2el) AS p75_e2el_min,
    max(p75_e2el) AS p75_e2el_max,
    min(p90_e2el) AS p90_e2el_min,
    max(p90_e2el) AS p90_e2el_max,
    CASE WHEN max(p75_itl) > 0 THEN 1 / max(p75_itl) END AS p75_intvty_min,
    CASE WHEN min(p75_itl) > 0 THEN 1 / min(p75_itl) END AS p75_intvty_max,
    CASE WHEN max(p90_itl) > 0 THEN 1 / max(p90_itl) END AS p90_intvty_min,
    CASE WHEN min(p90_itl) > 0 THEN 1 / min(p90_itl) END AS p90_intvty_max
  FROM window_metrics
  GROUP BY id
), root_counts AS (
  SELECT id, root_id, count(*)::bigint AS request_count
  FROM raw
  GROUP BY id, root_id
), root_summary AS (
  SELECT
    id,
    count(*)::int AS root_trajectory_count,
    (sum(request_count)::float8 * sum(request_count))
      / NULLIF(sum(request_count::float8 * request_count), 0)
      AS root_trajectory_kish_effective_count,
    max(request_count)::float8 / NULLIF(sum(request_count), 0)
      AS root_trajectory_largest_share
  FROM root_counts
  GROUP BY id
), patches AS (
  SELECT
    ws.id,
    jsonb_strip_nulls(jsonb_build_object(
      'observed_window_seconds', 600,
      'observed_window_expected_count', ws.expected_window_count,
      'observed_window_count', ws.observed_window_count,
      'observed_window_min_requests', ws.min_window_requests,
      'root_trajectory_count', rs.root_trajectory_count,
      'root_trajectory_kish_effective_count',
        round(rs.root_trajectory_kish_effective_count::numeric, 5),
      'root_trajectory_largest_share',
        round(rs.root_trajectory_largest_share::numeric, 5),
      'observed_window_p75_ttft_min', round(ws.p75_ttft_min::numeric, 5),
      'observed_window_p75_ttft_max', round(ws.p75_ttft_max::numeric, 5),
      'observed_window_p90_ttft_min', round(ws.p90_ttft_min::numeric, 5),
      'observed_window_p90_ttft_max', round(ws.p90_ttft_max::numeric, 5),
      'observed_window_p75_e2el_min', round(ws.p75_e2el_min::numeric, 5),
      'observed_window_p75_e2el_max', round(ws.p75_e2el_max::numeric, 5),
      'observed_window_p90_e2el_min', round(ws.p90_e2el_min::numeric, 5),
      'observed_window_p90_e2el_max', round(ws.p90_e2el_max::numeric, 5),
      'observed_window_p75_intvty_min', round(ws.p75_intvty_min::numeric, 5),
      'observed_window_p75_intvty_max', round(ws.p75_intvty_max::numeric, 5),
      'observed_window_p90_intvty_min', round(ws.p90_intvty_min::numeric, 5),
      'observed_window_p90_intvty_max', round(ws.p90_intvty_max::numeric, 5)
    )) AS patch
  FROM window_summary ws
  JOIN root_summary rs USING (id)
)
SELECT id, patch
FROM patches;

WITH updated AS (
  UPDATE benchmark_results br
  SET metrics = br.metrics || p.patch
  FROM _agentx_stability_patch p
  WHERE br.id = p.id
    AND br.metrics IS DISTINCT FROM br.metrics || p.patch
  RETURNING br.id
)
SELECT
  (SELECT count(*) FROM _agentx_stability_patch) AS computed_rows,
  count(*) AS updated_rows,
  min(id) AS first_updated_id,
  max(id) AS last_updated_id
FROM updated;

COMMIT;

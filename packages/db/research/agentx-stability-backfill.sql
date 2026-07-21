\set ON_ERROR_STOP on

-- Idempotently backfill AgentX stability fields from the stored request
-- timeline. The Pareto whisker uses retrospective cumulative-prefix
-- convergence; the older non-overlapping-window ranges remain available for
-- drift inspection. Neither is a confidence interval or rerun prediction.
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
    (floor((br.metrics->>'duration_seconds')::float8 / 300) * 300)::int
      AS convergence_horizon_seconds,
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
), prefix_metrics AS (
  SELECT
    c.id,
    c.convergence_horizon_seconds,
    checkpoint.seconds::int AS checkpoint_seconds,
    count(t.timestamp_ns)::int AS request_count,
    count(*) FILTER (WHERE t.ttft_s > 0)::int AS ttft_request_count,
    count(*) FILTER (WHERE t.e2el_s > 0)::int AS e2el_request_count,
    count(*) FILTER (WHERE t.itl_s > 0)::int AS intvty_request_count,
    percentile_cont(.75) WITHIN GROUP (ORDER BY t.ttft_s)
      FILTER (WHERE t.ttft_s > 0) AS p75_ttft,
    percentile_cont(.9) WITHIN GROUP (ORDER BY t.ttft_s)
      FILTER (WHERE t.ttft_s > 0) AS p90_ttft,
    percentile_cont(.75) WITHIN GROUP (ORDER BY t.e2el_s)
      FILTER (WHERE t.e2el_s > 0) AS p75_e2el,
    percentile_cont(.9) WITHIN GROUP (ORDER BY t.e2el_s)
      FILTER (WHERE t.e2el_s > 0) AS p90_e2el,
    percentile_cont(.75) WITHIN GROUP (ORDER BY t.itl_s)
      FILTER (WHERE t.itl_s > 0) AS p75_itl,
    percentile_cont(.9) WITHIN GROUP (ORDER BY t.itl_s)
      FILTER (WHERE t.itl_s > 0) AS p90_itl
  FROM candidates c
  CROSS JOIN LATERAL generate_series(
    300,
    c.convergence_horizon_seconds,
    300
  ) checkpoint(seconds)
  JOIN timed t
    ON t.id = c.id
   AND t.timestamp_ns >= t.origin_ns
   AND t.timestamp_ns < t.origin_ns + checkpoint.seconds * 1e9
  GROUP BY c.id, c.convergence_horizon_seconds, checkpoint.seconds
), prefix_values AS (
  SELECT
    pm.id,
    pm.convergence_horizon_seconds,
    pm.checkpoint_seconds,
    metric.request_count,
    metric.metric_key,
    metric.metric_value
  FROM prefix_metrics pm
  CROSS JOIN LATERAL (VALUES
    ('p75_ttft', pm.p75_ttft, pm.ttft_request_count),
    ('p90_ttft', pm.p90_ttft, pm.ttft_request_count),
    ('p75_e2el', pm.p75_e2el, pm.e2el_request_count),
    ('p90_e2el', pm.p90_e2el, pm.e2el_request_count),
    (
      'p75_intvty',
      CASE WHEN pm.p75_itl > 0 THEN 1 / pm.p75_itl END,
      pm.intvty_request_count
    ),
    (
      'p90_intvty',
      CASE WHEN pm.p90_itl > 0 THEN 1 / pm.p90_itl END,
      pm.intvty_request_count
    )
  ) metric(metric_key, metric_value, request_count)
), final_values AS (
  SELECT
    id,
    metric_key,
    metric_value AS final_value
  FROM prefix_values
  WHERE checkpoint_seconds = convergence_horizon_seconds
), stabilization_candidates AS (
  SELECT
    pv.id,
    pv.metric_key,
    pv.checkpoint_seconds,
    pv.request_count
  FROM prefix_values pv
  JOIN final_values fv USING (id, metric_key)
  WHERE pv.convergence_horizon_seconds - pv.checkpoint_seconds >= 1200
    AND pv.metric_value > 0
    AND fv.final_value > 0
    AND NOT EXISTS (
      SELECT 1
      FROM prefix_values later
      WHERE later.id = pv.id
        AND later.metric_key = pv.metric_key
        AND later.checkpoint_seconds >= pv.checkpoint_seconds
        AND (
          later.metric_value IS NULL
          OR later.metric_value <= 0
          OR abs(ln(later.metric_value / fv.final_value))
            > ln(1.05::float8) + 1e-12
        )
    )
), stabilization AS (
  SELECT DISTINCT ON (id, metric_key)
    id,
    metric_key,
    checkpoint_seconds AS time_seconds,
    request_count
  FROM stabilization_candidates
  ORDER BY id, metric_key, checkpoint_seconds
), convergence_summary AS (
  SELECT
    s.id,
    s.metric_key,
    s.time_seconds,
    s.request_count,
    min(pv.metric_value) AS min_value,
    max(pv.metric_value) AS max_value,
    max(abs(pv.metric_value / fv.final_value - 1)) AS max_relative_deviation
  FROM stabilization s
  JOIN prefix_values pv
    ON pv.id = s.id
   AND pv.metric_key = s.metric_key
   AND pv.checkpoint_seconds >= s.time_seconds
  JOIN final_values fv
    ON fv.id = s.id
   AND fv.metric_key = s.metric_key
  GROUP BY s.id, s.metric_key, s.time_seconds, s.request_count
), convergence_kv AS (
  SELECT
    id,
    'convergence_' || metric_key || '_time_seconds' AS key,
    to_jsonb(time_seconds) AS value
  FROM convergence_summary
  UNION ALL
  SELECT
    id,
    'convergence_' || metric_key || '_requests',
    to_jsonb(request_count)
  FROM convergence_summary
  UNION ALL
  SELECT
    id,
    'convergence_' || metric_key || '_min',
    to_jsonb(round(min_value::numeric, 5))
  FROM convergence_summary
  UNION ALL
  SELECT
    id,
    'convergence_' || metric_key || '_max',
    to_jsonb(round(max_value::numeric, 5))
  FROM convergence_summary
  UNION ALL
  SELECT
    id,
    'convergence_' || metric_key || '_max_relative_deviation',
    to_jsonb(round(max_relative_deviation::numeric, 5))
  FROM convergence_summary
), convergence_patches AS (
  SELECT id, jsonb_object_agg(key, value) AS patch
  FROM convergence_kv
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
      'observed_window_p90_intvty_max', round(ws.p90_intvty_max::numeric, 5),
      'convergence_checkpoint_seconds', 300,
      'convergence_tolerance_ratio', 0.05,
      'convergence_min_confirmation_seconds', 1200,
      'convergence_horizon_seconds', c.convergence_horizon_seconds
    )) || COALESCE(cp.patch, '{}'::jsonb) AS patch
  FROM window_summary ws
  JOIN root_summary rs USING (id)
  JOIN candidates c USING (id)
  LEFT JOIN convergence_patches cp USING (id)
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

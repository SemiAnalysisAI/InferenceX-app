\set ON_ERROR_STOP on
SET statement_timeout = '600s';

-- Non-overlapping, equal-duration slices for the pinned one-hour AgentX cohort.
-- Run with psql variables `shard=0..9` and `max_id=<snapshot ceiling>`.
-- Equal-duration slices avoid treating a short final wall-clock bucket as if it
-- had the same exposure as a complete bucket.
COPY (
WITH canonical AS (
  SELECT
    br.id,
    br.conc,
    c.hardware,
    c.framework,
    c.model,
    atr.request_timeline
  FROM benchmark_results br
  JOIN configs c ON c.id = br.config_id
  JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id
  WHERE br.benchmark_type = 'agentic_traces'
    AND br.error IS NULL
    AND (br.metrics->>'duration_seconds')::float8 BETWEEN 3500 AND 3700
    AND mod(br.id, 10) = :shard
    AND br.id <= :max_id
), raw AS (
  SELECT
    c.id,
    c.conc,
    c.hardware,
    c.framework,
    c.model,
    COALESCE(NULLIF(r->>'srcTrace', ''), NULLIF(r->>'cid', ''), 'unknown') AS cluster_id,
    (r->>'credit')::float8 AS credit_ns,
    (r->>'end')::float8 AS end_ns,
    NULLIF(r->>'ttftMs', '')::float8 / 1000 AS ttft_s,
    ((r->>'end')::float8 - (r->>'start')::float8) / 1e9 AS e2e_s,
    NULLIF(r->>'tpotMs', '')::float8 / 1000 AS tpot_s,
    NULLIF(r->>'isl', '')::float8 AS isl,
    NULLIF(r->>'osl', '')::float8 AS osl
  FROM canonical c
  CROSS JOIN LATERAL jsonb_array_elements(c.request_timeline->'requests') r
  WHERE r->>'phase' = 'profiling'
    AND COALESCE((r->>'cancelled')::boolean, false) = false
), timed AS (
  SELECT
    *,
    min(credit_ns) OVER (PARTITION BY id) AS origin_ns,
    max(credit_ns) OVER (PARTITION BY id) - min(credit_ns) OVER (PARTITION BY id) AS span_ns
  FROM raw
), expanded AS (
  SELECT
    t.*,
    w.window_minutes,
    w.n_blocks,
    least(
      w.n_blocks - 1,
      floor((t.credit_ns - t.origin_ns) / NULLIF(t.span_ns, 0) * w.n_blocks)::int
    ) AS block
  FROM timed t
  CROSS JOIN (
    VALUES
      (5, 12),
      (10, 6),
      (15, 4),
      (20, 3)
  ) AS w(window_minutes, n_blocks)
), cluster_counts AS (
  SELECT id, window_minutes, block, cluster_id, count(*) AS n
  FROM expanded
  GROUP BY id, window_minutes, block, cluster_id
), cluster_summary AS (
  SELECT
    id,
    window_minutes,
    block,
    count(*)::int AS source_trajectories,
    (sum(n)::float8 * sum(n)) / NULLIF(sum(n::float8 * n), 0) AS kish_source_trajectories,
    max(n)::float8 / NULLIF(sum(n), 0) AS largest_source_share
  FROM cluster_counts
  GROUP BY id, window_minutes, block
), block_values AS (
  SELECT
    id,
    conc,
    hardware,
    framework,
    model,
    window_minutes,
    n_blocks,
    block,
    count(*)::int AS n_requests,
    percentile_cont(.75) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS ttft_p75,
    percentile_cont(.9) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS ttft_p90,
    percentile_cont(.75) WITHIN GROUP (ORDER BY e2e_s) AS e2e_p75,
    percentile_cont(.9) WITHIN GROUP (ORDER BY e2e_s) AS e2e_p90,
    percentile_cont(.75) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0) AS tpot_p75,
    percentile_cont(.9) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0) AS tpot_p90,
    avg(isl) AS isl_mean,
    percentile_cont(.5) WITHIN GROUP (ORDER BY isl)
      FILTER (WHERE isl IS NOT NULL) AS isl_p50,
    percentile_cont(.9) WITHIN GROUP (ORDER BY isl)
      FILTER (WHERE isl IS NOT NULL) AS isl_p90,
    avg(osl) AS osl_mean,
    percentile_cont(.5) WITHIN GROUP (ORDER BY osl)
      FILTER (WHERE osl IS NOT NULL) AS osl_p50,
    percentile_cont(.9) WITHIN GROUP (ORDER BY osl)
      FILTER (WHERE osl IS NOT NULL) AS osl_p90,
    sum(COALESCE(isl, 0) + COALESCE(osl, 0)) / (window_minutes * 60) AS token_rate
  FROM expanded
  WHERE block BETWEEN 0 AND n_blocks - 1
  GROUP BY id, conc, hardware, framework, model, window_minutes, n_blocks, block
)
SELECT
  b.*,
  c.source_trajectories,
  c.kish_source_trajectories,
  c.largest_source_share,
  CASE WHEN b.tpot_p75 > 0 THEN 1 / b.tpot_p75 END AS interactivity_p75,
  CASE WHEN b.tpot_p90 > 0 THEN 1 / b.tpot_p90 END AS interactivity_p90
FROM block_values b
JOIN cluster_summary c USING (id, window_minutes, block)
ORDER BY id, window_minutes, block
) TO STDOUT WITH (FORMAT csv, HEADER true);

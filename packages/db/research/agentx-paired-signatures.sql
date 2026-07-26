\set ON_ERROR_STOP on
SET statement_timeout = '600s';

-- Workload-matched request signatures for two benchmark rows. This is a
-- sensitivity diagnostic, not an uncertainty interval: repeated signatures
-- are generally sparse within one fixed-duration run.
COPY (
WITH raw AS (
  SELECT
    br.id,
    COALESCE(NULLIF(r->>'srcTrace', ''), NULLIF(r->>'cid', ''), 'unknown') AS source_trace_id,
    COALESCE(NULLIF(r->>'srcOuter', ''), NULLIF(r->>'ti', ''), '0')::int AS source_outer_idx,
    COALESCE(NULLIF(r->>'srcInner', ''), '-1')::int AS source_inner_idx,
    NULLIF(r->>'ttftMs', '')::float8 / 1000 AS ttft_s,
    ((r->>'end')::float8 - (r->>'start')::float8) / 1e9 AS e2e_s,
    NULLIF(r->>'tpotMs', '')::float8 / 1000 AS tpot_s,
    NULLIF(r->>'isl', '')::float8 AS isl,
    NULLIF(r->>'osl', '')::float8 AS osl
  FROM benchmark_results br
  JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id
  CROSS JOIN LATERAL jsonb_array_elements(atr.request_timeline->'requests') r
  WHERE br.id IN (:id_a, :id_b)
    AND r->>'phase' = 'profiling'
    AND COALESCE((r->>'cancelled')::boolean, false) = false
), signatures AS (
  SELECT
    id,
    source_trace_id,
    source_outer_idx,
    source_inner_idx,
    count(*)::int AS n,
    percentile_cont(.5) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS median_ttft_s,
    percentile_cont(.5) WITHIN GROUP (ORDER BY e2e_s) AS median_e2e_s,
    percentile_cont(.5) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0) AS median_tpot_s,
    percentile_cont(.5) WITHIN GROUP (ORDER BY isl)
      FILTER (WHERE isl IS NOT NULL) AS median_isl,
    percentile_cont(.5) WITHIN GROUP (ORDER BY osl)
      FILTER (WHERE osl IS NOT NULL) AS median_osl
  FROM raw
  GROUP BY id, source_trace_id, source_outer_idx, source_inner_idx
)
SELECT
  a.source_trace_id,
  a.source_outer_idx,
  a.source_inner_idx,
  a.n AS n_a,
  b.n AS n_b,
  a.median_ttft_s AS ttft_a,
  b.median_ttft_s AS ttft_b,
  a.median_e2e_s AS e2e_a,
  b.median_e2e_s AS e2e_b,
  a.median_tpot_s AS tpot_a,
  b.median_tpot_s AS tpot_b,
  a.median_isl AS isl_a,
  b.median_isl AS isl_b,
  a.median_osl AS osl_a,
  b.median_osl AS osl_b
FROM signatures a
JOIN signatures b USING (source_trace_id, source_outer_idx, source_inner_idx)
WHERE a.id = :id_a
  AND b.id = :id_b
ORDER BY a.source_trace_id, a.source_outer_idx, a.source_inner_idx
) TO STDOUT WITH (FORMAT csv, HEADER true);

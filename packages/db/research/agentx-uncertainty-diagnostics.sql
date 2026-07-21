\set ON_ERROR_STOP on
SET statement_timeout = '600s';

COPY (
WITH canonical AS (
  SELECT
    br.id,
    br.conc,
    c.hardware,
    c.framework,
    c.model,
    c.precision,
    c.spec_method,
    br.offload_mode,
    atr.request_timeline
  FROM benchmark_results br
  JOIN configs c ON c.id = br.config_id
  JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id
  WHERE br.benchmark_type = 'agentic_traces'
    AND br.error IS NULL
    AND (br.metrics->>'duration_seconds')::float8 BETWEEN 3500 AND 3700
    -- Run with `psql -v shard=0` through `-v shard=9`. Keeping each read
    -- replica snapshot short avoids cancellation during Neon recovery.
    AND mod(br.id, 10) = :shard
    -- Pin this to the maximum id observed before launching the ten shards so
    -- a concurrent ingest cannot make the local analysis internally mixed.
    AND br.id <= :max_id
), raw AS (
  SELECT
    c.id,
    c.conc,
    c.hardware,
    c.framework,
    c.model,
    COALESCE(NULLIF(r->>'srcTrace', ''), NULLIF(r->>'cid', ''), 'unknown') AS cluster_id,
    concat_ws(
      '|',
      COALESCE(NULLIF(r->>'srcTrace', ''), NULLIF(r->>'cid', ''), 'unknown'),
      COALESCE(NULLIF(r->>'srcOuter', ''), NULLIF(r->>'ti', ''), '0'),
      COALESCE(NULLIF(r->>'srcInner', ''), '-1')
    ) AS request_signature,
    NULLIF(r->>'cid', '') AS cid,
    NULLIF(r->>'wid', '') AS wid,
    (r->>'credit')::float8 AS credit_ns,
    (r->>'start')::float8 AS start_ns,
    (r->>'end')::float8 AS end_ns,
    NULLIF(r->>'ttftMs', '')::float8 / 1000 AS ttft_s,
    NULLIF(r->>'tpotMs', '')::float8 / 1000 AS tpot_s,
    NULLIF(r->>'isl', '')::float8 AS isl,
    NULLIF(r->>'osl', '')::float8 AS osl
  FROM canonical c
  CROSS JOIN LATERAL jsonb_array_elements(c.request_timeline->'requests') r
  WHERE r->>'phase' = 'profiling'
    AND COALESCE((r->>'cancelled')::boolean, false) = false
), requests AS (
  SELECT *, min(credit_ns) OVER (PARTITION BY id) AS origin_ns
  FROM raw
), cluster_counts AS (
  SELECT id, cluster_id, count(*) AS n
  FROM requests
  GROUP BY id, cluster_id
), cluster_summary AS (
  SELECT
    id,
    sum(n)::int AS n_requests,
    count(*)::int AS source_trajectories,
    (sum(n)::float8 * sum(n)) / sum(n::float8 * n) AS kish_source_trajectories,
    max(n)::float8 / sum(n) AS largest_source_share
  FROM cluster_counts
  GROUP BY id
), other_counts AS (
  SELECT
    id,
    count(DISTINCT cid)::int AS replay_trajectories,
    count(DISTINCT wid)::int AS workers
  FROM requests
  GROUP BY id
), point_values AS (
  SELECT
    id,
    percentile_cont(.75) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS ttft_p75,
    percentile_cont(.9) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS ttft_p90,
    percentile_cont(.9) WITHIN GROUP (ORDER BY (end_ns - start_ns) / 1e9) AS e2e_p90,
    percentile_cont(.9) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0) AS tpot_p90,
    percentile_cont(.9) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL AND credit_ns - origin_ns < 1800e9) AS ttft_first_half,
    percentile_cont(.9) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL AND credit_ns - origin_ns >= 1800e9) AS ttft_second_half,
    percentile_cont(.9) WITHIN GROUP (ORDER BY (end_ns - start_ns) / 1e9)
      FILTER (WHERE credit_ns - origin_ns < 1800e9) AS e2e_first_half,
    percentile_cont(.9) WITHIN GROUP (ORDER BY (end_ns - start_ns) / 1e9)
      FILTER (WHERE credit_ns - origin_ns >= 1800e9) AS e2e_second_half,
    percentile_cont(.9) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0 AND credit_ns - origin_ns < 1800e9) AS tpot_first_half,
    percentile_cont(.9) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0 AND credit_ns - origin_ns >= 1800e9) AS tpot_second_half
  FROM requests
  GROUP BY id
), block_values AS (
  SELECT
    id,
    floor((credit_ns - origin_ns) / 600e9)::int AS block,
    count(*)::int AS n,
    count(DISTINCT cluster_id)::int AS source_trajectories,
    percentile_cont(.75) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS ttft_p75,
    percentile_cont(.9) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL) AS ttft_p90,
    percentile_cont(.9) WITHIN GROUP (ORDER BY (end_ns - start_ns) / 1e9) AS e2e_p90,
    percentile_cont(.9) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0) AS tpot_p90
  FROM requests
  WHERE floor((credit_ns - origin_ns) / 600e9) BETWEEN 0 AND 5
  GROUP BY id, block
), block_summary AS (
  SELECT
    id,
    count(*)::int AS n_blocks,
    min(n)::int AS min_block_n,
    min(source_trajectories)::int AS min_block_trajectories,
    min(ttft_p75) AS ttft_p75_min,
    max(ttft_p75) AS ttft_p75_max,
    min(ttft_p90) AS ttft_p90_min,
    max(ttft_p90) AS ttft_p90_max,
    min(e2e_p90) AS e2e_p90_min,
    max(e2e_p90) AS e2e_p90_max,
    min(tpot_p90) AS tpot_p90_min,
    max(tpot_p90) AS tpot_p90_max
  FROM block_values
  GROUP BY id
), signature_halves AS (
  SELECT
    id,
    cluster_id,
    request_signature,
    count(*) FILTER (WHERE credit_ns - origin_ns < 1800e9)::int AS first_half_n,
    count(*) FILTER (WHERE credit_ns - origin_ns >= 1800e9)::int AS second_half_n,
    percentile_cont(.5) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL AND credit_ns - origin_ns < 1800e9) AS ttft_first_half,
    percentile_cont(.5) WITHIN GROUP (ORDER BY ttft_s)
      FILTER (WHERE ttft_s IS NOT NULL AND credit_ns - origin_ns >= 1800e9) AS ttft_second_half,
    percentile_cont(.5) WITHIN GROUP (ORDER BY (end_ns - start_ns) / 1e9)
      FILTER (WHERE credit_ns - origin_ns < 1800e9) AS e2e_first_half,
    percentile_cont(.5) WITHIN GROUP (ORDER BY (end_ns - start_ns) / 1e9)
      FILTER (WHERE credit_ns - origin_ns >= 1800e9) AS e2e_second_half,
    percentile_cont(.5) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0 AND credit_ns - origin_ns < 1800e9) AS tpot_first_half,
    percentile_cont(.5) WITHIN GROUP (ORDER BY tpot_s)
      FILTER (WHERE tpot_s > 0 AND credit_ns - origin_ns >= 1800e9) AS tpot_second_half
  FROM requests
  GROUP BY id, cluster_id, request_signature
), paired_signature_summary AS (
  SELECT
    id,
    count(*) FILTER (
      WHERE first_half_n > 0 AND second_half_n > 0
        AND ttft_first_half > 0 AND ttft_second_half > 0
    )::int AS paired_signatures,
    count(DISTINCT cluster_id) FILTER (
      WHERE first_half_n > 0 AND second_half_n > 0
        AND ttft_first_half > 0 AND ttft_second_half > 0
    )::int AS paired_source_trajectories,
    percentile_cont(.5) WITHIN GROUP (ORDER BY ttft_second_half / ttft_first_half)
      FILTER (
        WHERE first_half_n > 0 AND second_half_n > 0
          AND ttft_first_half > 0 AND ttft_second_half > 0
      ) AS matched_ttft_half_ratio,
    percentile_cont(.5) WITHIN GROUP (ORDER BY e2e_second_half / e2e_first_half)
      FILTER (
        WHERE first_half_n > 0 AND second_half_n > 0
          AND e2e_first_half > 0 AND e2e_second_half > 0
      ) AS matched_e2e_half_ratio,
    percentile_cont(.5) WITHIN GROUP (ORDER BY tpot_second_half / tpot_first_half)
      FILTER (
        WHERE first_half_n > 0 AND second_half_n > 0
          AND tpot_first_half > 0 AND tpot_second_half > 0
      ) AS matched_tpot_half_ratio
  FROM signature_halves
  GROUP BY id
)
SELECT
  c.id,
  c.conc,
  c.hardware,
  c.framework,
  c.model,
  cs.n_requests,
  cs.source_trajectories,
  cs.kish_source_trajectories,
  cs.largest_source_share,
  oc.replay_trajectories,
  oc.workers,
  pv.ttft_p75,
  pv.ttft_p90,
  pv.e2e_p90,
  CASE WHEN pv.tpot_p90 > 0 THEN 1 / pv.tpot_p90 END AS interactivity_p90,
  bs.n_blocks,
  bs.min_block_n,
  bs.min_block_trajectories,
  bs.ttft_p75_min,
  bs.ttft_p75_max,
  bs.ttft_p90_min,
  bs.ttft_p90_max,
  bs.e2e_p90_min,
  bs.e2e_p90_max,
  CASE WHEN bs.tpot_p90_max > 0 THEN 1 / bs.tpot_p90_max END AS interactivity_p90_min,
  CASE WHEN bs.tpot_p90_min > 0 THEN 1 / bs.tpot_p90_min END AS interactivity_p90_max,
  bs.ttft_p90_max / NULLIF(bs.ttft_p90_min, 0) AS ttft_block_ratio,
  bs.e2e_p90_max / NULLIF(bs.e2e_p90_min, 0) AS e2e_block_ratio,
  bs.tpot_p90_max / NULLIF(bs.tpot_p90_min, 0) AS tpot_block_ratio,
  pv.ttft_second_half / NULLIF(pv.ttft_first_half, 0) AS ttft_half_ratio,
  pv.e2e_second_half / NULLIF(pv.e2e_first_half, 0) AS e2e_half_ratio,
  pv.tpot_second_half / NULLIF(pv.tpot_first_half, 0) AS tpot_half_ratio
  ,ps.paired_signatures
  ,ps.paired_source_trajectories
  ,ps.matched_ttft_half_ratio
  ,ps.matched_e2e_half_ratio
  ,ps.matched_tpot_half_ratio
FROM canonical c
JOIN cluster_summary cs USING (id)
JOIN other_counts oc USING (id)
JOIN point_values pv USING (id)
JOIN block_summary bs USING (id)
JOIN paired_signature_summary ps USING (id)
) TO STDOUT WITH (FORMAT csv, HEADER true);

\set ON_ERROR_STOP on
SET statement_timeout = '600s';

-- Root-trajectory exposure for overlap and repeated-configuration analyses.
COPY (
WITH canonical AS (
  SELECT
    br.id,
    br.workflow_run_id,
    br.date,
    br.conc,
    br.image,
    br.offload_mode,
    br.config_id,
    c.hardware,
    c.framework,
    c.model,
    c.precision,
    c.spec_method,
    c.disagg,
    c.is_multinode,
    c.prefill_tp,
    c.prefill_ep,
    c.prefill_dp_attention,
    c.prefill_num_workers,
    c.decode_tp,
    c.decode_ep,
    c.decode_dp_attention,
    c.decode_num_workers,
    c.num_prefill_gpu,
    c.num_decode_gpu,
    COALESCE(ds.dataset_slugs, '') AS dataset_slugs,
    atr.request_timeline
  FROM benchmark_results br
  JOIN configs c ON c.id = br.config_id
  JOIN agentic_trace_replay atr ON atr.id = br.trace_replay_id
  LEFT JOIN LATERAL (
    SELECT string_agg(rd.dataset_slug, ',' ORDER BY rd.dataset_slug) AS dataset_slugs
    FROM run_datasets rd
    WHERE rd.workflow_run_id = br.workflow_run_id
  ) ds ON true
  WHERE br.benchmark_type = 'agentic_traces'
    AND br.error IS NULL
    AND (br.metrics->>'duration_seconds')::float8 BETWEEN 3500 AND 3700
    AND mod(br.id, 10) = :shard
    AND br.id <= :max_id
), trace_counts AS (
  SELECT
    c.id,
    c.workflow_run_id,
    c.date,
    c.conc,
    c.image,
    c.offload_mode,
    c.config_id,
    c.hardware,
    c.framework,
    c.model,
    c.precision,
    c.spec_method,
    c.disagg,
    c.is_multinode,
    c.prefill_tp,
    c.prefill_ep,
    c.prefill_dp_attention,
    c.prefill_num_workers,
    c.decode_tp,
    c.decode_ep,
    c.decode_dp_attention,
    c.decode_num_workers,
    c.num_prefill_gpu,
    c.num_decode_gpu,
    c.dataset_slugs,
    COALESCE(NULLIF(r->>'srcTrace', ''), NULLIF(r->>'cid', ''), 'unknown') AS source_trace_id,
    count(*)::int AS n_requests,
    min((r->>'credit')::float8) AS first_credit_ns,
    max((r->>'credit')::float8) AS last_credit_ns
  FROM canonical c
  CROSS JOIN LATERAL jsonb_array_elements(c.request_timeline->'requests') r
  WHERE r->>'phase' = 'profiling'
    AND COALESCE((r->>'cancelled')::boolean, false) = false
  GROUP BY
    c.id,
    c.workflow_run_id,
    c.date,
    c.conc,
    c.image,
    c.offload_mode,
    c.config_id,
    c.hardware,
    c.framework,
    c.model,
    c.precision,
    c.spec_method,
    c.disagg,
    c.is_multinode,
    c.prefill_tp,
    c.prefill_ep,
    c.prefill_dp_attention,
    c.prefill_num_workers,
    c.decode_tp,
    c.decode_ep,
    c.decode_dp_attention,
    c.decode_num_workers,
    c.num_prefill_gpu,
    c.num_decode_gpu,
    c.dataset_slugs,
    source_trace_id
)
SELECT *
FROM trace_counts
ORDER BY id, first_credit_ns, source_trace_id
) TO STDOUT WITH (FORMAT csv, HEADER true);

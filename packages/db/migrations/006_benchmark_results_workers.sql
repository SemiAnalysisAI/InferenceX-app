-- ============================================================
-- BENCHMARK_RESULTS — per-worker measured power breakdown
-- ============================================================
--
-- Multinode and disaggregated runs emit a per-worker telemetry array from the
-- runner's aggregate_power.py — one entry per prefill/decode/agg/frontend
-- worker with {role, worker_idx, hosts[], num_gpus, avg_power_w, ...optional
-- temp/util/mem fields}. We keep this in a separate JSONB column rather than
-- stuffing it into `metrics` because:
--
--   1. metrics is a flat Record<string, number>: every API consumer (and the
--      benchmark-mapper warning) assumes scalar values. An array of objects
--      under one key would break parseNum and surface as "missing" everywhere.
--   2. workers is large (one entry per worker, potentially dozens on a wide
--      multinode disagg run) and only used by a narrow set of features.
--      Keeping it in its own column lets future queries skip the field when
--      a SELECT doesn't need it.
--
-- Null for single-node runs (which don't have per-worker splits) and any
-- benchmark predating the aggregate_power.py multinode patch.

alter table benchmark_results
  add column workers jsonb;

-- Re-create the latest_benchmarks materialized view so the new column rides
-- on the view as well. SELECT * in the original definition would not pick up
-- columns added after the view was created, so DROP + CREATE is the cleanest
-- path. The view's pre-existing indexes are also re-created.

drop materialized view if exists latest_benchmarks;

create materialized view latest_benchmarks as
select distinct on (br.config_id, br.conc, br.isl, br.osl)
  br.*
from benchmark_results br
join latest_workflow_runs wr on wr.id = br.workflow_run_id
where br.error is null
order by br.config_id, br.conc, br.isl, br.osl,
         br.date desc, wr.run_started_at desc nulls last;

create unique index latest_benchmarks_pk on latest_benchmarks (config_id, conc, isl, osl);
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

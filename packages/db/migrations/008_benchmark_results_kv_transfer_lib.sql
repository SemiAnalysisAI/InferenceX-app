-- ============================================================
-- BENCHMARK_RESULTS.KV_TRANSFER_LIB — KV-cache transfer library
-- ============================================================
--
-- Disaggregated runs move KV cache from prefill to decode workers through a
-- transfer library (mooncake, nixl, mori, ucx). The benchmarking repo now
-- derives it at result-processing time (InferenceX utils/kv_transfer_lib.py)
-- and emits an optional `kv_transfer_lib` string on each result row.
--
-- Stored on benchmark_results, NOT on configs: the library is result-level
-- metadata, deliberately excluded from the config natural key so config
-- identity — and therefore historical trend-line continuity — is unchanged.
-- NULL means unknown: every row ingested before the runner emitted the field,
-- non-disagg runs (no KV transfer), and runs whose recipe could not be
-- resolved. Consumers must render nothing for NULL rather than assume a
-- default.

alter table benchmark_results add column kv_transfer_lib text;

alter table benchmark_results
  add constraint benchmark_results_kv_transfer_lib_lowercase
  check (kv_transfer_lib is null or kv_transfer_lib = lower(kv_transfer_lib));

-- latest_benchmarks materializes `select br.*` at creation time, so it must be
-- rebuilt to expose the new column. Definition is identical to migration 007.

drop materialized view if exists latest_benchmarks;

create materialized view latest_benchmarks as
with winners as (
  select distinct on (br.config_id, br.benchmark_type, br.isl, br.osl)
         br.config_id, br.benchmark_type, br.isl, br.osl,
         br.workflow_run_id as winning_run_id
  from benchmark_results br
  join latest_workflow_runs wr on wr.id = br.workflow_run_id
  where br.error is null
  order by br.config_id, br.benchmark_type, br.isl, br.osl,
           br.date desc, wr.run_started_at desc nulls last, br.workflow_run_id desc
)
select br.*
from benchmark_results br
join winners w
  on  w.config_id      = br.config_id
  and w.benchmark_type = br.benchmark_type
  and w.isl is not distinct from br.isl
  and w.osl is not distinct from br.osl
  and w.winning_run_id = br.workflow_run_id
where br.error is null;

create unique index latest_benchmarks_pk
  on latest_benchmarks (config_id, conc, isl, osl, benchmark_type);
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

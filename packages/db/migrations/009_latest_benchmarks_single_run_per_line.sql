-- ============================================================
-- LATEST_BENCHMARKS — one run per line (no cross-run stitching)
-- ============================================================
--
-- Previously the view did `distinct on (config_id, conc, isl, osl)` ordered by
-- date desc — resolved INDEPENDENTLY per concurrency. So if a newer run
-- re-measured only some concurrencies (a partial re-sweep), the concurrencies it
-- skipped fell back to an older run that did measure them, and a single chart line
-- ended up stitched from points produced by different runs on different dates.
--
-- A line is one config + sequence + offload mode
-- (config_id, benchmark_type, isl, osl, offload_mode) plotted
-- across concurrencies, and it must come from a SINGLE workflow run. We pick the
-- newest run per line (newest date, then latest sweep by run_started_at, then
-- highest workflow_run_id so exactly one run wins even on a same-day / null tie),
-- then keep EVERY concurrency that one run measured. A partial re-sweep therefore
-- truncates the line to its own concurrencies rather than borrowing an older run's.

drop materialized view if exists latest_benchmarks;

create materialized view latest_benchmarks as
with winners as (
  select distinct on (br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode)
         br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
         br.workflow_run_id as winning_run_id
  from benchmark_results br
  join latest_workflow_runs wr on wr.id = br.workflow_run_id
  where br.error is null
  order by br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
           br.date desc, wr.run_started_at desc nulls last, br.workflow_run_id desc
)
select br.*
from benchmark_results br
join winners w
  on  w.config_id      = br.config_id
  and w.benchmark_type = br.benchmark_type
  and w.isl is not distinct from br.isl
  and w.osl is not distinct from br.osl
  and w.offload_mode = br.offload_mode
  and w.winning_run_id = br.workflow_run_id
where br.error is null;

-- Unique key now includes benchmark_type (part of the line key). One run per line
-- guarantees one row per concurrency, so this stays unique and keeps
-- REFRESH MATERIALIZED VIEW CONCURRENTLY working.
create unique index latest_benchmarks_pk
  on latest_benchmarks (config_id, conc, isl, osl, benchmark_type, offload_mode)
  nulls not distinct;
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

-- ============================================================
-- LATEST_BENCHMARKS — tiebreak same-day runs by sweep start time
-- ============================================================
--
-- The original view ordered DISTINCT ON only by br.date (calendar day), so two
-- sweeps on main on the same day tied and Postgres picked an arbitrary one.
-- With multiple sweeps per day this leaves a mix of run outputs in the view —
-- e.g. a re-sweep that updates a recipe can be partially shadowed by the
-- earlier sweep at the same configs.
--
-- wr.run_started_at carries the latest attempt's wall-clock start (per the
-- GitHub API), so a re-run also wins the tiebreak against the original.

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

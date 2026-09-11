-- Power audit provenance lives in dedicated JSONB columns so `metrics` stays
-- a flat Record<string, number>. NULL does not establish age or validity.

-- Earlier previews may already have the audit columns under the old filename.
alter table benchmark_results
  add column if not exists power_invalid_reasons jsonb;

alter table benchmark_results
  add column if not exists power_audit jsonb;

-- Re-create the view so `br.*` includes the audit columns while preserving
-- migration 014's shared AgentX curve scope and append-only snapshot semantics.

drop materialized view latest_benchmarks;
create materialized view latest_benchmarks as
with recursive ranked_runs as (
  select benchmark_curve_runs.*,
    row_number() over (
      partition by curve_scope
      order by date desc, run_started_at desc nulls last, workflow_run_id desc
    ) as run_rank
  from benchmark_curve_runs
), curve_runs as (
  select ranked_runs.*, image as root_image,
    date as snapshot_date, workflow_run_id as snapshot_workflow_run_id
  from ranked_runs where run_rank = 1

  union all

  select older.*, current.root_image, current.snapshot_date, current.snapshot_workflow_run_id
  from curve_runs current
  join ranked_runs older
    on older.curve_scope = current.curve_scope
    and older.run_rank = current.run_rank + 1
  where current.append_only
    and current.image_count = 1 and current.images_complete
    and older.image_count = 1 and older.images_complete
    and older.image = current.root_image
)
select distinct on (
  br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode, br.recipe_fingerprint, br.conc
)
  br.*, cr.snapshot_date, cr.snapshot_workflow_run_id
from curve_runs cr
join benchmark_results br on br.workflow_run_id = cr.workflow_run_id
join configs c on c.id = br.config_id
  and benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
    br.benchmark_type, br.isl, br.osl, c.spec_method, c.disagg, br.offload_mode) = cr.curve_scope
where br.error is null
order by br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
  br.recipe_fingerprint, br.conc, cr.run_rank;

create unique index latest_benchmarks_pk
  on latest_benchmarks (config_id, conc, isl, osl, benchmark_type, offload_mode, recipe_fingerprint)
  nulls not distinct;
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

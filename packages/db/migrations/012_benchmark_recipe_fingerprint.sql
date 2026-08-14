-- ============================================================
-- BENCHMARK RECIPE FINGERPRINTS
-- ============================================================
--
-- A generated recipe can differ in fields that are not normalized into configs
-- (for example pipeline parallelism or launcher settings). Keep those variants
-- distinct even when they share topology, scenario, and concurrency. Historical
-- rows remain NULL and retain the previous one-point-per-natural-key behavior.

alter table benchmark_results
  add column recipe_fingerprint text;

alter table benchmark_results
  drop constraint benchmark_results_unique;

alter table benchmark_results
  add constraint benchmark_results_unique unique nulls not distinct (
    workflow_run_id,
    config_id,
    benchmark_type,
    isl,
    osl,
    conc,
    offload_mode,
    recipe_fingerprint
  );

drop materialized view if exists latest_benchmarks;

create materialized view latest_benchmarks as
with recursive run_lines as (
  select
    c.model,
    c.hardware,
    c.framework,
    c.precision,
    c.disagg,
    case when br.benchmark_type = 'agentic_traces' then '' else c.spec_method end as line_spec_method,
    br.benchmark_type,
    br.isl,
    br.osl,
    br.offload_mode,
    br.workflow_run_id,
    br.date,
    wr.run_started_at,
    wr.append_only,
    min(br.image) as image,
    count(distinct br.image) as image_count,
    bool_and(br.image is not null) as images_complete
  from benchmark_results br
  join configs c on c.id = br.config_id
  join latest_workflow_runs wr on wr.id = br.workflow_run_id
  where br.error is null
  group by
    c.model, c.hardware, c.framework, c.precision, c.disagg,
    case when br.benchmark_type = 'agentic_traces' then '' else c.spec_method end,
    br.benchmark_type, br.isl, br.osl, br.offload_mode,
    br.workflow_run_id, br.date, wr.run_started_at, wr.append_only
), ranked_runs as (
  select
    run_lines.*,
    row_number() over (
      partition by
        model, hardware, framework, precision, disagg, line_spec_method,
        benchmark_type, isl, osl, offload_mode
      order by date desc, run_started_at desc nulls last, workflow_run_id desc
    ) as run_rank
  from run_lines
), curve_runs as (
  select
    ranked_runs.*,
    ranked_runs.image as root_image,
    ranked_runs.date as snapshot_date,
    ranked_runs.workflow_run_id as snapshot_workflow_run_id
  from ranked_runs
  where run_rank = 1

  union all

  select
    older.*,
    current.root_image,
    current.snapshot_date,
    current.snapshot_workflow_run_id
  from curve_runs current
  join ranked_runs older
    on older.model = current.model
    and older.hardware = current.hardware
    and older.framework = current.framework
    and older.precision = current.precision
    and older.disagg = current.disagg
    and older.line_spec_method = current.line_spec_method
    and older.benchmark_type = current.benchmark_type
    and older.isl is not distinct from current.isl
    and older.osl is not distinct from current.osl
    and older.offload_mode = current.offload_mode
    and older.run_rank = current.run_rank + 1
  where current.append_only
    and current.image_count = 1
    and current.images_complete
    and older.image_count = 1
    and older.images_complete
    and older.image = current.root_image
)
select distinct on (
  br.config_id,
  br.benchmark_type,
  br.isl,
  br.osl,
  br.offload_mode,
  br.recipe_fingerprint,
  br.conc
)
  br.*,
  cr.snapshot_date,
  cr.snapshot_workflow_run_id
from curve_runs cr
join benchmark_results br
  on br.workflow_run_id = cr.workflow_run_id
  and br.benchmark_type = cr.benchmark_type
  and br.isl is not distinct from cr.isl
  and br.osl is not distinct from cr.osl
  and br.offload_mode = cr.offload_mode
join configs point_c
  on point_c.id = br.config_id
  and point_c.model = cr.model
  and point_c.hardware = cr.hardware
  and point_c.framework = cr.framework
  and point_c.precision = cr.precision
  and point_c.disagg = cr.disagg
  and case when br.benchmark_type = 'agentic_traces' then '' else point_c.spec_method end = cr.line_spec_method
where br.error is null
order by
  br.config_id,
  br.benchmark_type,
  br.isl,
  br.osl,
  br.offload_mode,
  br.recipe_fingerprint,
  br.conc,
  cr.run_rank;

create unique index latest_benchmarks_pk
  on latest_benchmarks (
    config_id,
    conc,
    isl,
    osl,
    benchmark_type,
    offload_mode,
    recipe_fingerprint
  )
  nulls not distinct;
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

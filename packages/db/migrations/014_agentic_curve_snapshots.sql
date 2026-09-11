-- AgentX publishes one version of a curve across topology, decoding and offload
-- choices. Point identity and all historical benchmark rows remain unchanged.
-- This function is the replacement boundary used by both database read paths;
-- its TypeScript counterpart is packages/constants/src/benchmark-curve.ts.
create function benchmark_curve_scope(
  p_model text, p_hardware text, p_framework text, p_precision text,
  p_benchmark_type text, p_isl integer, p_osl integer,
  p_spec_method text, p_disagg boolean, p_offload_mode text
) returns jsonb language sql immutable parallel safe as $$
  select jsonb_build_array(
    p_model, p_hardware, p_framework, p_precision, p_benchmark_type, p_isl, p_osl,
    case when p_benchmark_type = 'agentic_traces' then '' else p_spec_method end,
    case when p_benchmark_type = 'agentic_traces' then false else p_disagg end,
    case when p_benchmark_type = 'agentic_traces' then '' else coalesce(p_offload_mode, 'off') end
  )
$$;

-- Match existing ingestion eligibility: successful result rows from the latest
-- stored attempt. Workflow conclusion is not a publication signal; historically
-- accepted measurements can come from workflows whose later upload/eval failed.
create view benchmark_curve_runs as
select
  c.model, br.benchmark_type, br.isl, br.osl,
  benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
    br.benchmark_type, br.isl, br.osl, c.spec_method, c.disagg, br.offload_mode) as curve_scope,
  br.workflow_run_id, br.date, wr.run_started_at, wr.github_run_id,
  wr.append_only,
  min(br.image) as image,
  count(distinct br.image) as image_count,
  bool_and(br.image is not null) as images_complete
from benchmark_results br
join configs c on c.id = br.config_id
join latest_workflow_runs wr on wr.id = br.workflow_run_id
where br.error is null
group by
  c.model, br.benchmark_type, br.isl, br.osl,
  benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
    br.benchmark_type, br.isl, br.osl, c.spec_method, c.disagg, br.offload_mode),
  br.workflow_run_id, br.date, wr.run_started_at, wr.github_run_id, wr.append_only;

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

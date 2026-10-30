-- Append-only inheritance compares images per topology line instead of per
-- curve. An AgentX curve spans AGG/disagg, speculative-decoding and offload
-- lines that may run different images, so the per-curve rule never let a
-- mixed-image append-only run extend its predecessor. Fixed-sequence scopes
-- hold one line and keep their previous rule. packages/db/src/queries/benchmarks.ts
-- runs the same run_line_images query inline.
drop materialized view latest_benchmarks;

create materialized view latest_benchmarks as
with recursive run_line_images as (
  select workflow_run_id, date, curve_scope,
    case
      when bool_and(image is not null)
        and count(distinct jsonb_build_array(line, image)) = count(distinct line)
      then jsonb_object_agg(line, image)
    end as line_images
  from (
    select br.workflow_run_id, br.date, br.image,
      benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
        br.benchmark_type, br.isl, br.osl, c.spec_method, c.disagg, br.offload_mode) as curve_scope,
      benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
        'single_turn', br.isl, br.osl, c.spec_method, c.disagg, br.offload_mode)::text as line
    from benchmark_results br
    join configs c on c.id = br.config_id
    where br.error is null
  ) points
  group by workflow_run_id, date, curve_scope
), ranked_runs as (
  select benchmark_curve_runs.*, run_line_images.line_images,
    row_number() over (
      partition by curve_scope
      order by date desc, run_started_at desc nulls last, workflow_run_id desc
    ) as run_rank
  from benchmark_curve_runs
  join run_line_images using (workflow_run_id, date, curve_scope)
), curve_runs as (
  select ranked_runs.*, line_images as chain_images,
    date as snapshot_date, workflow_run_id as snapshot_workflow_run_id
  from ranked_runs where run_rank = 1

  union all

  select older.*, current.chain_images || older.line_images,
    current.snapshot_date, current.snapshot_workflow_run_id
  from curve_runs current
  join ranked_runs older
    on older.curve_scope = current.curve_scope
    and older.run_rank = current.run_rank + 1
  where current.append_only
    and current.chain_images is not null
    and older.line_images is not null
    and not exists (
      select 1 from jsonb_each_text(older.line_images) older_line
      where current.chain_images ->> older_line.key <> older_line.value
    )
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

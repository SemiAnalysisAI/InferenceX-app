
set local lock_timeout = '5s';

create table if not exists benchmark_curve_run_lines (
  workflow_run_id bigint  not null references workflow_runs(id) on delete cascade,
  date            date    not null,
  curve_scope     jsonb   not null,
  model           text    not null,
  benchmark_type  text    not null,
  isl             integer,
  osl             integer,
  image           text,
  image_count     bigint  not null,
  images_complete boolean not null,
  line_images     jsonb,
  point_ids       bigint[] not null,

  primary key (workflow_run_id, date, curve_scope)
);

create index if not exists benchmark_curve_run_lines_model_idx
  on benchmark_curve_run_lines (model);

create or replace function refresh_benchmark_curve_run_lines(p_run_ids bigint[])
returns void language plpgsql as $$
begin
  if coalesce(cardinality(p_run_ids), 0) = 0 then
    return;
  end if;
  perform 1 from workflow_runs where id = any(p_run_ids) order by id for no key update;

  delete from benchmark_curve_run_lines where workflow_run_id = any(p_run_ids);

  insert into benchmark_curve_run_lines (
    workflow_run_id, date, curve_scope, model, benchmark_type, isl, osl,
    image, image_count, images_complete, line_images, point_ids
  )
  with points as (
    select br.id, br.workflow_run_id, br.date, br.image, c.model,
      br.benchmark_type, br.isl, br.osl,
      benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
        br.benchmark_type, br.isl, br.osl, c.spec_method, c.disagg, br.offload_mode) as curve_scope,
      jsonb_build_array(c.disagg, coalesce(br.offload_mode, 'off'))::text as line
    from benchmark_results br
    join configs c on c.id = br.config_id
    where br.error is null and br.workflow_run_id = any(p_run_ids)
  ), scope_points as (
    select workflow_run_id, curve_scope, array_agg(id order by id) as point_ids
    from points
    group by workflow_run_id, curve_scope
  )
  select p.workflow_run_id, p.date, p.curve_scope, p.model, p.benchmark_type, p.isl, p.osl,
    min(p.image),
    count(distinct p.image),
    bool_and(p.image is not null),
    case
      when bool_and(p.image is not null)
        and count(distinct jsonb_build_array(p.line, p.image)) = count(distinct p.line)
      then jsonb_object_agg(p.line, p.image)
    end,
    s.point_ids
  from points p
  join scope_points s using (workflow_run_id, curve_scope)
  group by p.workflow_run_id, p.date, p.curve_scope, p.model, p.benchmark_type,
    p.isl, p.osl, s.point_ids;
end;
$$;

create or replace function benchmark_results_curve_lines_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform refresh_benchmark_curve_run_lines(array(select distinct workflow_run_id from new_rows));
  elsif tg_op = 'DELETE' then
    perform refresh_benchmark_curve_run_lines(array(select distinct workflow_run_id from old_rows));
  elsif tg_op = 'UPDATE' then
    perform refresh_benchmark_curve_run_lines(array(
      select distinct workflow_run_id from (
        (select id, workflow_run_id, config_id, benchmark_type, date, isl, osl,
            offload_mode, image, error is null from old_rows
          except
          select id, workflow_run_id, config_id, benchmark_type, date, isl, osl,
            offload_mode, image, error is null from new_rows)
        union all
        (select id, workflow_run_id, config_id, benchmark_type, date, isl, osl,
            offload_mode, image, error is null from new_rows
          except
          select id, workflow_run_id, config_id, benchmark_type, date, isl, osl,
            offload_mode, image, error is null from old_rows)
      ) changed
    ));
  else
    delete from benchmark_curve_run_lines;
  end if;
  return null;
end;
$$;

drop trigger if exists benchmark_results_curve_lines_insert on benchmark_results;
create trigger benchmark_results_curve_lines_insert
  after insert on benchmark_results
  referencing new table as new_rows
  for each statement execute function benchmark_results_curve_lines_trigger();

drop trigger if exists benchmark_results_curve_lines_update on benchmark_results;
create trigger benchmark_results_curve_lines_update
  after update on benchmark_results
  referencing old table as old_rows new table as new_rows
  for each statement execute function benchmark_results_curve_lines_trigger();

drop trigger if exists benchmark_results_curve_lines_delete on benchmark_results;
create trigger benchmark_results_curve_lines_delete
  after delete on benchmark_results
  referencing old table as old_rows
  for each statement execute function benchmark_results_curve_lines_trigger();

drop trigger if exists benchmark_results_curve_lines_truncate on benchmark_results;
create trigger benchmark_results_curve_lines_truncate
  after truncate on benchmark_results
  for each statement execute function benchmark_results_curve_lines_trigger();

create or replace function configs_curve_lines_trigger()
returns trigger language plpgsql as $$
begin
  perform refresh_benchmark_curve_run_lines(array(
    select distinct br.workflow_run_id
    from benchmark_results br
    where br.config_id in (
      select id from (
        (select id, model, hardware, framework, precision, spec_method, disagg from old_rows
          except
          select id, model, hardware, framework, precision, spec_method, disagg from new_rows)
        union all
        (select id, model, hardware, framework, precision, spec_method, disagg from new_rows
          except
          select id, model, hardware, framework, precision, spec_method, disagg from old_rows)
      ) changed
    )
  ));
  return null;
end;
$$;

drop trigger if exists configs_curve_lines_update on configs;
create trigger configs_curve_lines_update
  after update on configs
  referencing old table as old_rows new table as new_rows
  for each statement execute function configs_curve_lines_trigger();

select refresh_benchmark_curve_run_lines(array(select id from workflow_runs));

drop materialized view if exists latest_benchmarks;

create or replace view benchmark_curve_runs as
select l.model, l.benchmark_type, l.isl, l.osl, l.curve_scope,
  l.workflow_run_id, l.date, wr.run_started_at, wr.github_run_id, wr.append_only,
  l.image, l.image_count, l.images_complete
from benchmark_curve_run_lines l
join latest_workflow_runs wr on wr.id = l.workflow_run_id;

create materialized view latest_benchmarks as
with recursive ranked_runs as (
  select l.curve_scope, l.workflow_run_id, l.date, l.line_images, l.point_ids,
    wr.append_only,
    row_number() over (
      partition by l.curve_scope
      order by l.date desc, wr.run_started_at desc nulls last, l.workflow_run_id desc
    ) as run_rank
  from benchmark_curve_run_lines l
  join latest_workflow_runs wr on wr.id = l.workflow_run_id
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
), selected_points as (
  select distinct on (
    br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode, br.recipe_fingerprint, br.conc
  )
    br.id, cr.snapshot_date, cr.snapshot_workflow_run_id
  from curve_runs cr
  cross join lateral unnest(cr.point_ids) as point(id)
  join benchmark_results br on br.id = point.id
  order by br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
    br.recipe_fingerprint, br.conc, cr.run_rank
)
select br.*, sp.snapshot_date, sp.snapshot_workflow_run_id
from selected_points sp
join benchmark_results br on br.id = sp.id;

create unique index latest_benchmarks_pk
  on latest_benchmarks (config_id, conc, isl, osl, benchmark_type, offload_mode, recipe_fingerprint)
  nulls not distinct;
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

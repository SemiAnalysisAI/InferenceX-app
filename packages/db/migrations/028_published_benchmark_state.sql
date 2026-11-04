set local lock_timeout = '5s';

create table if not exists latest_benchmark_points (
  id                       bigint primary key,
  model                    text   not null,
  curve_scope              jsonb  not null,
  snapshot_date            date   not null,
  snapshot_workflow_run_id bigint not null
);

create index if not exists latest_benchmark_points_model_idx on latest_benchmark_points (model);
create index if not exists latest_benchmark_points_scope_idx on latest_benchmark_points (curve_scope);
create index if not exists benchmark_curve_run_lines_scope_idx on benchmark_curve_run_lines (curve_scope);
create index if not exists benchmark_results_publication_key_idx on benchmark_results
  (date, benchmark_type, coalesce(isl, 0), coalesce(osl, 0)) where error is null;

create table if not exists published_availability (
  model          text    not null,
  isl            integer,
  osl            integer,
  precision      text    not null,
  hardware       text    not null,
  framework      text    not null,
  spec_method    text    not null,
  disagg         boolean not null,
  benchmark_type text    not null,
  date           date    not null,
  constraint published_availability_natural_key unique nulls not distinct
    (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date)
);

create table if not exists published_availability_dates (
  date date primary key,
  rows text not null
);

create table if not exists latest_benchmark_dirty_scopes (
  curve_scope jsonb not null
);

create table if not exists published_availability_dirty_keys (
  model          text    not null,
  isl            integer,
  osl            integer,
  benchmark_type text    not null,
  date           date    not null
);

create table if not exists published_benchmark_pending (
  txid xid8 primary key default pg_current_xact_id()
);

create or replace function refresh_latest_benchmark_points(p_scopes jsonb[])
returns void language plpgsql as $$
begin
  if coalesce(cardinality(p_scopes), 0) = 0 then
    return;
  end if;

  delete from latest_benchmark_points p
  using (select distinct unnest(p_scopes) as curve_scope) s
  where p.curve_scope = s.curve_scope;

  insert into latest_benchmark_points (id, model, curve_scope, snapshot_date, snapshot_workflow_run_id)
  with recursive ranked_runs as (
    select l.model, l.curve_scope, l.workflow_run_id, l.date, l.line_images, l.point_ids,
      wr.append_only,
      row_number() over (
        partition by l.curve_scope
        order by l.date desc, wr.run_started_at desc nulls last, l.workflow_run_id desc
      ) as run_rank
    from benchmark_curve_run_lines l
    join (select distinct unnest(p_scopes) as curve_scope) s on s.curve_scope = l.curve_scope
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
  )
  select distinct on (
    br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode, br.recipe_fingerprint, br.conc
  )
    br.id, cr.model, cr.curve_scope, cr.snapshot_date, cr.snapshot_workflow_run_id
  from curve_runs cr
  cross join lateral unnest(cr.point_ids) as point(id)
  join benchmark_results br on br.id = point.id
  order by br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
    br.recipe_fingerprint, br.conc, cr.run_rank;
end;
$$;

create or replace function refresh_published_availability()
returns void language plpgsql as $$
begin
  if not exists (select 1 from published_availability_dirty_keys) then
    return;
  end if;

  delete from published_availability p
  using (
    select distinct model, isl, osl, benchmark_type, date from published_availability_dirty_keys
  ) k
  where p.model = k.model
    and (p.isl is null) = (k.isl is null) and coalesce(p.isl, 0) = coalesce(k.isl, 0)
    and (p.osl is null) = (k.osl is null) and coalesce(p.osl, 0) = coalesce(k.osl, 0)
    and p.benchmark_type = k.benchmark_type
    and p.date = k.date;

  insert into published_availability (
    model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date
  )
  with keys as (
    select distinct model, isl, osl, benchmark_type, date from published_availability_dirty_keys
  ), live as (
    select distinct c.model, c.hardware, c.framework, c.precision,
      br.isl, br.osl, br.benchmark_type, br.date
    from keys k
    join benchmark_results br
      on br.date = k.date
      and br.benchmark_type = k.benchmark_type
      and coalesce(br.isl, 0) = coalesce(k.isl, 0)
      and coalesce(br.osl, 0) = coalesce(k.osl, 0)
      and (br.isl is null) = (k.isl is null)
      and (br.osl is null) = (k.osl is null)
    join configs c on c.id = br.config_id and c.model = k.model
    join workflow_runs wr on wr.id = br.workflow_run_id
    where br.error is null
      and wr.conclusion is not null
      and not exists (
        select 1 from workflow_runs newer
        where newer.github_run_id = wr.github_run_id and newer.run_attempt > wr.run_attempt
      )
  )
  select a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method,
    a.disagg, a.benchmark_type, a.date
  from availability a
  join live l
    on l.model = a.model
    and l.hardware = a.hardware
    and l.framework = a.framework
    and l.precision = a.precision
    and (l.isl is null) = (a.isl is null) and coalesce(l.isl, 0) = coalesce(a.isl, 0)
    and (l.osl is null) = (a.osl is null) and coalesce(l.osl, 0) = coalesce(a.osl, 0)
    and l.benchmark_type = a.benchmark_type
    and l.date = a.date;

  delete from published_availability_dates d
  using (select distinct date from published_availability_dirty_keys) k
  where d.date = k.date;

  insert into published_availability_dates (date, rows)
  select a.date, string_agg(row_to_json(o)::text, ',' order by a.model, a.hardware, a.framework,
    a.precision, a.benchmark_type, a.isl, a.osl, a.spec_method, a.disagg)
  from published_availability a
  cross join lateral (
    select a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method,
      a.disagg, a.benchmark_type, a.date::text as date
  ) o
  where a.date in (select date from published_availability_dirty_keys)
  group by a.date;

  delete from published_availability_dirty_keys;
end;
$$;

create or replace function publish_benchmark_changes()
returns trigger language plpgsql as $$
declare
  v_scopes jsonb[];
begin
  perform pg_advisory_xact_lock(hashtextextended('publish_benchmark_changes', 0));

  with taken as (delete from latest_benchmark_dirty_scopes returning curve_scope)
  select array_agg(distinct curve_scope) into v_scopes from taken;
  perform refresh_latest_benchmark_points(v_scopes);
  perform refresh_published_availability();
  delete from published_benchmark_pending where txid = new.txid;
  return null;
end;
$$;

drop trigger if exists published_benchmark_pending_publish on published_benchmark_pending;
create constraint trigger published_benchmark_pending_publish
  after insert on published_benchmark_pending
  deferrable initially deferred
  for each row execute function publish_benchmark_changes();

create or replace function mark_all_published_benchmark_state_dirty()
returns trigger language plpgsql as $$
begin
  insert into latest_benchmark_dirty_scopes (curve_scope)
  select distinct curve_scope from latest_benchmark_points;
  insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
  select distinct model, isl, osl, benchmark_type, date from published_availability;
  insert into published_benchmark_pending default values on conflict do nothing;
  return null;
end;
$$;

create or replace function benchmark_curve_run_lines_publication_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    insert into latest_benchmark_dirty_scopes (curve_scope)
    select distinct curve_scope from new_rows;
    insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
    select distinct model, isl, osl, benchmark_type, date from new_rows;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    insert into latest_benchmark_dirty_scopes (curve_scope)
    select distinct curve_scope from old_rows;
    insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
    select distinct model, isl, osl, benchmark_type, date from old_rows;
  end if;
  insert into published_benchmark_pending default values on conflict do nothing;
  return null;
end;
$$;

drop trigger if exists benchmark_curve_run_lines_publication_insert on benchmark_curve_run_lines;
create trigger benchmark_curve_run_lines_publication_insert
  after insert on benchmark_curve_run_lines
  referencing new table as new_rows
  for each statement execute function benchmark_curve_run_lines_publication_trigger();

drop trigger if exists benchmark_curve_run_lines_publication_update on benchmark_curve_run_lines;
create trigger benchmark_curve_run_lines_publication_update
  after update on benchmark_curve_run_lines
  referencing old table as old_rows new table as new_rows
  for each statement execute function benchmark_curve_run_lines_publication_trigger();

drop trigger if exists benchmark_curve_run_lines_publication_delete on benchmark_curve_run_lines;
create trigger benchmark_curve_run_lines_publication_delete
  after delete on benchmark_curve_run_lines
  referencing old table as old_rows
  for each statement execute function benchmark_curve_run_lines_publication_trigger();

drop trigger if exists benchmark_curve_run_lines_publication_truncate on benchmark_curve_run_lines;
create trigger benchmark_curve_run_lines_publication_truncate
  after truncate on benchmark_curve_run_lines
  for each statement execute function mark_all_published_benchmark_state_dirty();

create or replace function workflow_runs_publication_trigger()
returns trigger language plpgsql as $$
declare
  v_github_run_ids bigint[];
begin
  if tg_op = 'INSERT' then
    v_github_run_ids := array(select distinct github_run_id from new_rows);
  elsif tg_op = 'DELETE' then
    v_github_run_ids := array(select distinct github_run_id from old_rows);
  else
    v_github_run_ids := array(
      select distinct github_run_id from (
        (select id, github_run_id, run_attempt, run_started_at, append_only, conclusion is null
          from old_rows
          except
          select id, github_run_id, run_attempt, run_started_at, append_only, conclusion is null
          from new_rows)
        union all
        (select id, github_run_id, run_attempt, run_started_at, append_only, conclusion is null
          from new_rows
          except
          select id, github_run_id, run_attempt, run_started_at, append_only, conclusion is null
          from old_rows)
      ) changed
    );
  end if;

  if cardinality(v_github_run_ids) > 0 then
    insert into latest_benchmark_dirty_scopes (curve_scope)
    select distinct l.curve_scope
    from workflow_runs wr
    join benchmark_curve_run_lines l on l.workflow_run_id = wr.id
    where wr.github_run_id = any(v_github_run_ids);
    insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
    select distinct l.model, l.isl, l.osl, l.benchmark_type, l.date
    from workflow_runs wr
    join benchmark_curve_run_lines l on l.workflow_run_id = wr.id
    where wr.github_run_id = any(v_github_run_ids);
    insert into published_benchmark_pending default values on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists workflow_runs_publication_insert on workflow_runs;
create trigger workflow_runs_publication_insert
  after insert on workflow_runs
  referencing new table as new_rows
  for each statement execute function workflow_runs_publication_trigger();

drop trigger if exists workflow_runs_publication_update on workflow_runs;
create trigger workflow_runs_publication_update
  after update on workflow_runs
  referencing old table as old_rows new table as new_rows
  for each statement execute function workflow_runs_publication_trigger();

drop trigger if exists workflow_runs_publication_delete on workflow_runs;
create trigger workflow_runs_publication_delete
  after delete on workflow_runs
  referencing old table as old_rows
  for each statement execute function workflow_runs_publication_trigger();

create or replace function benchmark_results_publication_update_trigger()
returns trigger language plpgsql as $$
begin
  insert into latest_benchmark_dirty_scopes (curve_scope)
  select distinct benchmark_curve_scope(c.model, c.hardware, c.framework, c.precision,
    changed.benchmark_type, changed.isl, changed.osl, c.spec_method, c.disagg, changed.offload_mode)
  from (
    (select id, config_id, benchmark_type, isl, osl, offload_mode, recipe_fingerprint, conc
      from old_rows
      except
      select id, config_id, benchmark_type, isl, osl, offload_mode, recipe_fingerprint, conc
      from new_rows)
    union all
    (select id, config_id, benchmark_type, isl, osl, offload_mode, recipe_fingerprint, conc
      from new_rows
      except
      select id, config_id, benchmark_type, isl, osl, offload_mode, recipe_fingerprint, conc
      from old_rows)
  ) changed
  join configs c on c.id = changed.config_id;
  if found then
    insert into published_benchmark_pending default values on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists benchmark_results_publication_update on benchmark_results;
create trigger benchmark_results_publication_update
  after update on benchmark_results
  referencing old table as old_rows new table as new_rows
  for each statement execute function benchmark_results_publication_update_trigger();

create or replace function availability_publication_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
    select distinct model, isl, osl, benchmark_type, date from new_rows;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
    select distinct model, isl, osl, benchmark_type, date from old_rows;
  end if;
  insert into published_benchmark_pending default values on conflict do nothing;
  return null;
end;
$$;

drop trigger if exists availability_publication_insert on availability;
create trigger availability_publication_insert
  after insert on availability
  referencing new table as new_rows
  for each statement execute function availability_publication_trigger();

drop trigger if exists availability_publication_update on availability;
create trigger availability_publication_update
  after update on availability
  referencing old table as old_rows new table as new_rows
  for each statement execute function availability_publication_trigger();

drop trigger if exists availability_publication_delete on availability;
create trigger availability_publication_delete
  after delete on availability
  referencing old table as old_rows
  for each statement execute function availability_publication_trigger();

drop trigger if exists availability_publication_truncate on availability;
create trigger availability_publication_truncate
  after truncate on availability
  for each statement execute function mark_all_published_benchmark_state_dirty();

truncate latest_benchmark_points, published_availability, published_availability_dates,
  latest_benchmark_dirty_scopes, published_availability_dirty_keys;

select refresh_latest_benchmark_points(array(select distinct curve_scope from benchmark_curve_run_lines));

insert into published_availability_dirty_keys (model, isl, osl, benchmark_type, date)
select distinct model, isl, osl, benchmark_type, date from availability;
select refresh_published_availability();

do $$
begin
  if exists (select 1 from pg_matviews where schemaname = current_schema() and matviewname = 'latest_benchmarks') then
    drop materialized view latest_benchmarks;
  end if;
end;
$$;

create or replace view latest_benchmarks as
select br.*, p.snapshot_date, p.snapshot_workflow_run_id
from latest_benchmark_points p
join benchmark_results br on br.id = p.id;

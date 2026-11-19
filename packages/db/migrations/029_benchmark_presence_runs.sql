set local lock_timeout = '5s';

create table if not exists benchmark_presence_runs (
  trace  boolean not null,
  start  bigint  not null,
  length bigint  not null,
  primary key (trace, start)
);

create table if not exists benchmark_presence_dirty_ids (
  id bigint not null
);

create or replace function refresh_benchmark_presence()
returns void language plpgsql as $$
declare
  v_ids bigint[];
  v_trace boolean[];
  v_lo bigint[];
  v_hi bigint[];
begin
  perform pg_advisory_xact_lock(hashtextextended('refresh_benchmark_presence', 0));

  with taken as (delete from benchmark_presence_dirty_ids returning id)
  select array_agg(distinct id) into v_ids from taken;
  if v_ids is null then
    return;
  end if;

  with touched as (
    select distinct r.trace, r.start
    from unnest(v_ids) d(id)
    cross join (values (true), (false)) k(trace)
    cross join lateral (
      select p.trace, p.start, p.length
      from benchmark_presence_runs p
      where p.trace = k.trace and p.start <= d.id + 1
      order by p.start desc
      limit 2
    ) r
    where r.start + r.length >= d.id
  ), gone as (
    delete from benchmark_presence_runs p
    using touched t
    where p.trace = t.trace and p.start = t.start
    returning p.trace, p.start, p.start + p.length - 1 as finish
  )
  select array_agg(trace), array_agg(start), array_agg(finish) into v_trace, v_lo, v_hi from gone;

  insert into benchmark_presence_runs (trace, start, length)
  with spans as (
    select s.trace, s.lo, s.hi from unnest(v_trace, v_lo, v_hi) s(trace, lo, hi)
    union
    select k.trace, d.id, d.id
    from unnest(v_ids) d(id)
    cross join (values (true), (false)) k(trace)
  ), merged as (
    select trace, min(lo) as lo, max(hi) as hi
    from (
      select trace, lo, hi, count(*) filter (where starts) over (partition by trace order by lo, hi) as grp
      from (
        select trace, lo, hi,
          coalesce(lo > 1 + max(hi) over (
            partition by trace order by lo, hi rows between unbounded preceding and 1 preceding
          ), true) as starts
        from spans
      ) bounded
    ) grouped
    group by trace, grp
  ), present as (
    select m.trace, p.id
    from merged m
    cross join lateral (
      select br.id
      from benchmark_results br
      where not m.trace and br.id between m.lo and m.hi and br.server_log_id is not null
      union all
      select br.id
      from benchmark_results br
      cross join lateral (
        select 1
        from agentic_trace_replay atr
        where atr.id = br.trace_replay_id
          and (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0)
        limit 1
      ) profile
      where m.trace and br.id between m.lo and m.hi
    ) p
  )
  select trace, min(id), count(*)
  from (
    select trace, id, id - row_number() over (partition by trace order by id) as island
    from present
  ) runs
  group by trace, island;
end;
$$;

create or replace function benchmark_results_presence_trigger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'TRUNCATE' then
    delete from benchmark_presence_runs;
    delete from benchmark_presence_dirty_ids;
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into benchmark_presence_dirty_ids (id)
    select id from new_rows where trace_replay_id is not null or server_log_id is not null;
  elsif tg_op = 'DELETE' then
    insert into benchmark_presence_dirty_ids (id)
    select id from old_rows where trace_replay_id is not null or server_log_id is not null;
  else
    insert into benchmark_presence_dirty_ids (id)
    select id from (
      (select id, trace_replay_id, server_log_id from old_rows
        except
        select id, trace_replay_id, server_log_id from new_rows)
      union all
      (select id, trace_replay_id, server_log_id from new_rows
        except
        select id, trace_replay_id, server_log_id from old_rows)
    ) changed;
  end if;
  if found then
    insert into published_benchmark_pending default values on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists benchmark_results_presence_insert on benchmark_results;
create trigger benchmark_results_presence_insert
  after insert on benchmark_results
  referencing new table as new_rows
  for each statement execute function benchmark_results_presence_trigger();

drop trigger if exists benchmark_results_presence_update on benchmark_results;
create trigger benchmark_results_presence_update
  after update on benchmark_results
  referencing old table as old_rows new table as new_rows
  for each statement execute function benchmark_results_presence_trigger();

drop trigger if exists benchmark_results_presence_delete on benchmark_results;
create trigger benchmark_results_presence_delete
  after delete on benchmark_results
  referencing old table as old_rows
  for each statement execute function benchmark_results_presence_trigger();

drop trigger if exists benchmark_results_presence_truncate on benchmark_results;
create trigger benchmark_results_presence_truncate
  after truncate on benchmark_results
  for each statement execute function benchmark_results_presence_trigger();

create or replace function agentic_trace_replay_presence_trigger()
returns trigger language plpgsql as $$
begin
  insert into benchmark_presence_dirty_ids (id)
  select br.id from benchmark_results br where br.trace_replay_id in (old.id, new.id);
  if found then
    insert into published_benchmark_pending default values on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists agentic_trace_replay_presence_insert on agentic_trace_replay;
create trigger agentic_trace_replay_presence_insert
  after insert on agentic_trace_replay
  for each row
  when (new.profile_export_jsonl_gz is not null or new.profile_export_chunk_count > 0)
  execute function agentic_trace_replay_presence_trigger();

drop trigger if exists agentic_trace_replay_presence_update on agentic_trace_replay;
create trigger agentic_trace_replay_presence_update
  after update of id, profile_export_jsonl_gz, profile_export_chunk_count on agentic_trace_replay
  for each row
  when (old.id <> new.id
    or (old.profile_export_jsonl_gz is not null or old.profile_export_chunk_count > 0)
      <> (new.profile_export_jsonl_gz is not null or new.profile_export_chunk_count > 0))
  execute function agentic_trace_replay_presence_trigger();

drop trigger if exists agentic_trace_replay_presence_delete on agentic_trace_replay;
create trigger agentic_trace_replay_presence_delete
  after delete on agentic_trace_replay
  for each row
  when (old.profile_export_jsonl_gz is not null or old.profile_export_chunk_count > 0)
  execute function agentic_trace_replay_presence_trigger();

create or replace function published_benchmark_presence_publish()
returns trigger language plpgsql as $$
begin
  perform refresh_benchmark_presence();
  return null;
end;
$$;

drop trigger if exists published_benchmark_pending_presence on published_benchmark_pending;
create constraint trigger published_benchmark_pending_presence
  after insert on published_benchmark_pending
  deferrable initially deferred
  for each row execute function published_benchmark_presence_publish();

truncate benchmark_presence_runs, benchmark_presence_dirty_ids;

insert into benchmark_presence_runs (trace, start, length)
with present as (
  select br.id, true as trace
  from benchmark_results br
  join agentic_trace_replay atr on atr.id = br.trace_replay_id
  where atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0
  union all
  select br.id, false as trace
  from benchmark_results br
  where br.server_log_id is not null
)
select trace, min(id), count(*)
from (
  select trace, id, id - row_number() over (partition by trace order by id) as island
  from present
) runs
group by trace, island;

set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists request_timeline_sha256 bytea;

create or replace function agentic_trace_replay_request_timeline_sha256()
returns trigger language plpgsql as $$
begin
  new.request_timeline_sha256 := sha256(new.request_timeline_gz);
  return new;
end;
$$;

drop trigger if exists agentic_trace_replay_request_timeline_sha256 on agentic_trace_replay;
create trigger agentic_trace_replay_request_timeline_sha256
  before insert or update of request_timeline_gz, request_timeline_sha256 on agentic_trace_replay
  for each row execute function agentic_trace_replay_request_timeline_sha256();

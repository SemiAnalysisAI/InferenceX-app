-- Preserve large raw AgentX profiles without assembling a >1 GiB bytea value.
-- Apply before deploying readers/writers. Existing inline blobs remain valid.
set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists profile_export_chunk_count integer not null default 0,
  add column if not exists profile_export_compressed_size bigint,
  add column if not exists profile_export_sha256 text;

create table if not exists agentic_trace_profile_chunks (
  trace_replay_id bigint not null references agentic_trace_replay(id) on delete cascade,
  part integer not null check (part >= 0),
  data bytea not null check (octet_length(data) between 1 and 4194304),
  primary key (trace_replay_id, part)
);
alter table agentic_trace_profile_chunks alter column data set storage external;

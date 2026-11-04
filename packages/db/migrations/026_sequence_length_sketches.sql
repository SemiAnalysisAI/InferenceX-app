
set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists sequence_length_sketches bytea,
  add column if not exists sequence_length_sketches_version smallint;

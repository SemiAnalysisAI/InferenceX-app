set local lock_timeout = '5s';

-- Per-attempt data for SLA Targets, built from the original AgentX export and
-- the harness log (etl/sla-attempts.ts). Nullable: rows ingested before this
-- column exists keep null until backfill-sla-attempts fills them, and the
-- SLA Targets routes fall back to the derived request timeline meanwhile.
alter table agentic_trace_replay
  add column if not exists sla_attempts_gz bytea,
  add column if not exists sla_attempts_version smallint,
  add column if not exists sla_attempts_sha256 bytea;

-- Already gzip-compressed, so store it out of line without a second compression pass.
alter table agentic_trace_replay
  alter column sla_attempts_gz set storage external;

set local lock_timeout = '5s';

-- Per-attempt data for SLA Targets of a fixed-sequence benchmark point, built
-- from the `request_records` block of its result row (etl/sla-attempts.ts).
-- AgentX points keep theirs on agentic_trace_replay (030); a fixed-sequence
-- point has no trace row, and benchmark_results stays free of large values.
--
-- One row per point whose result carried the block. Either the encoded data
-- or the reason it could not be built, never both and never neither. A point
-- with no row here has no per-request data: its run predates the block.
create table if not exists benchmark_sla_attempts (
  benchmark_result_id  bigint   primary key references benchmark_results(id) on delete cascade,
  sla_attempts_gz      bytea,
  sla_attempts_version smallint not null,
  sla_attempts_sha256  bytea,
  -- What the point's load setting means: 'request_concurrency' is a limit on
  -- requests in flight, not a user count.
  load_kind            text,
  concurrency_limit    integer,
  unavailable_reason   text,
  unavailable_detail   text,

  constraint benchmark_sla_attempts_one_state
    check ((sla_attempts_gz is null) <> (unavailable_reason is null)),
  constraint benchmark_sla_attempts_identity
    check ((sla_attempts_gz is null) = (sla_attempts_sha256 is null))
);

-- Already gzip-compressed, so store it out of line without a second compression pass.
alter table benchmark_sla_attempts
  alter column sla_attempts_gz set storage external;

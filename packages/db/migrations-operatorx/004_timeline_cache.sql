-- Revision-scoped kernel timelines so a case detail reads a few KB per GPU instead of
-- every raw document of the run. One row per result; timeline is null when unprofiled.
create table opx_run_timelines (
  run_id         bigint not null references opx_runs(id) on delete cascade,
  result_index   int    not null check (result_index >= 0),
  format_version int    not null check (format_version > 0),
  op             text   check (op in ('gemm', 'moe', 'attention')),
  timeline       jsonb,
  primary key (run_id, result_index)
);

-- Revision-scoped projections avoid reading full profiles for comparison charts.
-- Raw documents remain authoritative and continue to serve detail/timeline reads.
create table opx_run_comparisons (
  run_id         bigint not null references opx_runs(id) on delete cascade,
  op             text   not null check (op in ('gemm', 'moe')),
  format_version int    not null check (format_version > 0),
  comparison     jsonb  not null,
  primary key (run_id, op)
);

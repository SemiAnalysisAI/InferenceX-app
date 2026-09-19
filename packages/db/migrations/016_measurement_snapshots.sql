-- A receipt is an immutable measurement snapshot. Interrupted imports resume the same bytes.
create table if not exists measurement_snapshots (
  source_repo text not null,
  source_run_id bigint not null,
  source_attempt integer not null check (source_attempt > 0),
  receipt_id text not null check (receipt_id ~ '^[a-f0-9]{64}$'),
  bundle_digest text not null check (bundle_digest ~ '^[a-f0-9]{64}$'),
  receipt jsonb not null,
  state text not null check (state in ('writing', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_repo, source_run_id, source_attempt)
);

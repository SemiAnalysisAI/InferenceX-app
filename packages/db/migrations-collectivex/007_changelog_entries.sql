-- The InferenceX collectivex/perf-changelog.yaml entries each run publishes (`ingest --pr <n>`).
-- `changes` holds, per selected case the run changed, the previous and new status, kernel
-- generation, library version and pair-period p50 per token count.
create table cx_changelog_entries (
  id          bigserial   primary key,
  run_id      bigint      not null references cx_runs(run_id) on delete cascade,
  entry_index int         not null,
  pr_number   int         not null,
  pr_link     text        not null,
  date        date        not null,
  pools       text[]      not null,
  selectors   jsonb       not null,
  description text        not null,
  changes     jsonb       not null,
  linked_at   timestamptz not null default now(),
  unique (run_id, entry_index)
);

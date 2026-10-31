-- The InferenceX changelog entries (collectivex/perf-changelog.yaml) each stored run publishes.
--
-- An upload names the merged PRs it measures (`admin:db:ingest:collectivex --pr <n>`), and each of
-- their entries is stored against the new run. `changes` holds, for every case the entry selects
-- whose result this run changed, a summary of the previous and the new result (status, kernel
-- generation, library version and pair-period p50 per token count), so a change's effect reads
-- without loading documents. An entry can link to several runs (a PR published pool by pool) and a
-- run to several entries.

create table cx_changelog_entries (
  id             bigserial   primary key,
  run_id         bigint      not null references cx_runs(run_id) on delete cascade,
  entry_index    int         not null,
  pr_number      int         not null,
  pr_link        text        not null,
  date           date        not null,
  pools          text[]      not null,
  selectors      jsonb       not null,
  description    text        not null,
  description_zh text        not null,
  changelog_sha  text        not null,
  changes        jsonb       not null,
  linked_at      timestamptz not null default now(),
  constraint cx_changelog_entries_unique unique (run_id, entry_index)
);

create index cx_changelog_entries_pr on cx_changelog_entries (pr_number);

comment on table cx_changelog_entries is
  'collectivex/perf-changelog.yaml entries of the PRs each run publishes, with the before/after summary of every selected case the run changed.';

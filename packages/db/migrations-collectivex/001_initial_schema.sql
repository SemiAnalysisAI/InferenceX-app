-- CollectiveX sweep runs, stored as RAW artifact documents.
--
-- The sweep JSON contract is expected to change; the shared reader
-- (packages/db/src/collectivex/reader.ts) is the single transform point and
-- runs at API-read time, so rows here are the artifacts' documents verbatim.
-- `summary` is the one precomputed column (CollectiveXRunSummary) so the run
-- picker can list runs without loading their documents.

create table cx_runs (
  run_id        bigint      primary key,
  run_attempt   int         not null,
  version       int         not null,
  generated_at  timestamptz not null,
  source_sha    text        not null,
  source_branch text,
  conclusion    text,
  matrix        jsonb       not null,
  summary       jsonb       not null,
  ingested_at   timestamptz not null default now(),
  -- Tombstone: runs are discovered lazily from GitHub on read, so a deleted
  -- run must leave a marker or the next discovery would re-ingest it.
  -- Deletion clears cx_run_docs but keeps this row with deleted_at set.
  deleted_at    timestamptz
);

-- "Latest run per version" ordering: run_id desc. GitHub run ids increase
-- monotonically with run creation, so this matches lazy discovery's
-- newest-first walk — unlike completion time (generated_at), where a
-- long-failing older run can outlast a newer successful one.
create index cx_runs_version_latest on cx_runs (version, run_id desc);

create table cx_run_docs (
  id     bigserial primary key,
  run_id bigint    not null references cx_runs(run_id) on delete cascade,
  doc    jsonb     not null
);

create index cx_run_docs_run on cx_run_docs (run_id);

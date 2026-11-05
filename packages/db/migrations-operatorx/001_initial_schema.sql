-- OperatorX runs, stored as RAW operatorx documents.
--
-- The results JSON contract is expected to change while OperatorX is a prototype;
-- the normalizer (packages/db/src/operatorx/normalize.ts) is the single transform
-- point and runs at API-read time, so rows here are the run's documents verbatim.
-- `summary` is the one precomputed column so the run list is served without loading
-- any documents.
--
-- A run is identified by `run_key`, supplied by whoever ingests it (a CI ingest uses
-- the Actions run id). Everything else known about a run lives in its documents.

create table opx_runs (
  id            bigserial   primary key,
  run_key       text        not null unique,
  run_attempt   int         not null check (run_attempt > 0),
  generated_at  timestamptz not null,
  source_sha    text        not null,
  source_branch text,
  conclusion    text,
  -- operatorx-manifest.json: the planned shards and their cases
  manifest      jsonb       not null,
  summary       jsonb       not null,
  ingested_at   timestamptz not null default now()
);

create index opx_runs_generated on opx_runs (generated_at desc);

-- One operatorx results JSON per row: a shard's documents are a few MB each, so a
-- run of thousands of cases is never one oversized value, and one shard can be read
-- without the rest. A re-ingest replaces the run and all of its documents.
create table opx_run_docs (
  id          bigserial primary key,
  run_id      bigint    not null references opx_runs(id) on delete cascade,
  -- the attempt that produced this shard: a partial rerun keeps earlier attempts' shards
  run_attempt int       not null,
  shard       text      not null,
  doc         jsonb     not null
);

create index opx_run_docs_run on opx_run_docs (run_id, shard, id);

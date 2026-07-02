-- 007_agentic.sql
--
-- Squashed agentic-benchmark + datasets schema. Collapses the feat/agentx
-- migrations 002_agentic_scenario .. 012_run_datasets into one file that sorts
-- after master's highest migration (006_benchmark_results_workers), so the
-- branch's numbering no longer collides with master's 002-006. None of the
-- collapsed migrations had been applied to any deployed database.
--
-- Statement order is preserved exactly. The latest_benchmarks recreate uses
-- 'select br.*', so it retains every benchmark_results column added earlier
-- (including master's 'workers' from 006) and re-keys the view on offload_mode.

-- ───────────────────────────────────────────────────────────────────────
-- (was 002_agentic_scenario.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Support agentic scenarios in benchmark_results.
--
-- Scenarios are discriminated by benchmark_type:
--   'single_turn'     — fixed-seq-len runs (1k1k, 1k8k, 8k1k, …). isl/osl set.
--   'agentic_traces'  — trace-replay agentic runs. isl/osl NULL.
--
-- conc retains its meaning (concurrent users/requests) for both.

-- 1) isl/osl become nullable for agentic rows
alter table benchmark_results
  alter column isl drop not null,
  alter column osl drop not null;

-- 2) CHECK constraints: positive-or-null
alter table benchmark_results
  drop constraint benchmark_results_isl_positive,
  drop constraint benchmark_results_osl_positive;

alter table benchmark_results
  add constraint benchmark_results_isl_positive check (isl is null or isl > 0),
  add constraint benchmark_results_osl_positive check (osl is null or osl > 0);

-- 3) Uniqueness must treat (NULL, NULL) pairs as equal so agentic rows
--    can't duplicate on (workflow_run_id, config_id, benchmark_type, conc).
alter table benchmark_results
  drop constraint benchmark_results_unique;

alter table benchmark_results
  add constraint benchmark_results_unique unique nulls not distinct
    (workflow_run_id, config_id, benchmark_type, isl, osl, conc);

-- ───────────────────────────────────────────────────────────────────────
-- (was 003_agentic_availability.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Extend the availability table to cover agentic scenarios.
--
-- The 002 migration relaxed benchmark_results.isl/osl to nullable; do the same
-- for availability and add benchmark_type so the frontend can enumerate
-- agentic vs single_turn scenarios per model/date.
--
-- Postgres primary keys require every column to be NOT NULL, so we drop the PK
-- and replace it with a UNIQUE NULLS NOT DISTINCT constraint — functionally
-- equivalent except it allows isl/osl to be NULL for agentic rows.

alter table availability
  drop constraint availability_pkey;

alter table availability
  alter column isl drop not null,
  alter column osl drop not null,
  add column benchmark_type text not null default 'single_turn';

alter table availability
  add constraint availability_natural_key unique nulls not distinct
    (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date);

-- ───────────────────────────────────────────────────────────────────────
-- (was 004_offload_mode.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Add offload_mode as a first-class dimension on benchmark_results.
--
-- KV-cache offload (on/off) is a meaningful sweep dimension for agentic-trace
-- runs: a single run may emit two rows for the same (config, isl, osl, conc)
-- — one with offload disabled, one enabled. The pre-existing unique key
-- collapsed those into one row, forcing the ingest to skip variants.
--
-- For fixed-seq runs `offload_mode` defaults to 'off', which matches the
-- assumption baked into the existing 5,500+ rows.

alter table benchmark_results
  add column offload_mode text not null default 'off';

-- Backfill agentic rows from the offload_mode value already living in metrics
-- JSONB (set during the earlier agentic ingest backfill).
update benchmark_results
   set offload_mode = metrics->>'offload_mode'
 where benchmark_type = 'agentic_traces'
   and metrics ? 'offload_mode';

-- Replace the unique constraint so on/off variants can coexist.
alter table benchmark_results
  drop constraint benchmark_results_unique;

alter table benchmark_results
  add constraint benchmark_results_unique unique nulls not distinct
    (workflow_run_id, config_id, benchmark_type, isl, osl, conc, offload_mode);

-- Rebuild the latest-per-config materialized view to dedupe by offload_mode too.
drop materialized view if exists latest_benchmarks cascade;

create materialized view latest_benchmarks as
select distinct on (br.config_id, br.conc, br.isl, br.osl, br.offload_mode)
  br.*
from benchmark_results br
join latest_workflow_runs wr on wr.id = br.workflow_run_id
where br.error is null
order by br.config_id, br.conc, br.isl, br.osl, br.offload_mode, br.date desc;

create unique index latest_benchmarks_pk
  on latest_benchmarks (config_id, conc, isl, osl, offload_mode) nulls not distinct;
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

-- ───────────────────────────────────────────────────────────────────────
-- (was 006_agentic_trace_replay.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Capture raw aiperf trace files per agentic benchmark point.
--
-- The aiperf harness produces two per-point export files inside each
-- `agentic_<suffix>` artifact:
--   - profile_export.jsonl         (~2 MB raw, per-request data)
--   - server_metrics_export.csv    (~20 KB raw, periodic Prometheus snapshots)
--
-- We persist them so the dashboard can later show per-request distributions,
-- KV cache utilization over time, and conversation traces without needing to
-- re-download the GitHub artifacts. Storage stays in Postgres (TOASTed) — at
-- ~500 KB per point post-gzip the total fits comfortably without a separate
-- blob service.
--
-- Mirrors the existing `server_logs` pattern (id-keyed sibling table + FK
-- column on benchmark_results). Older, non-aiperf agentic runs simply have a
-- NULL `trace_replay_id`.

create table agentic_trace_replay (
  id                                bigserial   primary key,
  -- gzip(profile_export.jsonl); null when only the server metrics file existed
  profile_export_jsonl_gz           bytea,
  profile_export_uncompressed_size  bigint,
  -- raw csv bytes; null when only the profile file existed
  server_metrics_csv                bytea,
  server_metrics_csv_size           bigint,
  created_at                        timestamptz not null default now()
);

alter table benchmark_results
  add column trace_replay_id bigint references agentic_trace_replay(id);

create index benchmark_results_trace_replay_idx
  on benchmark_results (trace_replay_id)
  where trace_replay_id is not null;

-- ───────────────────────────────────────────────────────────────────────
-- (was 007_agentic_trace_server_metrics_json.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Add the full server-metrics time-series JSON to agentic_trace_replay.
--
-- The existing `server_metrics_csv` column holds aiperf's summary export —
-- one row per metric with avg/min/max/std/p1..p99 across the entire run.
-- That's enough for the cumulative cache-hit number but not for any
-- "metric over time" view (KV cache utilization curve, queue depth, prefix
-- hit rate per interval, cumulative prefill token source).
--
-- The harness also writes `server_metrics_export.json` which contains the
-- raw per-scrape (~1Hz) values for every Prometheus metric over the whole
-- benchmark window. Raw size is ~250 MB per point but it compresses ~42x
-- to ~6 MB gzipped (text with repeated metric names + numeric values).
-- That's the file we store here for any future time-series chart.

alter table agentic_trace_replay
  add column server_metrics_json_gz bytea,
  add column server_metrics_json_uncompressed_size bigint;

-- ───────────────────────────────────────────────────────────────────────
-- (was 008_agentic_aggregate_stats.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Pre-computed aggregate stats for each agentic_trace_replay row.
--
-- Previously the agentic detail page parsed the (huge) profile_export.jsonl
-- and server_metrics_json blobs on every request to compute distribution
-- stats for ISL/OSL/KV-util/prefix-hit-rate, plus the per-point derived
-- metrics (session-time, p90 prefill TPS). That took ~20s per row and the
-- worst rows (high-conc TP+EP server_metrics blobs that decompress past
-- Node's 512 MB string cap) couldn't be parsed without a stream fallback.
--
-- This column holds the computed stats so the API serves the page from a
-- single SQL row read. Shape mirrors the existing benchmark_results.metrics
-- JSONB convention; an inner `version` field lets the backfill script
-- detect rows whose stats were computed by an older algorithm and
-- recompute them. Null when stats haven't been computed yet (existing
-- rows pre-backfill; the API has a slow-path fallback for that case).

alter table agentic_trace_replay
  add column aggregate_stats jsonb;

-- ───────────────────────────────────────────────────────────────────────
-- (was 009_agentic_chart_series.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Pre-computed time-series for the agentic detail page chart.
--
-- Sibling to `aggregate_stats` (migration 008): that column stores
-- per-row percentile/derived *summaries*, this one stores the full
-- chart-ready time-series arrays (kvCacheUsage, prefixCacheHitRate,
-- queueDepth, prefillTps, decodeTps, promptTokensBySource).
--
-- Without this, the detail page parsed the entire `server_metrics_json_gz`
-- blob on every request and blew up with ERR_STRING_TOO_LONG on high-conc
-- TP+EP rows (the blob decompresses past Node's 512 MB max-string-length).
-- With pre-computed series the page is a single SQL row read.
--
-- Shape includes an inner `version` field so the backfill script can
-- recompute rows whose stored series were produced by an older algorithm.
-- Null when the series haven't been computed yet; the API has a slow-path
-- fallback (with stream-parse for oversized blobs) for that case.

alter table agentic_trace_replay
  add column chart_series jsonb;

-- ───────────────────────────────────────────────────────────────────────
-- (was 010_agentic_request_timeline.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Pre-computed per-request timeline for the agentic detail page.
--
-- Sibling to `aggregate_stats` (008) and `chart_series` (009). This one
-- holds a thin per-request array extracted from `profile_export_jsonl_gz`
-- so the detail page can render a Gantt-style swimlane of every request
-- (one bar per conversation turn) without re-parsing the JSONL on every
-- page load.
--
-- Shape includes an inner `version` field so the backfill script can
-- recompute rows whose stored timeline was produced by an older
-- algorithm. Null when the timeline hasn't been computed yet; the API
-- falls back to parsing the blob in that case.

alter table agentic_trace_replay
  add column request_timeline jsonb;

-- ───────────────────────────────────────────────────────────────────────
-- (was 011_datasets.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Agentic benchmarking source datasets (the HuggingFace cc-traces-weka corpora
-- the agentic benchmarks replay) + their per-conversation trace structure.
--
-- The app already stores benchmark *replay* artifacts (agentic_trace_replay) but
-- not the source traces. These two tables back the new /datasets area: a
-- registry of ingested dataset versions with precomputed summary + chart data,
-- and one row per conversation holding a flamegraph-ready `structure` (turns +
-- subagent groups with input split into cached-prefix vs uncached-suffix). The
-- raw hash_ids are NOT stored — they're only needed at ingest to derive the
-- cached/uncached split, so the runtime read is a single small JSONB.
--
-- Additive only. To revert this migration:
--   drop table if exists dataset_conversations;
--   drop table if exists datasets;
--   (and see the run_datasets revert below; this is all one migration now:
--    delete from schema_migrations where filename = '007_agentic.sql';)

create table datasets (
  -- HuggingFace dataset id, e.g. 'semianalysisai/cc-traces-weka-062126'.
  id          text primary key,
  -- URL key, e.g. 'cc-traces-weka-062126'.
  slug        text not null unique,
  label       text not null,
  -- 'full' | '256k' | 'no-subagents' (the published variants).
  variant     text not null default 'full',
  description text,
  hf_url      text,
  license     text,
  conversation_count integer not null default 0,
  -- Token totals, main_turns, subagent_groups, model mix, date range, etc.
  summary     jsonb not null default '{}'::jsonb,
  -- Precomputed distributions for the dataset-detail cards (input/output length,
  -- turns per conversation, subagent fan-out, …). Versioned via an inner field.
  chart_data  jsonb not null default '{}'::jsonb,
  dataset_version integer not null default 1,
  ingested_at timestamptz not null default now()
);

create table dataset_conversations (
  id          bigserial primary key,
  dataset_id  text not null references datasets(id) on delete cascade,
  -- The conversation id from the dataset record (trace id).
  conv_id     text not null,
  models      text[] not null default '{}',
  num_turns           integer not null default 0,
  num_subagent_groups integer not null default 0,
  total_in    bigint not null default 0,
  total_out   bigint not null default 0,
  total_cached bigint not null default 0,
  -- Flamegraph-ready ordered node tree (turns + subagent groups, each with
  -- in/out/cached/uncached token counts). See packages/db/src/etl/weka-structure.ts.
  structure   jsonb not null,
  unique (dataset_id, conv_id)
);

create index dataset_conversations_dataset_idx on dataset_conversations (dataset_id);

-- ───────────────────────────────────────────────────────────────────────
-- (was 012_run_datasets.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Maps a benchmark workflow_run to the source dataset it replayed, so the
-- agentic detail page can deep-link each request in the timeline to the exact
-- conversation in the /datasets viewer (the request's conversation_id, with any
-- ::sa:/::fa: suffix stripped, is the dataset conv_id).
--
-- One row per workflow_run (every benchmark in a run replays the same dataset).
-- dataset_slug is a plain slug (matches datasets.slug / the /datasets/<slug>
-- URL) rather than an FK, so the mapping can be recorded before/independent of
-- the dataset being ingested; the UI degrades gracefully if the slug is absent.
--
-- Additive only. To revert this whole squashed migration:
--   drop table if exists run_datasets;
--   drop table if exists dataset_conversations;
--   drop table if exists datasets;
--   drop table if exists agentic_trace_replay cascade;
--   (plus the benchmark_results/availability column + constraint changes above)
--   delete from schema_migrations where filename = '007_agentic.sql';

create table run_datasets (
  workflow_run_id bigint primary key references workflow_runs(id) on delete cascade,
  dataset_slug    text not null,
  created_at      timestamptz not null default now()
);

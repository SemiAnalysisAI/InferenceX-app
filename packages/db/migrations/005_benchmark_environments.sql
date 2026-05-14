-- ============================================================
-- BENCHMARK ENVIRONMENTS
-- One row per (workflow_run_id, config_id) capturing the runtime
-- environment a benchmark was produced in.
--
-- Two ingest paths feed this table:
--   * env_json  — authoritative, from upstream CI's env.json artifact
--                 (nvidia-smi / rocm-smi / nvcc / git rev-parse output).
--   * log_parse — fallback, regex over server_logs.server_log for the
--                 framework/torch/python version strings that frameworks
--                 print on startup. Host-level fields stay NULL.
--
-- The drawer's Environment tab joins through (workflow_run_id, config_id)
-- so the data persists across re-ingest and works for every benchmark
-- row of a given config (no per-conc duplication).
-- ============================================================

create table benchmark_environments (
  id                bigserial primary key,
  workflow_run_id   bigint    not null references workflow_runs(id) on delete cascade,
  config_id         integer   not null references configs(id),

  image             text,

  -- Framework
  framework_version text,
  framework_sha     text,

  -- Toolchain
  torch_version     text,
  python_version    text,
  cuda_version      text,
  rocm_version      text,

  -- Host
  driver_version    text,
  gpu_sku           text,

  -- Provenance: which ingest path populated this row.
  -- env_json wins permanently; log_parse only fills NULL columns.
  source            text not null default 'log_parse',

  -- Forward-compat for fields the parser captures that don't yet have a
  -- dedicated column (e.g. framework-specific build flags, ROCm-only fields).
  extra             jsonb not null default '{}'::jsonb,

  parsed_at         timestamptz not null default now(),

  constraint benchmark_environments_source_check
    check (source in ('env_json', 'log_parse')),
  constraint benchmark_environments_unique
    unique (workflow_run_id, config_id)
);

create index benchmark_environments_workflow_run_idx
  on benchmark_environments (workflow_run_id);

-- InferenceX initial database schema
-- Created: 2026-02-26
--
-- Text keys are lowercase-enforced via CHECK constraints; no lookup tables.
-- ETL normalizes: dynamo-trtllm → dynamo-trt, sglang-disagg → mori-sglang.

-- ============================================================
-- CONFIGS
-- Unique serving deployment: hardware + framework + model + precision + parallelism.
-- Non-disagg runs: prefill_* = decode_*, num_prefill_gpu = num_decode_gpu.
-- ============================================================

create table configs (
  id serial primary key,

  hardware    text not null,
  framework   text not null,
  model       text not null,
  precision   text not null,
  spec_method text not null,

  disagg               boolean  not null default false,
  is_multinode         boolean  not null default false,
  prefill_tp           smallint not null,
  prefill_ep           smallint not null default 1,
  prefill_dp_attention boolean  not null default false,
  prefill_num_workers  smallint not null default 0,  -- 0 when disagg=false
  decode_tp            smallint not null,
  decode_ep            smallint not null default 1,
  decode_dp_attention  boolean  not null default false,
  decode_num_workers   smallint not null default 0,  -- 0 when disagg=false
  num_prefill_gpu      smallint not null,
  num_decode_gpu       smallint not null,

  -- text keys must be lowercase
  constraint configs_hardware_lowercase    check (hardware    = lower(hardware)),
  constraint configs_framework_lowercase   check (framework   = lower(framework)),
  constraint configs_model_lowercase       check (model       = lower(model)),
  constraint configs_precision_lowercase   check (precision   = lower(precision)),
  constraint configs_spec_method_lowercase check (spec_method = lower(spec_method)),

  -- parallelism bounds
  constraint configs_prefill_tp_positive       check (prefill_tp           >= 1),
  constraint configs_prefill_ep_positive       check (prefill_ep           >= 1),
  constraint configs_prefill_workers_non_neg   check (prefill_num_workers  >= 0),
  constraint configs_decode_tp_positive        check (decode_tp            >= 1),
  constraint configs_decode_ep_positive        check (decode_ep            >= 1),
  constraint configs_decode_workers_non_neg    check (decode_num_workers   >= 0),
  constraint configs_num_prefill_gpu_positive  check (num_prefill_gpu      >= 1),
  constraint configs_num_decode_gpu_positive   check (num_decode_gpu       >= 1),

  constraint configs_natural_key unique (
    hardware, framework, model, precision, spec_method,
    disagg, is_multinode,
    prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
    decode_tp,  decode_ep,  decode_dp_attention,  decode_num_workers,
    num_prefill_gpu, num_decode_gpu
  )
);

-- model + hardware composite for join filtering
create index configs_model_hardware_idx on configs (model, hardware);

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================

create table workflow_runs (
  id             bigserial   primary key,
  github_run_id  bigint      not null,
  run_attempt    smallint    not null default 0,
  name           text        not null,
  status         text,
  conclusion     text,                  -- success | failure | cancelled
  head_sha       text,
  head_branch    text,
  html_url       text,
  created_at     timestamptz not null,
  run_started_at timestamptz,
  date           date        not null,  -- denormalized from created_at

  constraint workflow_runs_run_attempt_non_neg check (run_attempt >= 0),
  constraint workflow_runs_natural_key unique (github_run_id, run_attempt)
);

-- ============================================================
-- SERVER LOGS
-- ============================================================

create table server_logs (
  id         bigserial primary key,
  server_log text      not null
);

-- ============================================================
-- BENCHMARK RESULTS
-- ============================================================

create table benchmark_results (
  id              bigserial primary key,
  workflow_run_id bigint    not null references workflow_runs(id),
  config_id       integer   not null references configs(id),
  benchmark_type  text      not null,  -- e.g. single_turn
  date            date      not null,  -- denormalized from workflow_runs
  isl             integer   not null,
  osl             integer   not null,
  conc            integer   not null,
  image           text,                -- null for runs before 2025-12-08
  metrics         jsonb     not null,  -- tput_per_gpu, median_ttft, p99_ttft, median_e2el, median_intvty, etc.
  error           text,                -- null = success
  server_log_id   bigint    references server_logs(id),  -- null if no log available

  constraint benchmark_results_isl_positive  check (isl  > 0),
  constraint benchmark_results_osl_positive  check (osl  > 0),
  constraint benchmark_results_conc_positive check (conc > 0),

  constraint benchmark_results_unique unique (
    workflow_run_id, config_id, benchmark_type, isl, osl, conc
  )
);

create index benchmark_results_run_id_idx on benchmark_results (workflow_run_id);

-- covering index matching DISTINCT ON (config_id, conc, isl, osl) ORDER BY … date DESC
create index benchmark_results_config_ts_idx
  on benchmark_results (config_id, conc, isl, osl, date desc)
  include (image, metrics)
  where error is null;

-- covering index for history queries (all dates for a given isl/osl)
create index benchmark_results_seq_history_idx
  on benchmark_results (isl, osl, date, config_id, conc)
  include (image, metrics)
  where error is null;

-- ============================================================
-- RUN STATS  (reliability chart)
-- ============================================================

create table run_stats (
  id              bigserial primary key,
  workflow_run_id bigint    not null references workflow_runs(id),
  date            date      not null,  -- denormalized from workflow_runs
  hardware        text      not null,
  n_success       integer   not null,
  total           integer   not null,

  constraint run_stats_hardware_lowercase check (hardware  = lower(hardware)),
  constraint run_stats_total_non_neg       check (total     >= 0),
  constraint run_stats_success_non_neg    check (n_success >= 0),
  constraint run_stats_success_lte_total  check (n_success <= total),

  constraint run_stats_unique unique (workflow_run_id, hardware)
);

-- ============================================================
-- EVAL RESULTS
-- ============================================================

create table eval_results (
  id              bigserial primary key,
  workflow_run_id bigint    not null references workflow_runs(id),
  config_id       integer   not null references configs(id),
  task            text      not null,  -- e.g. gsm8k
  date            date      not null,  -- denormalized from workflow_runs
  isl             integer,
  osl             integer,
  conc            integer,
  lm_eval_version text,
  metrics         jsonb     not null,  -- em_strict, em_strict_se, em_flexible, em_flexible_se, n_eff

  constraint eval_results_task_lowercase check (task = lower(task)),
  constraint eval_results_isl_positive   check (isl  is null or isl  > 0),
  constraint eval_results_osl_positive   check (osl  is null or osl  > 0),
  constraint eval_results_conc_positive  check (conc is null or conc > 0),

  constraint eval_results_unique unique (workflow_run_id, config_id, task, isl, osl, conc)
);

create index eval_results_config_id_idx on eval_results (config_id);

-- ============================================================
-- AVAILABILITY  (denormalized for fast date-picker lookups)
-- ============================================================

create table availability (
  model       text    not null,
  isl         integer not null,
  osl         integer not null,
  precision   text    not null,
  hardware    text    not null,
  framework   text    not null,
  spec_method text    not null,
  disagg      boolean not null default false,
  date        date    not null,
  primary key (model, isl, osl, precision, hardware, framework, spec_method, disagg, date)
);

-- ============================================================
-- CHANGELOG ENTRIES
-- ============================================================

create table changelog_entries (
  id              bigserial primary key,
  workflow_run_id bigint    not null references workflow_runs(id),
  date            date      not null,
  base_ref        text      not null,
  head_ref        text      not null,
  config_keys     text[]    not null,  -- e.g. ['dsr1-fp8-mi355x-mori-sglang']
  description     text      not null,
  pr_link         text,

  constraint changelog_entries_unique unique (workflow_run_id, base_ref, head_ref)
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Only the highest attempt per github_run_id.
-- All read queries join against this instead of workflow_runs directly.
create view latest_workflow_runs as
select distinct on (github_run_id) *
from workflow_runs
order by github_run_id, run_attempt desc;

-- Latest benchmark per (config, conc, isl, osl).
-- Refreshed after each ingest for instant lookups without DISTINCT ON.
create materialized view latest_benchmarks as
select distinct on (br.config_id, br.conc, br.isl, br.osl)
  br.*
from benchmark_results br
join latest_workflow_runs wr on wr.id = br.workflow_run_id
where br.error is null
order by br.config_id, br.conc, br.isl, br.osl, br.date desc;

create unique index latest_benchmarks_pk on latest_benchmarks (config_id, conc, isl, osl);
create index latest_benchmarks_model_idx on latest_benchmarks (config_id);

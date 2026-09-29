-- PowerX telemetry digest.
--
-- The producer samples nvidia-smi / amd-smi once per second for the lifetime
-- of every benchmark job and uploads the CSV as a `gpu_metrics_<suffix>`
-- artifact next to `bmk_<suffix>`. Until now the app downloaded and parsed
-- those artifacts from GitHub on every page view, and lost them entirely once
-- GitHub's 90-day artifact retention expired. These tables move that work to
-- ingest time: raw samples are kept at full resolution, per-GPU summary
-- statistics are digested once, and each benchmark point is linked to the
-- series that was recorded while it ran.

create table gpu_metric_series (
  id              bigserial   primary key,
  workflow_run_id bigint      not null references workflow_runs(id) on delete cascade,
  -- Full GitHub artifact name, including the runner-pool/attempt suffix.
  artifact_name   text        not null,
  -- Artifact name with the gpu_metrics_ prefix removed; pairs with bmk_<key>.
  config_key      text        not null,
  -- CSV path relative to the extracted artifact root (multinode uploads can
  -- carry one CSV per serving node).
  file_name       text        not null,
  vendor          text        not null,
  csv_sha256      text        not null,
  sample_interval_s real,
  sample_count    integer     not null,
  gpu_count       smallint    not null,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  -- Parsed sidecars: gpu_metrics_context.json, gpu_metrics_identity.*,
  -- gpu_metrics_energy_{start,end}.csv. Kept verbatim for provenance.
  sidecars        jsonb       not null default '{}'::jsonb,
  ingested_at     timestamptz not null default now(),

  constraint gpu_metric_series_vendor_known check (vendor in ('nvidia', 'amd')),
  constraint gpu_metric_series_artifact_nonempty check (artifact_name <> ''),
  constraint gpu_metric_series_file_nonempty check (file_name <> ''),
  constraint gpu_metric_series_sample_count_non_neg check (sample_count >= 0),
  constraint gpu_metric_series_gpu_count_non_neg check (gpu_count >= 0),
  constraint gpu_metric_series_window_ordered check (ended_at >= started_at),
  constraint gpu_metric_series_unique unique (workflow_run_id, artifact_name, file_name)
);

create index gpu_metric_series_run_idx on gpu_metric_series (workflow_run_id);

-- One row per (GPU, sample). Vendor-specific columns stay null when the
-- collector does not report them. `real` keeps the row narrow; the source
-- telemetry has at most three significant decimals.
create table gpu_metric_samples (
  series_id       bigint      not null references gpu_metric_series(id) on delete cascade,
  gpu_index       smallint    not null,
  sampled_at      timestamptz not null,
  power_w         real,
  temperature_c   real,
  sm_clock_mhz    real,
  mem_clock_mhz   real,
  gpu_util_pct    real,
  mem_util_pct    real,
  edge_temp_c     real,
  mem_temp_c      real,
  gfx_voltage_mv  real,
  soc_voltage_mv  real,
  mem_voltage_mv  real,
  fclk_mhz        real,
  socclk_mhz      real,
  mm_activity_pct real,

  primary key (series_id, gpu_index, sampled_at)
);

-- Ingest-time digest so readers never rescan samples for summary cards.
create table gpu_metric_gpu_stats (
  series_id     bigint   not null references gpu_metric_series(id) on delete cascade,
  gpu_index     smallint not null,
  metric        text     not null,
  sample_count  integer  not null,
  min_value     real     not null,
  max_value     real     not null,
  mean_value    real     not null,
  median_value  real     not null,
  p95_value     real     not null,
  p99_value     real     not null,
  stddev_value  real     not null,

  constraint gpu_metric_gpu_stats_metric_nonempty check (metric <> ''),
  constraint gpu_metric_gpu_stats_sample_count_positive check (sample_count > 0),
  primary key (series_id, gpu_index, metric)
);

-- Benchmark point ↔ telemetry series. A point can reference several series
-- when a multinode artifact ships one CSV per node.
create table benchmark_result_gpu_metrics (
  benchmark_result_id bigint not null references benchmark_results(id) on delete cascade,
  series_id           bigint not null references gpu_metric_series(id) on delete cascade,

  primary key (benchmark_result_id, series_id)
);

create index benchmark_result_gpu_metrics_series_idx
  on benchmark_result_gpu_metrics (series_id);

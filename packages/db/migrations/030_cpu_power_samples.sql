-- PowerX CPU power samples.
--
-- srt-slurm's CPU exporter writes `power/cpu/samples.csv` (one row per scrape,
-- host and socket) into the `power_audit_` bundle beside the GPU samples.
-- Ingest skipped that file, so the measured CPU series were lost once GitHub's
-- 90-day artifact retention expired. These tables keep them, one series per
-- (artifact, CSV file, host), in the same shape as gpu_metric_series and
-- gpu_metric_samples (migration 016).
--
-- They are separate from the GPU tables because a socket is not a GPU: in
-- those tables every GPU telemetry reader would need to filter CPU series out,
-- and the socket rails have no GPU sample column. `sensor` is not stored: it
-- is `CPU<socket_id>:<meter>`, where the meter follows from `source`.
-- `total_power_w` is the sum of `power_w` over a host's sockets and is not
-- stored either.
--
-- Additive and idempotent: re-running this file changes nothing.

set local lock_timeout = '5s';

create table if not exists cpu_power_series (
  id              bigserial   primary key,
  workflow_run_id bigint      not null references workflow_runs(id) on delete cascade,
  artifact_name   text        not null,
  -- CSV path relative to the artifact root.
  file_name       text        not null,
  hostname        text        not null,
  -- Exporter source of the socket meter, e.g. acpi (Grace) or rapl (AMD EPYC).
  source          text        not null,
  csv_sha256      text        not null,
  sample_count    integer     not null,
  socket_count    smallint    not null,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  ingested_at     timestamptz not null default now(),

  constraint cpu_power_series_window_ordered check (ended_at >= started_at),
  constraint cpu_power_series_unique unique (workflow_run_id, artifact_name, file_name, hostname)
);

-- One row per (socket, sample).
create table if not exists cpu_power_samples (
  series_id  bigint      not null references cpu_power_series(id) on delete cascade,
  socket_id  smallint    not null,
  sampled_at timestamptz not null,
  -- The socket meter: the whole Grace socket (acpi) or the AMD package (rapl).
  power_w    real        not null,
  -- Rails inside the socket; null when the source does not report them.
  cpu_rail_w real,
  soc_w      real,
  dram_w     real,
  -- NVML superchip module power; the module includes both GPUs.
  module_w   real,

  primary key (series_id, socket_id, sampled_at)
);

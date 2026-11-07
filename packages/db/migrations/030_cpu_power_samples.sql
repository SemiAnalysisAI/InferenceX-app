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
  -- Exporter source of `power_w`: acpi (Grace), rapl (AMD EPYC) or dcgm.
  source          text        not null,
  csv_sha256      text        not null,
  sample_count    integer     not null,
  ingested_at     timestamptz not null default now(),

  constraint cpu_power_series_unique unique (workflow_run_id, artifact_name, file_name, hostname)
);

-- One row per (socket, sample).
create table if not exists cpu_power_samples (
  series_id  bigint      not null references cpu_power_series(id) on delete cascade,
  socket_id  smallint    not null,
  sampled_at timestamptz not null,
  -- What the source reports for the socket: the whole Grace socket (acpi), the
  -- AMD package (rapl), or the CPU rail only (dcgm field 1130).
  power_w    real        not null,
  -- Rails inside the socket; null when the source does not report them.
  cpu_rail_w real,
  soc_w      real,
  dram_w     real,
  -- NVML superchip module power; the module includes both GPUs.
  module_w   real,

  primary key (series_id, socket_id, sampled_at)
);

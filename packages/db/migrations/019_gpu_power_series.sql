-- Precomputed PowerX timeline series.
--
-- `/api/gpu-metrics?series=power` used to read every stored sample of the
-- requested artifacts (migration 016) and bucket them to one-second per-GPU
-- watt series on each request; large runs took tens of seconds. Ingest now
-- runs the same transform once per artifact and stores its output here.
--
-- `input_key` hashes everything the transform reads: each series' identity
-- (id, csv_sha256, sample_count, ingested_at) and the `power_audit` of every
-- linked benchmark point. Readers recompute it from the live rows and use a
-- row only when both `input_key` and `format_version` match, so a re-ingest,
-- a point override or a transform change can never serve stale series; the
-- reader falls back to the raw samples until `db:backfill-power-series`
-- refreshes the row.
--
-- Additive and idempotent: re-running this file changes nothing.

set local lock_timeout = '5s';

create table if not exists gpu_power_series (
  workflow_run_id bigint      not null references workflow_runs(id) on delete cascade,
  artifact_name   text        not null,
  format_version  smallint    not null,
  input_key       text        not null,
  -- gzip(JSON) of the artifact's GpuPowerSeries[].
  series_gz       bytea       not null,
  computed_at     timestamptz not null default now(),

  primary key (workflow_run_id, artifact_name)
);

-- Already compressed; skip a second TOAST compression attempt.
alter table gpu_power_series alter column series_gz set storage external;

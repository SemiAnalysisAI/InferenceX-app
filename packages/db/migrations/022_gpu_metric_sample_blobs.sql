-- Compressed per-series copy of `gpu_metric_samples` (migration 016).
--
-- A point read paged every sample row of its linked series out of the
-- 75M-row table (250-560 ms per point). This table holds the same rows once
-- per series as one brotli-compressed columnar buffer
-- (`packages/db/src/lib/gpu-sample-blob.ts`), which decodes to exactly the
-- values, timestamps and order the row read returns. `gpu_metric_samples`
-- stays the source of truth.
--
-- Readers use a row only when `format_version` matches theirs and
-- `ingested_at` equals the series' `ingested_at`, which every sample
-- replacement restamps, so a re-ingest can never serve stale samples. Any
-- miss reads `gpu_metric_samples` until ingest (with `GPU_SAMPLE_BLOBS=1`)
-- or `db:backfill-gpu-sample-blobs` writes a current row.
--
-- Additive and idempotent: re-running this file changes nothing.

set local lock_timeout = '5s';

create table if not exists gpu_metric_sample_blobs (
  series_id      bigint      primary key references gpu_metric_series(id) on delete cascade,
  format_version smallint    not null,
  -- Rows encoded in `data`.
  sample_count   integer     not null,
  -- The series' `ingested_at` when `data` was encoded.
  ingested_at    timestamptz not null,
  data           bytea       not null
);

-- Already compressed; skip a second TOAST compression attempt.
alter table gpu_metric_sample_blobs alter column data set storage external;

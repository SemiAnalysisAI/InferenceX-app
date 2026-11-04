
set local lock_timeout = '5s';

create table if not exists gpu_metric_sample_blobs (
  series_id      bigint      primary key references gpu_metric_series(id) on delete cascade,
  format_version smallint    not null,
  sample_count   integer     not null,
  ingested_at    timestamptz not null,
  data           bytea       not null
);

alter table gpu_metric_sample_blobs alter column data set storage external;

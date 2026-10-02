-- Zero means unversioned, not computed by the current algorithm.
ALTER TABLE gpu_metric_series
  ADD COLUMN IF NOT EXISTS stats_version integer NOT NULL DEFAULT 0;

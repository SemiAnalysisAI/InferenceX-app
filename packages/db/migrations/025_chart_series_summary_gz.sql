-- Precomputed trace-server-metrics series.
--
-- `/api/v1/trace-server-metrics` used to read `chart_series` whole (up to
-- 14 MB compressed, 52 MB of JSON) and rebuild it in SQL and JS, dropping the
-- per-source detail and averaging each worker's per-rank KV series into one
-- line. Every metric source repeats the aggregate series, so the largest point
-- shipped 47 MB from the database for a 6 MB response. Ingest now stores the
-- route's series fields once as gzip JSON (`etl/chart-series-summary.ts`),
-- about a fifth of the response's size.
--
-- `chart_series_summary_version` is the `CHART_SERIES_SUMMARY_VERSION` the
-- bytes were derived with, which embeds `CHART_SERIES_VERSION`. Readers use
-- the column only when it matches and otherwise derive the series from
-- `chart_series` as before. Every writer of `chart_series` writes both
-- columns in the same statement, so they never describe different series.
--
-- EXTERNAL storage keeps the already-compressed bytes out of line without a
-- second TOAST compression attempt.
--
-- Additive and idempotent: re-running this file changes nothing. Apply it
-- before deploying readers or writers of these columns, then run
-- `db:backfill-chart-series-summary` to fill existing rows.

set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists chart_series_summary_gz bytea,
  add column if not exists chart_series_summary_version smallint;

alter table agentic_trace_replay
  alter column chart_series_summary_gz set storage external;

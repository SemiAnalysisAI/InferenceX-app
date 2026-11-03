-- Precomputed request-chart-data in columnar form.
--
-- `/api/v1/request-chart-data` and `/api/v1/trace-histograms` used to read
-- the whole `request_timeline_gz` (about 89 bytes per request; up to 147 MB
-- for one point) and parse every request's JSON to keep 9 or 2 fields. Ingest
-- now stores those fields once, column by column, as varints under gzip
-- (`etl/request-chart-columns.ts`), about a fifth of the timeline's size.
--
-- `request_chart_data_version` is the `REQUEST_CHART_DATA_VERSION` the bytes
-- were encoded with, which embeds `REQUEST_TIMELINE_VERSION`. Readers use the
-- column only when it matches and otherwise derive the payload from the
-- timeline as before. Every writer of `request_timeline_gz` writes or clears
-- both columns, so they never describe a different timeline.
--
-- EXTERNAL storage keeps the already-compressed bytes out of line without a
-- second TOAST compression attempt.
--
-- Additive and idempotent: re-running this file changes nothing. Apply it
-- before deploying readers or writers of these columns, then run
-- `db:backfill-request-chart-data` to fill existing rows.

set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists request_chart_data_gz bytea,
  add column if not exists request_chart_data_version smallint;

alter table agentic_trace_replay
  alter column request_chart_data_gz set storage external;

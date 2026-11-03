
set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists chart_series_summary_gz bytea,
  add column if not exists chart_series_summary_version smallint;

alter table agentic_trace_replay
  alter column chart_series_summary_gz set storage external;

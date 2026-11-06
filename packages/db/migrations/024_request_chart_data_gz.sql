
set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists request_chart_data_gz bytea,
  add column if not exists request_chart_data_version smallint;

alter table agentic_trace_replay
  alter column request_chart_data_gz set storage external;

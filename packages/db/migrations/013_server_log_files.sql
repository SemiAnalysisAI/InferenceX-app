-- Preserve every text log emitted inside server-log artifacts while keeping
-- the existing server_logs.server_log column as the primary/legacy file.

alter table server_logs
  add column file_name text not null default 'server.log',
  add column files_complete boolean not null default false,
  add constraint server_logs_file_name_nonempty check (file_name <> '');

create table server_log_files (
  server_log_id bigint not null references server_logs(id) on delete cascade,
  file_name     text   not null,
  log_text      text   not null,

  constraint server_log_files_file_name_nonempty check (file_name <> ''),
  constraint server_log_files_unique unique (server_log_id, file_name)
);

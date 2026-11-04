
set local lock_timeout = '5s';

create table if not exists server_log_blocks (
  server_log_id bigint   not null references server_logs(id) on delete cascade,
  file_name     text     not null,
  block_index   integer  not null,
  char_offset   bigint   not null,
  char_count    integer  not null,
  ascii         boolean  not null,
  data          bytea    not null,
  bloom         bytea    not null,

  primary key (server_log_id, file_name, block_index)
);

alter table server_log_blocks alter column data set storage external;
alter table server_log_blocks alter column bloom set storage external;

create table if not exists server_log_block_files (
  server_log_id bigint  not null references server_logs(id) on delete cascade,
  file_name     text    not null,
  char_count    bigint  not null,
  block_count   integer not null,

  primary key (server_log_id, file_name)
);

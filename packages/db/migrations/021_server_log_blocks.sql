-- Server logs as independently compressed blocks.
--
-- `server_logs.server_log` and `server_log_files.log_text` are TOAST-compressed
-- text. PostgreSQL decompresses such a value from its start to reach an offset,
-- so a 64 KiB viewer read deep in a 700 MB log took 4-7 s and a download walked
-- the whole log once per chunk. Each block here holds at most 1 Mi code points
-- of one file as brotli(UTF-8); a read decompresses only the blocks it overlaps.
--
-- A file is block-backed only once its row in `server_log_block_files` exists;
-- writers insert that row in the same transaction as the blocks, after them.
-- Readers fall back to the text columns for files without one.
--
-- Additive and idempotent: re-running this file changes nothing.

set local lock_timeout = '5s';

create table if not exists server_log_blocks (
  server_log_id bigint   not null references server_logs(id) on delete cascade,
  file_name     text     not null,
  block_index   integer  not null,
  -- Code-point offset of the block's first character within the file.
  char_offset   bigint   not null,
  char_count    integer  not null,
  -- Every character is ASCII: code points, UTF-16 units and bytes coincide.
  ascii         boolean  not null,
  data          bytea    not null,
  -- Bloom filter of the case-folded 1-3 grams starting in the block (see
  -- server-log-blocks.ts); a search reads only blocks that may hold the term.
  bloom         bytea    not null,

  primary key (server_log_id, file_name, block_index)
);

-- Already compressed; skip a second TOAST compression attempt.
alter table server_log_blocks alter column data set storage external;
alter table server_log_blocks alter column bloom set storage external;

create table if not exists server_log_block_files (
  server_log_id bigint  not null references server_logs(id) on delete cascade,
  file_name     text    not null,
  char_count    bigint  not null,
  block_count   integer not null,

  primary key (server_log_id, file_name)
);

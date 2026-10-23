-- Request timelines as gzip-compressed JSON.
--
-- `request_timeline` holds each trace row's per-request timeline as JSONB.
-- PostgreSQL caps the elements of one JSONB array at 268,435,455 bytes
-- (SQLSTATE 54000), which AgentX runs with roughly 500,000 requests exceed, so
-- their ingest fails. The largest stored documents are also too large to read
-- back through Neon's 64 MiB HTTP response limit.
--
-- `request_timeline_gz` holds gzip(JSON) of the same versioned document. Its
-- scalar companions let readers choose a path without detoasting a payload:
-- `request_timeline_version` is the document's `version` and `request_count`
-- is the length of its `requests` array.
--
-- EXTERNAL storage keeps the already-compressed bytes out of line without a
-- second TOAST compression attempt, so `substring()` fetches only the TOAST
-- chunks that one bounded slice needs.
--
-- Additive and idempotent: re-running this file changes nothing. Apply it
-- before deploying readers of these columns. Readers prefer the gzip column
-- and fall back to the legacy JSONB until `db:backfill-request-timeline` has
-- converted every row. A later migration drops `request_timeline`.

-- The migration runner applies each file in one transaction. Give up instead
-- of queueing every reader of the table behind a blocked ACCESS EXCLUSIVE lock.
set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists request_timeline_gz bytea,
  add column if not exists request_timeline_version smallint,
  add column if not exists request_count integer;

alter table agentic_trace_replay
  alter column request_timeline_gz set storage external;

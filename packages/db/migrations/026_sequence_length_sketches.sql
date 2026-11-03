-- Compact copy of `aggregate_stats.sequenceLengths`.
--
-- `/api/v1/resident-sequence-lengths` merges the ISL and OSL sketches of up to
-- 200 trace rows per request. In `aggregate_stats` each sketch is a dense JSON
-- count array, about 20 KB per row with most bins zero, so one request read
-- about 4 MB from Neon. Ingest now also stores the pair as zlib-deflated
-- varint runs (`etl/sequence-length-sketch-codec.ts`), about 1.3 KB per row,
-- and the route merges straight from those bytes.
--
-- `sequence_length_sketches_version` is the `SEQUENCE_LENGTH_SKETCHES_VERSION`
-- the bytes were encoded with, which embeds the `STATS_VERSION` of the
-- `aggregate_stats` they copy. Readers use the bytes only when it matches and
-- otherwise read the JSON as before. Every writer of `aggregate_stats` writes
-- or clears both columns in the same statement, and sketches the format cannot
-- reproduce exactly are left null so readers keep using the JSON for them.
--
-- Additive and idempotent, so re-running this file changes nothing. Apply it
-- before deploying readers or writers of these columns, then run
-- `db:backfill-sequence-length-sketches` to fill existing rows.

set local lock_timeout = '5s';

alter table agentic_trace_replay
  add column if not exists sequence_length_sketches bytea,
  add column if not exists sequence_length_sketches_version smallint;

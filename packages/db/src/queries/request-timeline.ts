import { readTraceProfileChunks } from '../lib/trace-profile-storage';
/**
 * Per-request timeline for the agentic detail page's Gantt view.
 *
 * Backed by `agentic_trace_replay.request_timeline_gz`: gzip of the JSON
 * document pre-computed at ingest time (see `etl/compute-request-timeline.ts`),
 * versioned by the `request_timeline_version` column. The compressed bytes are
 * read in bounded `substring()` slices because Neon's HTTP driver hex-encodes
 * bytea and rejects responses over 64 MiB. Rows that
 * `db:backfill-request-timeline` has not converted yet still hold the legacy
 * `request_timeline` JSONB, which is read as bounded text chunks. The slow
 * path re-computes from `profile_export_jsonl_gz` and is only taken when
 * neither stored copy has the current `REQUEST_TIMELINE_VERSION`.
 */

import {
  REQUEST_TIMELINE_VERSION,
  computeRequestTimeline,
  type RequestTimeline,
} from '../etl/compute-request-timeline';
import type { Sql } from '../etl/db-utils';
import { gunzipRequestTimeline, parseRequestTimelineJson } from '../etl/request-timeline-codec';

import type { DbClient } from '../connection.js';
import { writeBackRequestTimeline } from './agentic-shared';

export type { RequestTimeline, RequestRecord } from '../etl/compute-request-timeline';

interface RawMetaRow {
  trace_replay_id: number;
  has_blob: boolean;
  /** octet_length(request_timeline_gz); null when the row has no gzip timeline. */
  gz_bytes: number | null;
  timeline_version: number | null;
}

interface RawTimelineChunkRow {
  chunk: string | null;
  chunk_chars: number;
}

/**
 * Raw bytes per `request_timeline_gz` read. Neon hex-encodes bytea, so one
 * slice is about 32 MiB on the wire, half of its 64 MiB response cap.
 */
export const REQUEST_TIMELINE_GZ_SLICE_BYTES = 16 * 1024 * 1024;

// JSONB can be far smaller on disk than its serialized response due to TOAST
// compression, so every current legacy timeline uses bounded chunks. Timeline
// fields are compact identifiers/numbers; 16 MiB leaves ample room for
// JSON-string escaping under Neon's 64 MiB per-query response cap.
const TIMELINE_TEXT_CHUNK_CHARS = 16 * 1024 * 1024;
const MAX_TIMELINE_TEXT_CHUNKS = 64;

/**
 * Report a stored timeline that could not be read. Callers then serve no data
 * for the point instead of failing the whole response.
 */
export function logRequestTimelineReadFailure(traceReplayId: number, error: unknown): void {
  console.error(
    `[request timeline] could not read the stored timeline for trace_replay_id=${traceReplayId}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

/**
 * Read a stored `request_timeline_gz` value of `byteLength` bytes through
 * bounded `substring()` slices and concatenate them. Never selects the whole
 * value. Throws when the row disappears or the value changes length between
 * slices; a same-length rewrite fails the gzip checksum when decoded.
 */
export async function readRequestTimelineGz(
  sql: DbClient | Sql,
  traceReplayId: number,
  byteLength: number,
  sliceBytes = REQUEST_TIMELINE_GZ_SLICE_BYTES,
): Promise<Buffer> {
  const slices: Buffer[] = [];
  let received = 0;
  while (received < byteLength) {
    const rows = await sql`
      select substring(request_timeline_gz from ${received + 1}::int for ${sliceBytes}::int) as slice
      from agentic_trace_replay
      where id = ${traceReplayId}
    `;
    const slice: unknown = rows[0]?.slice;
    if (!(slice instanceof Uint8Array) || slice.length === 0) {
      throw new Error(`request_timeline_gz ended after ${received} of ${byteLength} bytes`);
    }
    slices.push(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
    received += slice.length;
  }
  if (received !== byteLength) {
    throw new Error(`request_timeline_gz grew past ${byteLength} bytes during the read`);
  }
  return Buffer.concat(slices, byteLength);
}

/**
 * Stream the exact stored JSON gzip without expanding the full request array.
 * Return null for legacy/stale rows so callers retain the existing fallback.
 */
export async function getStoredRequestTimelineGz(
  sql: DbClient,
  benchmarkResultId: number,
  sliceBytes = 1024 * 1024,
): Promise<AsyncGenerator<Buffer> | null> {
  if (!Number.isSafeInteger(sliceBytes) || sliceBytes <= 0) {
    throw new Error('Invalid timeline slice size');
  }
  const [row] = await sql`
    select atr.id as trace_replay_id, octet_length(atr.request_timeline_gz) as gz_bytes
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
      and atr.request_timeline_version = ${REQUEST_TIMELINE_VERSION}
      and atr.request_timeline_gz is not null
  `;
  if (!row) return null;
  const size = Number(row.gz_bytes);
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid stored timeline size');
  const traceReplayId = Number(row.trace_replay_id);
  return (async function* () {
    for (let offset = 0; offset < size; offset += sliceBytes) {
      const length = Math.min(sliceBytes, size - offset);
      const [part] = await sql`
        select substring(request_timeline_gz from ${offset + 1}::int for ${length}::int) as slice
        from agentic_trace_replay
        where id = ${traceReplayId}
          and request_timeline_version = ${REQUEST_TIMELINE_VERSION}
          and octet_length(request_timeline_gz) = ${size}
      `;
      const bytes = part?.slice;
      if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
        throw new Error(`Stored timeline changed or ended at byte ${offset} of ${size}`);
      }
      yield Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
  })();
}

/**
 * Yield a legacy `request_timeline` JSONB as text in bounded chunks. Throws
 * when the timeline is missing or longer than the chunk limit.
 */
export async function* legacyRequestTimelineText(
  sql: DbClient,
  traceReplayId: number,
): AsyncGenerator<string> {
  for (let part = 0; part < MAX_TIMELINE_TEXT_CHUNKS; part += 1) {
    const offset = part * TIMELINE_TEXT_CHUNK_CHARS;
    const chunkRows = (await sql`
      with payload as materialized (
        select request_timeline::text as text
        from agentic_trace_replay
        where id = ${traceReplayId}
      ),
      piece as materialized (
        select substr(text, ${offset + 1}::int, ${TIMELINE_TEXT_CHUNK_CHARS}::int) as chunk
        from payload
      )
      select
        chunk,
        char_length(chunk)::int as chunk_chars
      from piece
    `) as unknown as RawTimelineChunkRow[];
    const row = chunkRows[0];
    if (!row || row.chunk === null) throw new Error('legacy request_timeline is missing');
    yield row.chunk;
    if (row.chunk_chars < TIMELINE_TEXT_CHUNK_CHARS) return;
  }
  throw new Error(`legacy request_timeline is longer than ${MAX_TIMELINE_TEXT_CHUNKS} text chunks`);
}

/**
 * Read a current stored timeline from the column that holds it: the gzip
 * copy when `gzBytes` (its `octet_length`) is non-null, else the legacy JSONB.
 */
async function readStoredRequestTimeline(
  sql: DbClient,
  traceReplayId: number,
  gzBytes: number | null,
): Promise<RequestTimeline> {
  if (gzBytes !== null) {
    return gunzipRequestTimeline(await readRequestTimelineGz(sql, traceReplayId, gzBytes));
  }
  const pieces: string[] = [];
  for await (const piece of legacyRequestTimelineText(sql, traceReplayId)) pieces.push(piece);
  return parseRequestTimelineJson(pieces.join(''));
}

export async function getRequestTimeline(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<RequestTimeline | null> {
  // The gzip copy wins whenever it exists, and its version is a scalar column,
  // so picking a path never detoasts it. The legacy JSONB version is read only
  // for rows without a gzip copy.
  const rows = (await sql`
    select
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0) as has_blob,
      octet_length(atr.request_timeline_gz) as gz_bytes,
      case
        when atr.request_timeline_gz is not null then atr.request_timeline_version::int
        else (atr.request_timeline->>'version')::int
      end as timeline_version
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;

  // A current timeline is read from the column that holds it, gzip in bounded
  // byte slices and legacy JSONB in bounded text chunks. Never choose the JSONB
  // path by compressed storage size: a small TOAST value can still serialize
  // past Neon's per-query response limit.
  if (Number(row.timeline_version) === REQUEST_TIMELINE_VERSION) {
    try {
      return await readStoredRequestTimeline(
        sql,
        row.trace_replay_id,
        row.gz_bytes === null ? null : Number(row.gz_bytes),
      );
    } catch (error) {
      logRequestTimelineReadFailure(row.trace_replay_id, error);
      return null;
    }
  }

  if (!row.has_blob) return null;

  // Slow path only: fetch the large profile blob after establishing that the
  // pre-computed timeline is stale or missing. Long trace runs can have blobs
  // large enough to exceed Neon's 64 MiB encoded-response limit, so the fast
  // path must never select the blob alongside the stored timeline.
  const timeline = await computeRequestTimeline(() =>
    readTraceProfileChunks(sql, row.trace_replay_id),
  );

  // Self-heal the stored gzip timeline so the next request (and the
  // trace-histograms and request-chart-data routes, which read the same
  // columns) takes the fast path. Only write a complete recompute:
  // `computeRequestTimeline` returns null for a missing/malformed blob, which
  // we must not persist over good data. Best-effort and not awaited, so the
  // response is not delayed (no-ops on a read-only replica).
  if (timeline !== null) {
    void writeBackRequestTimeline(sql, row.trace_replay_id, timeline);
  }

  return timeline;
}

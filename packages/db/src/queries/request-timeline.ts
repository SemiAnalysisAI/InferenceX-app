/**
 * Per-request timeline for the agentic detail page's Gantt view.
 *
 * Backed by `agentic_trace_replay.request_timeline` (pre-computed at
 * ingest time, see `etl/compute-request-timeline.ts`). Current payloads are
 * read as bounded text chunks so Neon's 64 MiB encoded-response limit cannot
 * reject even highly compressible JSONB. The slow path re-computes from
 * `profile_export_jsonl_gz` and is only taken when the column is missing
 * or the stored `REQUEST_TIMELINE_VERSION` is stale.
 */

import {
  REQUEST_TIMELINE_VERSION,
  computeRequestTimeline,
  type RequestTimeline,
} from '../etl/compute-request-timeline';

import type { DbClient } from '../connection.js';
import { writeBackTraceReplayJsonb } from './agentic-shared';

export type { RequestTimeline, RequestRecord } from '../etl/compute-request-timeline';

interface RawMetaRow {
  trace_replay_id: number;
  has_blob: boolean;
  timeline_version: number | null;
}

interface RawBlobRow {
  blob: Buffer | null;
}

interface RawTimelineChunkRow {
  chunk: string | null;
  chunk_chars: number;
}

// JSONB can be far smaller on disk than its serialized response due to TOAST
// compression, so every current timeline uses bounded chunks. Timeline fields
// are compact identifiers/numbers; 16 MiB leaves ample room for JSON-string
// escaping under Neon's 64 MiB per-query response cap.
const TIMELINE_TEXT_CHUNK_CHARS = 16 * 1024 * 1024;
const MAX_TIMELINE_TEXT_CHUNKS = 64;

async function readChunkedRequestTimeline(
  sql: DbClient,
  traceReplayId: number,
): Promise<RequestTimeline | null> {
  const pieces: string[] = [];
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
    if (!row || row.chunk === null) return null;
    pieces.push(row.chunk);
    if (row.chunk_chars < TIMELINE_TEXT_CHUNK_CHARS) {
      try {
        return JSON.parse(pieces.join('')) as RequestTimeline;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function getRequestTimeline(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<RequestTimeline | null> {
  const rows = (await sql`
    select
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null) as has_blob,
      (atr.request_timeline->>'version')::int as timeline_version
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;

  // Read every current pre-computed timeline through bounded text queries.
  // Choosing from compressed storage size is unsafe: a small TOAST value can
  // still serialize past Neon's per-query response limit.
  if (Number(row.timeline_version) === REQUEST_TIMELINE_VERSION) {
    return readChunkedRequestTimeline(sql, row.trace_replay_id);
  }

  if (!row.has_blob) return null;

  // Slow path only: fetch the large profile blob after establishing that the
  // pre-computed timeline is stale or missing. Long trace runs can have blobs
  // large enough to exceed Neon's 64 MiB encoded-response limit, so the fast
  // path must never select the blob alongside request_timeline.
  const blobRows = (await sql`
    select profile_export_jsonl_gz as blob
    from agentic_trace_replay
    where id = ${row.trace_replay_id}
  `) as unknown as RawBlobRow[];
  const timeline = await computeRequestTimeline(blobRows[0]?.blob ?? null);

  // Self-heal the stored request_timeline so the next request (and the
  // trace-histograms route, which reads the same column) takes the fast path.
  // Only write a complete recompute — `computeRequestTimeline` returns null for
  // a missing/malformed blob, which we must not persist over good data.
  // Fire-and-forget, best-effort (no-ops on a read-only replica).
  if (timeline !== null) {
    writeBackTraceReplayJsonb(sql, 'request_timeline', row.trace_replay_id, timeline);
  }

  return timeline;
}

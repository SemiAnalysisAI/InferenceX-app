/**
 * Per-request timeline for the agentic detail page's Gantt view.
 *
 * Backed by `agentic_trace_replay.request_timeline` (pre-computed at
 * ingest time, see `etl/compute-request-timeline.ts`). The fast path is
 * a single SQL row read; the slow path re-computes from
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

type RequestRecordRow = RequestTimeline['requests'][number];

interface RawMetaRow {
  trace_replay_id: number;
  has_blob: boolean;
  timeline_version: number | null;
  start_ns: number | null;
  end_ns: number | null;
  duration_s: number | null;
  request_count: number | null;
}

/**
 * Requests fetched per round trip on the fast path.
 *
 * The stored timeline is one JSONB document, so selecting it whole put its
 * entire JSON text in a single Neon HTTP response — 61 MB for a 151k-request
 * point, past the driver's 64 MiB cap. That failed the route with
 * `507 response is too large` and emptied the ISL/OSL distribution and Gantt
 * charts on the longest runs. Records average ~400 bytes, so 20k per slice
 * keeps each response near 8 MB with room for wider records.
 */
const REQUESTS_PER_CHUNK = 20_000;

interface RawBlobRow {
  blob: Buffer | null;
}

export async function getRequestTimeline(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<RequestTimeline | null> {
  // Read only the header here — never `atr.request_timeline` itself, or a long
  // run's document alone blows the HTTP response cap (see REQUESTS_PER_CHUNK).
  const rows = (await sql`
    select
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null) as has_blob,
      (atr.request_timeline->>'version')::int as timeline_version,
      (atr.request_timeline->>'startNs')::double precision as start_ns,
      (atr.request_timeline->>'endNs')::double precision as end_ns,
      (atr.request_timeline->>'durationS')::double precision as duration_s,
      jsonb_array_length(atr.request_timeline->'requests') as request_count
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;

  // Fast path: pre-computed timeline at the current version, pulled a slice at
  // a time so the response size scales with the chunk rather than the run.
  if (row.timeline_version !== null && Number(row.timeline_version) === REQUEST_TIMELINE_VERSION) {
    const total = Number(row.request_count ?? 0);
    const requests: RequestRecordRow[] = [];
    for (let offset = 0; offset < total; offset += REQUESTS_PER_CHUNK) {
      const chunk = (await sql`
        select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) as requests
        from (
          select r, ord
          from agentic_trace_replay atr,
               jsonb_array_elements(atr.request_timeline->'requests') with ordinality x(r, ord)
          where atr.id = ${row.trace_replay_id}
            and ord > ${offset}
            and ord <= ${offset + REQUESTS_PER_CHUNK}
        ) slice
      `) as unknown as { requests: RequestRecordRow[] }[];
      const slice = chunk[0]?.requests ?? [];
      // A shorter-than-requested slice means the array ended early (the row
      // changed under us); stop rather than spin on empty round trips.
      requests.push(...slice);
      if (slice.length < REQUESTS_PER_CHUNK) break;
    }
    return {
      version: Number(row.timeline_version),
      startNs: Number(row.start_ns ?? 0),
      endNs: Number(row.end_ns ?? 0),
      durationS: Number(row.duration_s ?? 0),
      requests,
    } as RequestTimeline;
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
  const timeline = computeRequestTimeline(blobRows[0]?.blob ?? null);

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

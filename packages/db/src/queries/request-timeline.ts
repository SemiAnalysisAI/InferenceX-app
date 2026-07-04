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

interface RawMetaRow {
  trace_replay_id: number;
  has_blob: boolean;
  request_timeline: RequestTimeline | null;
}

interface RawBlobRow {
  blob: Buffer | null;
}

export async function getRequestTimeline(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<RequestTimeline | null> {
  const rows = (await sql`
    select
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null) as has_blob,
      atr.request_timeline
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;

  // Fast path: pre-computed timeline at the current version.
  if (row.request_timeline && Number(row.request_timeline.version) === REQUEST_TIMELINE_VERSION) {
    return row.request_timeline;
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

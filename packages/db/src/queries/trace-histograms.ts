/**
 * Fetch per-request ISL/OSL arrays from stored aiperf `profile_export.jsonl`
 * blobs (gzipped in `agentic_trace_replay.profile_export_jsonl_gz`). Caller
 * passes the set of `benchmark_results.id`s it wants and receives one entry
 * per id that actually has a trace_replay blob (others are silently skipped).
 *
 * The JSONL has one JSON object per request with the shape:
 *   { metrics: { input_sequence_length: { value, unit }, output_sequence_length: {...}, ... } }
 *
 * Returns raw arrays rather than pre-binned histograms — payload stays tiny
 * (~256 ints * 2 fields per point, ~2 KB compressed) and the frontend can bin
 * however it wants.
 */

import { gunzipSync } from 'node:zlib';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';

import type { DbClient } from '../connection.js';

export interface TraceHistogramPoint {
  /** benchmark_results.id this entry belongs to. */
  id: number;
  /** Input sequence length (tokens) per completed request. */
  isl: number[];
  /** Output sequence length (tokens) per completed request. */
  osl: number[];
}

export type TraceHistogramMap = Record<number, TraceHistogramPoint>;

const QUERY_CHUNK_SIZE = 12;
// Bytea values expand in Neon's JSON-over-HTTP response. Keep raw fallback
// reads comfortably below its 64 MiB response cap; current ingests should use
// request_timeline instead and never need this path.
const MAX_FALLBACK_BLOB_BYTES = 24 * 1024 * 1024;

interface TimelineRow {
  benchmark_result_id: number;
  trace_replay_id: number;
  request_timeline: RequestTimeline | null;
  has_blob: boolean;
}

function histogramFromTimeline(id: number, timeline: RequestTimeline): TraceHistogramPoint {
  const isl: number[] = [];
  const osl: number[] = [];
  for (const request of timeline.requests) {
    if (typeof request.isl === 'number' && Number.isFinite(request.isl)) isl.push(request.isl);
    if (typeof request.osl === 'number' && Number.isFinite(request.osl)) osl.push(request.osl);
  }
  return { id, isl, osl };
}

export async function getTraceHistograms(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<TraceHistogramMap> {
  if (benchmarkResultIds.length === 0) return {};

  const result: TraceHistogramMap = {};
  const fallbackRows: TimelineRow[] = [];
  for (let i = 0; i < benchmarkResultIds.length; i += QUERY_CHUNK_SIZE) {
    const chunk = benchmarkResultIds.slice(i, i + QUERY_CHUNK_SIZE);
    const chunkRows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.id as trace_replay_id,
        atr.request_timeline,
        (atr.profile_export_jsonl_gz is not null) as has_blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as unknown as TimelineRow[];
    for (const row of chunkRows) {
      const id = Number(row.benchmark_result_id);
      if (
        row.request_timeline &&
        Number(row.request_timeline.version) === REQUEST_TIMELINE_VERSION
      ) {
        result[id] = histogramFromTimeline(id, row.request_timeline);
      } else if (row.has_blob) {
        fallbackRows.push(row);
      }
    }
  }

  // Compatibility fallback for pre-timeline rows. Fetch one small blob at a
  // time; oversized legacy rows are omitted instead of turning the whole API
  // response into a 507.
  for (const row of fallbackRows) {
    const blobRows = (await sql`
      select profile_export_jsonl_gz as blob
      from agentic_trace_replay
      where id = ${row.trace_replay_id}
        and octet_length(profile_export_jsonl_gz) <= ${MAX_FALLBACK_BLOB_BYTES}
    `) as unknown as { blob: Buffer }[];
    const blob = blobRows[0]?.blob;
    if (!blob) continue;
    try {
      const jsonl = gunzipSync(blob).toString('utf8');
      const isl: number[] = [];
      const osl: number[] = [];
      for (const line of jsonl.split('\n')) {
        if (!line) continue;
        let rec: { metrics?: Record<string, { value?: number } | number> };
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        const m = rec.metrics ?? {};
        const islVal = readMetric(m['input_sequence_length']);
        const oslVal = readMetric(m['output_sequence_length']);
        if (typeof islVal === 'number' && Number.isFinite(islVal)) isl.push(islVal);
        if (typeof oslVal === 'number' && Number.isFinite(oslVal)) osl.push(oslVal);
      }
      result[Number(row.benchmark_result_id)] = {
        id: Number(row.benchmark_result_id),
        isl,
        osl,
      };
    } catch {
      // Drop malformed blobs silently — caller treats missing ids as "no data".
    }
  }
  return result;
}

function readMetric(v: { value?: number } | number | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  return v.value;
}

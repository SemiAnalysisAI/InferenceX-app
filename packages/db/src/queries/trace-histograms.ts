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

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';

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
  /** Version of the stored timeline, read WITHOUT shipping the document. */
  timeline_version: number | null;
  /** ISL per completed request, unnested server-side (see the query below). */
  isl: (number | null)[] | null;
  osl: (number | null)[] | null;
  has_blob: boolean;
}

/** Postgres hands back `number[]`; drop anything non-finite defensively. */
function finiteNumbers(values: (number | null)[] | null): number[] {
  const out: number[] = [];
  for (const value of values ?? []) {
    const n = Number(value);
    if (value !== null && Number.isFinite(n)) out.push(n);
  }
  return out;
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
    // Project the two arrays out in SQL instead of selecting
    // `atr.request_timeline` whole. The timeline carries ~18 fields per
    // request, so shipping the document to extract two integers per request
    // moved 61 MB of JSON for a 151k-request point — past the Neon HTTP
    // driver's 64 MiB response cap, which failed the whole request with
    // `507 response is too large` and left the distribution charts empty on
    // exactly the biggest runs. Unnesting server-side sends ~600 KB instead.
    const chunkRows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.id as trace_replay_id,
        (atr.request_timeline->>'version')::int as timeline_version,
        (
          select array_agg((r->>'isl')::numeric order by ord)
          from jsonb_array_elements(atr.request_timeline->'requests') with ordinality x(r, ord)
          where jsonb_typeof(r->'isl') = 'number'
        ) as isl,
        (
          select array_agg((r->>'osl')::numeric order by ord)
          from jsonb_array_elements(atr.request_timeline->'requests') with ordinality x(r, ord)
          where jsonb_typeof(r->'osl') = 'number'
        ) as osl,
        (atr.profile_export_jsonl_gz is not null) as has_blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as unknown as TimelineRow[];
    for (const row of chunkRows) {
      const id = Number(row.benchmark_result_id);
      if (
        row.timeline_version !== null &&
        Number(row.timeline_version) === REQUEST_TIMELINE_VERSION
      ) {
        result[id] = { id, isl: finiteNumbers(row.isl), osl: finiteNumbers(row.osl) };
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

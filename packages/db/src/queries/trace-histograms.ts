/**
 * Per-request ISL/OSL arrays for a set of agentic benchmark points. Caller
 * passes the `benchmark_results.id`s it wants and receives one entry per id
 * whose stored request timeline or raw aiperf `profile_export.jsonl` blob
 * could be read (others are silently skipped).
 *
 * Current request timelines supply the arrays: gzip timelines
 * (`request_timeline_gz`) are decoded in Node, and legacy JSONB timelines are
 * unnested in SQL. Points without a current timeline fall back to the gzipped
 * profile blob, whose JSONL has one JSON object per request with the shape:
 *   { metrics: { input_sequence_length: { value, unit }, output_sequence_length: {...}, ... } }
 *
 * Returns raw arrays rather than pre-binned histograms — payload stays tiny
 * (~256 ints * 2 fields per point, ~2 KB compressed) and the frontend can bin
 * however it wants.
 */

import { gunzipSync } from 'node:zlib';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';
import { scanRequestTimelineGz } from '../etl/request-timeline-codec';

import type { DbClient } from '../connection.js';
import { logRequestTimelineReadFailure, readRequestTimelineGz } from './request-timeline';

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
// reads comfortably below its 64 MiB response cap; current ingests store a
// request timeline and never need this path.
const MAX_FALLBACK_BLOB_BYTES = 24 * 1024 * 1024;

/** The only request fields a histogram needs from a scanned gzip timeline. */
const SEQUENCE_LENGTH_FIELDS: ReadonlySet<string> = new Set(['isl', 'osl']);

interface TimelineRow {
  benchmark_result_id: number;
  trace_replay_id: number;
  /** octet_length(request_timeline_gz); null when the row has no gzip timeline. */
  gz_bytes: number | null;
  /** Version of the stored timeline, read WITHOUT shipping the document. */
  timeline_version: number | null;
  /** Legacy JSONB only: ISL per completed request, unnested server-side. */
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
  const gzRows: TimelineRow[] = [];
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
    // Rows with a gzip timeline never touch the legacy JSONB here.
    const chunkRows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.id as trace_replay_id,
        octet_length(atr.request_timeline_gz) as gz_bytes,
        case
          when atr.request_timeline_gz is not null then atr.request_timeline_version::int
          else (atr.request_timeline->>'version')::int
        end as timeline_version,
        case when atr.request_timeline_gz is null then (
          select array_agg((r->>'isl')::numeric order by ord)
          from jsonb_array_elements(atr.request_timeline->'requests') with ordinality x(r, ord)
          where jsonb_typeof(r->'isl') = 'number'
        ) end as isl,
        case when atr.request_timeline_gz is null then (
          select array_agg((r->>'osl')::numeric order by ord)
          from jsonb_array_elements(atr.request_timeline->'requests') with ordinality x(r, ord)
          where jsonb_typeof(r->'osl') = 'number'
        ) end as osl,
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
        if (row.gz_bytes === null) {
          result[id] = { id, isl: finiteNumbers(row.isl), osl: finiteNumbers(row.osl) };
        } else {
          gzRows.push(row);
        }
      } else if (row.has_blob) {
        fallbackRows.push(row);
      }
    }
  }

  // Gzip timelines are scanned in Node one point at a time, keeping only each
  // request's ISL and OSL. A timeline that cannot be read is logged and
  // omitted, like a malformed blob below.
  for (const row of gzRows) {
    const isl: number[] = [];
    const osl: number[] = [];
    try {
      const gz = await readRequestTimelineGz(sql, row.trace_replay_id, Number(row.gz_bytes));
      await scanRequestTimelineGz(gz, SEQUENCE_LENGTH_FIELDS, (request) => {
        if (typeof request.isl === 'number' && Number.isFinite(request.isl)) isl.push(request.isl);
        if (typeof request.osl === 'number' && Number.isFinite(request.osl)) osl.push(request.osl);
      });
    } catch (error) {
      logRequestTimelineReadFailure(row.trace_replay_id, error);
      continue;
    }
    const id = Number(row.benchmark_result_id);
    result[id] = { id, isl, osl };
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

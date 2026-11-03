/**
 * Per-request ISL/OSL arrays for a set of agentic benchmark points. Caller
 * passes the `benchmark_results.id`s it wants and receives one entry per id
 * whose stored request timeline or raw aiperf `profile_export.jsonl` blob
 * could be read (others are silently skipped).
 *
 * Precomputed request-chart columns (`request_chart_data_gz`) supply the
 * arrays when current; only their ISL and OSL columns are decoded. Otherwise
 * current request timelines do: gzip timelines (`request_timeline_gz`) are
 * decoded in Node, and legacy JSONB timelines are unnested in SQL. Points
 * without a current timeline fall back to the gzipped profile blob, whose
 * JSONL has one JSON object per request with the shape:
 *   { metrics: { input_sequence_length: { value, unit }, output_sequence_length: {...}, ... } }
 *
 * Returns raw arrays rather than pre-binned histograms — payload stays tiny
 * (~256 ints * 2 fields per point, ~2 KB compressed) and the frontend can bin
 * however it wants.
 */

import { readTraceProfileLines } from '../lib/trace-profile-storage';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';
import { decodeRequestChartSequenceLengths } from '../etl/request-chart-columns';
import { scanRequestTimelineGz } from '../etl/request-timeline-codec';

import type { DbClient } from '../connection.js';
import {
  REQUEST_CHART_DATA_VERSION,
  logRequestChartColumnsReadFailure,
  readRequestChartColumns,
} from './request-chart-data';
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
const INLINE_COLUMNS_BYTES = 1024 * 1024;
const POINTS_IN_FLIGHT = 4;
/** The only request fields a histogram needs from a scanned gzip timeline. */
const SEQUENCE_LENGTH_FIELDS: ReadonlySet<string> = new Set(['isl', 'osl']);

interface TimelineRow {
  benchmark_result_id: number;
  trace_replay_id: number;
  columns_bytes: number | null;
  columns_inline: string | null;
  /** octet_length(request_timeline_gz); null when the row has no gzip timeline. */
  gz_bytes: number | null;
  /** Version of the stored timeline, read WITHOUT shipping the document. */
  timeline_version: number | null;
  /** Legacy JSONB only: ISL per completed request, unnested server-side. */
  isl: (number | null)[] | null;
  osl: (number | null)[] | null;
  has_blob: boolean;
}

type SequenceLengths = Omit<TraceHistogramPoint, 'id'>;

/** Postgres hands back `number[]`; drop anything non-finite defensively. */
function finiteNumbers(values: (number | null)[] | null): number[] {
  const out: number[] = [];
  for (const value of values ?? []) {
    const n = Number(value);
    if (value !== null && Number.isFinite(n)) out.push(n);
  }
  return out;
}

async function scanTimelineSequenceLengths(
  sql: DbClient,
  row: TimelineRow,
): Promise<SequenceLengths | null> {
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
    return null;
  }
  return { isl, osl };
}

async function profileSequenceLengths(
  sql: DbClient,
  traceReplayId: number,
): Promise<SequenceLengths | null> {
  try {
    const isl: number[] = [];
    const osl: number[] = [];
    for await (const line of readTraceProfileLines(sql, traceReplayId)) {
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
    return { isl, osl };
  } catch {
    return null;
  }
}

async function pointSequenceLengths(
  sql: DbClient,
  row: TimelineRow,
): Promise<SequenceLengths | null> {
  if (row.columns_bytes !== null) {
    try {
      return decodeRequestChartSequenceLengths(
        await readRequestChartColumns(
          sql,
          row.trace_replay_id,
          Number(row.columns_bytes),
          row.columns_inline,
        ),
      );
    } catch (error) {
      logRequestChartColumnsReadFailure(row.trace_replay_id, error);
    }
  }
  if (row.timeline_version !== null && Number(row.timeline_version) === REQUEST_TIMELINE_VERSION) {
    return row.gz_bytes === null
      ? { isl: finiteNumbers(row.isl), osl: finiteNumbers(row.osl) }
      : scanTimelineSequenceLengths(sql, row);
  }
  return row.has_blob ? profileSequenceLengths(sql, row.trace_replay_id) : null;
}

export async function getTraceHistograms(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<TraceHistogramMap> {
  if (benchmarkResultIds.length === 0) return {};

  const rows: TimelineRow[] = [];
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
        case
          when atr.request_chart_data_version = ${REQUEST_CHART_DATA_VERSION}
            then octet_length(atr.request_chart_data_gz)
        end as columns_bytes,
        case
          when atr.request_chart_data_version = ${REQUEST_CHART_DATA_VERSION}
            and octet_length(atr.request_chart_data_gz) <= ${INLINE_COLUMNS_BYTES}
            then encode(atr.request_chart_data_gz, 'base64')
        end as columns_inline,
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
        (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0) as has_blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as unknown as TimelineRow[];
    rows.push(...chunkRows);
  }

  const result: TraceHistogramMap = {};
  let next = 0;
  const readPoints = async (): Promise<void> => {
    while (next < rows.length) {
      const row = rows[next++];
      const lengths = await pointSequenceLengths(sql, row);
      const id = Number(row.benchmark_result_id);
      if (lengths) result[id] = { id, ...lengths };
    }
  };
  await Promise.all(Array.from({ length: POINTS_IN_FLIGHT }, readPoints));
  return result;
}

function readMetric(v: { value?: number } | number | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  return v.value;
}

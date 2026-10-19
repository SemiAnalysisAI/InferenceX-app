import { readTraceProfileLines } from '../lib/trace-profile-storage';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';
import { scanRequestTimelineGz } from '../etl/request-timeline-codec';

import type { DbClient } from '../connection.js';
import { logRequestTimelineReadFailure, readRequestTimelineGz } from './request-timeline';

export interface TraceHistogramPoint {
  id: number;
  isl: number[];
  osl: number[];
}

export type TraceHistogramMap = Record<number, TraceHistogramPoint>;

const QUERY_CHUNK_SIZE = 12;
const SEQUENCE_LENGTH_FIELDS: ReadonlySet<string> = new Set(['isl', 'osl']);

interface TimelineRow {
  benchmark_result_id: number;
  trace_replay_id: number;
  gz_bytes: number | null;
  timeline_version: number | null;
  isl: (number | null)[] | null;
  osl: (number | null)[] | null;
  has_blob: boolean;
}

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
        (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0) as has_blob
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

  for (const row of fallbackRows) {
    try {
      const isl: number[] = [];
      const osl: number[] = [];
      for await (const line of readTraceProfileLines(sql, row.trace_replay_id)) {
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
    } catch {}
  }
  return result;
}

function readMetric(v: { value?: number } | number | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  return v.value;
}

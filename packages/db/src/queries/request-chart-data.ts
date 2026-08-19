/**
 * Compact per-request data used by the default agentic point charts.
 *
 * The full request timeline contains source-trace metadata and Gantt-only
 * timing fields. Large runs can make that document tens of megabytes, even
 * though the summary charts need only nine values per request. This query
 * projects those values once in Postgres and dictionary-encodes repeated
 * strings before the response crosses the network.
 */

import {
  REQUEST_TIMELINE_VERSION,
  type RequestRecord,
  type RequestTimeline,
} from '../etl/compute-request-timeline';

import type { DbClient } from '../connection.js';
import { getRequestTimeline } from './request-timeline';

const REQUEST_CHART_SHAPE_VERSION = 1;
export const REQUEST_CHART_DATA_VERSION =
  REQUEST_TIMELINE_VERSION * 100 + REQUEST_CHART_SHAPE_VERSION;

export type RequestChartTuple = [
  cid: number,
  phase: number,
  start: number,
  end: number,
  ttftMs: number | null,
  tpotMs: number | null,
  isl: number | null,
  osl: number | null,
  cancelled: 0 | 1,
];

export interface RequestChartDataWire {
  version: number;
  timelineVersion: number;
  startNs: number;
  endNs: number;
  durationS: number;
  cids: string[];
  phases: string[];
  requests: RequestChartTuple[];
}

interface RawChartRow {
  trace_replay_id: number;
  has_blob: boolean;
  timeline_version: number | null;
  start_ns: number | null;
  end_ns: number | null;
  duration_s: number | null;
  requests: [
    cid: string,
    phase: string,
    start: number,
    end: number,
    ttftMs: number | null,
    tpotMs: number | null,
    isl: number | null,
    osl: number | null,
    cancelled: boolean,
  ][];
}

type ChartRecord = Pick<
  RequestRecord,
  'cid' | 'phase' | 'start' | 'end' | 'ttftMs' | 'tpotMs' | 'isl' | 'osl' | 'cancelled'
>;

function dictionaryIndex(value: string, values: string[], indices: Map<string, number>): number {
  const existing = indices.get(value);
  if (existing !== undefined) return existing;
  const index = values.length;
  values.push(value);
  indices.set(value, index);
  return index;
}

export function encodeRequestChartData(
  timeline: Pick<RequestTimeline, 'version' | 'startNs' | 'endNs' | 'durationS'>,
  records: readonly ChartRecord[],
): RequestChartDataWire {
  const cids: string[] = [];
  const phases: string[] = [];
  const cidIndices = new Map<string, number>();
  const phaseIndices = new Map<string, number>();
  const requests: RequestChartTuple[] = [];

  for (const record of records) {
    requests.push([
      dictionaryIndex(record.cid, cids, cidIndices),
      dictionaryIndex(record.phase, phases, phaseIndices),
      record.start,
      record.end,
      record.ttftMs,
      record.tpotMs,
      record.isl,
      record.osl,
      record.cancelled ? 1 : 0,
    ]);
  }

  return {
    version: REQUEST_CHART_DATA_VERSION,
    timelineVersion: timeline.version,
    startNs: timeline.startNs,
    endNs: timeline.endNs,
    durationS: timeline.durationS,
    cids,
    phases,
    requests,
  };
}

export async function getRequestChartData(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<RequestChartDataWire | null> {
  const rows = (await sql`
    select
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null) as has_blob,
      (atr.request_timeline->>'version')::int as timeline_version,
      (atr.request_timeline->>'startNs')::double precision as start_ns,
      (atr.request_timeline->>'endNs')::double precision as end_ns,
      (atr.request_timeline->>'durationS')::double precision as duration_s,
      coalesce((
        select jsonb_agg(jsonb_build_array(
          request->>'cid',
          request->>'phase',
          (request->>'start')::double precision,
          (request->>'end')::double precision,
          (request->>'ttftMs')::double precision,
          (request->>'tpotMs')::double precision,
          (request->>'isl')::int,
          (request->>'osl')::int,
          coalesce((request->>'cancelled')::boolean, false)
        ) order by ordinal)
        from jsonb_array_elements(atr.request_timeline->'requests')
          with ordinality as expanded(request, ordinal)
      ), '[]'::jsonb) as requests
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawChartRow[];
  const row = rows[0];
  if (!row) return null;

  if (row.timeline_version !== null && Number(row.timeline_version) === REQUEST_TIMELINE_VERSION) {
    const records: ChartRecord[] = row.requests.map((request) => ({
      cid: request[0],
      phase: request[1],
      start: Number(request[2]),
      end: Number(request[3]),
      ttftMs: request[4] === null ? null : Number(request[4]),
      tpotMs: request[5] === null ? null : Number(request[5]),
      isl: request[6] === null ? null : Number(request[6]),
      osl: request[7] === null ? null : Number(request[7]),
      cancelled: Boolean(request[8]),
    }));
    return encodeRequestChartData(
      {
        version: Number(row.timeline_version),
        startNs: Number(row.start_ns ?? 0),
        endNs: Number(row.end_ns ?? 0),
        durationS: Number(row.duration_s ?? 0),
      },
      records,
    );
  }

  if (!row.has_blob) return null;
  const timeline = await getRequestTimeline(sql, benchmarkResultId);
  return timeline ? encodeRequestChartData(timeline, timeline.requests) : null;
}

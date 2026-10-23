import {
  REQUEST_TIMELINE_VERSION,
  type RequestRecord,
  type RequestTimeline,
} from '../etl/compute-request-timeline';
import {
  scanRequestTimelineGz,
  scanRequestTimelineText,
  type RequestTimelineHeader,
  type ScannedRequest,
} from '../etl/request-timeline-codec';

import type { DbClient } from '../connection.js';
import {
  getRequestTimeline,
  legacyRequestTimelineText,
  logRequestTimelineReadFailure,
  readRequestTimelineGz,
} from './request-timeline';

const REQUEST_CHART_SHAPE_VERSION = 2;
export const REQUEST_CHART_DATA_VERSION =
  REQUEST_TIMELINE_VERSION * 100 + REQUEST_CHART_SHAPE_VERSION;

export type RequestChartTuple = [
  cid: number,
  phase: number,
  startUs: number,
  endUs: number,
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

interface RawChartMetaRow {
  trace_replay_id: number;
  has_blob: boolean;
  gz_bytes: number | null;
  timeline_version: number | null;
  legacy_request_count: number | null;
}

interface RawProjectedChartRow {
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

export const LEGACY_PROJECTION_MAX_REQUESTS = 250_000;

type ChartRecord = Pick<
  RequestRecord,
  'cid' | 'phase' | 'start' | 'end' | 'ttftMs' | 'tpotMs' | 'isl' | 'osl' | 'cancelled'
>;

const CHART_REQUEST_FIELDS: ReadonlySet<string> = new Set<keyof ChartRecord>([
  'cid',
  'phase',
  'start',
  'end',
  'ttftMs',
  'tpotMs',
  'isl',
  'osl',
  'cancelled',
]);

function dictionaryIndex(value: string, values: string[], indices: Map<string, number>): number {
  const existing = indices.get(value);
  if (existing !== undefined) return existing;
  const index = values.length;
  values.push(value);
  indices.set(value, index);
  return index;
}

const nanosecondsToMicroseconds = (value: number): number => Math.round(value / 1_000);
const roundMilliseconds = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 1_000) / 1_000;
const nullableNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

function createRequestChartEncoder(): {
  add: (record: ChartRecord) => void;
  finish: (
    timeline: Pick<RequestTimeline, 'version' | 'startNs' | 'endNs' | 'durationS'>,
  ) => RequestChartDataWire;
} {
  const cids: string[] = [];
  const phases: string[] = [];
  const cidIndices = new Map<string, number>();
  const phaseIndices = new Map<string, number>();
  const requests: RequestChartTuple[] = [];
  return {
    add(record) {
      requests.push([
        dictionaryIndex(record.cid, cids, cidIndices),
        dictionaryIndex(record.phase, phases, phaseIndices),
        nanosecondsToMicroseconds(record.start),
        nanosecondsToMicroseconds(record.end),
        roundMilliseconds(record.ttftMs),
        roundMilliseconds(record.tpotMs),
        record.isl,
        record.osl,
        record.cancelled ? 1 : 0,
      ]);
    },
    finish(timeline) {
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
    },
  };
}

export function encodeRequestChartData(
  timeline: Pick<RequestTimeline, 'version' | 'startNs' | 'endNs' | 'durationS'>,
  records: Iterable<ChartRecord>,
): RequestChartDataWire {
  const encoder = createRequestChartEncoder();
  for (const record of records) encoder.add(record);
  return encoder.finish(timeline);
}

async function projectLegacyRequestChartData(
  sql: DbClient,
  traceReplayId: number,
): Promise<RequestChartDataWire | null> {
  const rows = (await sql`
    select
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
    from agentic_trace_replay atr
    where atr.id = ${traceReplayId}
      and (atr.request_timeline->>'version')::int = ${REQUEST_TIMELINE_VERSION}
  `) as unknown as RawProjectedChartRow[];
  const row = rows[0];
  if (!row) return null;

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
      version: REQUEST_TIMELINE_VERSION,
      startNs: Number(row.start_ns ?? 0),
      endNs: Number(row.end_ns ?? 0),
      durationS: Number(row.duration_s ?? 0),
    },
    records,
  );
}

async function scanStoredRequestChartData(
  sql: DbClient,
  traceReplayId: number,
  gzBytes: number | null,
): Promise<RequestChartDataWire | null> {
  const encoder = createRequestChartEncoder();
  const addRequest = (request: ScannedRequest): void => {
    encoder.add({
      cid: String(request.cid),
      phase: String(request.phase),
      start: Number(request.start),
      end: Number(request.end),
      ttftMs: nullableNumber(request.ttftMs),
      tpotMs: nullableNumber(request.tpotMs),
      isl: nullableNumber(request.isl),
      osl: nullableNumber(request.osl),
      cancelled: request.cancelled === true,
    });
  };
  let header: RequestTimelineHeader;
  try {
    header =
      gzBytes === null
        ? await scanRequestTimelineText(
            legacyRequestTimelineText(sql, traceReplayId),
            CHART_REQUEST_FIELDS,
            addRequest,
          )
        : await scanRequestTimelineGz(
            await readRequestTimelineGz(sql, traceReplayId, gzBytes),
            CHART_REQUEST_FIELDS,
            addRequest,
          );
  } catch (error) {
    logRequestTimelineReadFailure(traceReplayId, error);
    return null;
  }
  return encoder.finish({
    version: Number(header.version),
    startNs: Number(header.startNs ?? 0),
    endNs: Number(header.endNs ?? 0),
    durationS: Number(header.durationS ?? 0),
  });
}

export async function getRequestChartData(
  sql: DbClient,
  benchmarkResultId: number,
  legacyProjectionMaxRequests = LEGACY_PROJECTION_MAX_REQUESTS,
): Promise<RequestChartDataWire | null> {
  const rows = (await sql`
    select
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0) as has_blob,
      octet_length(atr.request_timeline_gz) as gz_bytes,
      case
        when atr.request_timeline_gz is not null then atr.request_timeline_version::int
        else (atr.request_timeline->>'version')::int
      end as timeline_version,
      case
        when atr.request_timeline_gz is null
          and jsonb_typeof(atr.request_timeline->'requests') = 'array'
          then jsonb_array_length(atr.request_timeline->'requests')
      end as legacy_request_count
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawChartMetaRow[];
  const row = rows[0];
  if (!row) return null;

  if (Number(row.timeline_version) === REQUEST_TIMELINE_VERSION) {
    const gzBytes = row.gz_bytes === null ? null : Number(row.gz_bytes);
    if (
      gzBytes === null &&
      row.legacy_request_count !== null &&
      Number(row.legacy_request_count) <= legacyProjectionMaxRequests
    ) {
      return projectLegacyRequestChartData(sql, row.trace_replay_id);
    }
    return scanStoredRequestChartData(sql, row.trace_replay_id, gzBytes);
  }

  if (!row.has_blob) return null;
  const timeline = await getRequestTimeline(sql, benchmarkResultId);
  return timeline ? encodeRequestChartData(timeline, timeline.requests) : null;
}

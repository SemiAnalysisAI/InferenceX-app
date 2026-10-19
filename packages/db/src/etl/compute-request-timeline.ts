import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

export const REQUEST_TIMELINE_VERSION = 6;

export interface RequestRecord {
  cid: string;
  ri?: number;
  ti: number;
  srcTrace?: string;
  srcOuter?: number;
  srcInner?: number;
  srcKind?: string;
  wid: string;
  ad: number;
  phase: string;
  credit: number;
  start: number;
  ack: number | null;
  end: number;
  ttftMs: number | null;
  tpotMs: number | null;
  isl: number | null;
  osl: number | null;
  cancelled: boolean;
}

export interface RequestTimeline {
  version: number;
  startNs: number;
  endNs: number;
  durationS: number;
  requests: RequestRecord[];
}

interface RawMetadata {
  conversation_id?: string;
  root_correlation_id?: string;
  parent_correlation_id?: string;
  x_correlation_id?: string;
  turn_index?: number;
  source_trace_id?: string;
  source_outer_idx?: number;
  source_inner_idx?: number;
  source_kind?: string;
  worker_id?: string;
  agent_depth?: number;
  benchmark_phase?: string;
  credit_issued_ns?: number;
  request_start_ns?: number;
  request_ack_ns?: number;
  request_end_ns?: number;
  was_cancelled?: boolean;
}

interface RawMetricValue {
  value?: number;
}

interface RawRecord {
  metadata?: RawMetadata;
  metrics?: {
    time_to_first_token?: RawMetricValue | number;
    time_per_output_token?: RawMetricValue | number;
    inter_token_latency?: RawMetricValue | number;
    input_sequence_length?: RawMetricValue | number;
    output_sequence_length?: RawMetricValue | number;
  };
}

function readNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return undefined;
}

interface ReplayCorrelationMaps {
  parentByCorrelation: Map<string, string>;
  rootByCorrelation: Map<string, string>;
}

function correlationId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveCorrelationRoot(id: string, maps: ReplayCorrelationMaps): string {
  const seen = new Set<string>();
  let current = id;
  while (!seen.has(current)) {
    seen.add(current);
    const explicitRoot = maps.rootByCorrelation.get(current);
    if (explicitRoot !== undefined) return explicitRoot;
    const parent = maps.parentByCorrelation.get(current);
    if (parent === undefined) return current;
    current = parent;
  }
  return id;
}

function replayKey(meta: RawMetadata, maps: ReplayCorrelationMaps): string | undefined {
  const explicitRoot = correlationId(meta.root_correlation_id);
  if (explicitRoot !== undefined) return explicitRoot;
  const session = correlationId(meta.x_correlation_id);
  return session === undefined ? undefined : resolveCorrelationRoot(session, maps);
}

async function* gunzipLines(blob: Buffer | (() => AsyncIterable<Buffer>)): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let carry = '';

  const source = Readable.from(typeof blob === 'function' ? blob() : [blob]);
  const gunzip = createGunzip();
  source.on('error', (error) => gunzip.destroy(error));
  try {
    for await (const chunk of source.pipe(gunzip)) {
      const text = carry + decoder.write(chunk as Buffer);
      let lineStart = 0;
      let newline = text.indexOf('\n');
      while (newline !== -1) {
        yield text.slice(lineStart, newline);
        lineStart = newline + 1;
        newline = text.indexOf('\n', lineStart);
      }
      carry = text.slice(lineStart);
    }

    carry += decoder.end();
    if (carry.length > 0) yield carry;
  } finally {
    source.destroy();
    gunzip.destroy();
  }
}

function parseRawRecord(line: string): RawRecord | null {
  if (!line) return null;
  try {
    return JSON.parse(line) as RawRecord;
  } catch {
    return null;
  }
}

export async function computeRequestTimeline(
  blob: Buffer | (() => AsyncIterable<Buffer>) | null,
): Promise<RequestTimeline | null> {
  if (!blob) return null;

  let originNs = Number.POSITIVE_INFINITY;
  let endNs = 0;
  let recordCount = 0;
  const explicitRootFirstStart = new Map<string, number>();
  const legacySessionFirstStart = new Map<string, number>();
  const correlationMaps: ReplayCorrelationMaps = {
    parentByCorrelation: new Map(),
    rootByCorrelation: new Map(),
  };

  try {
    for await (const line of gunzipLines(blob)) {
      const rec = parseRawRecord(line);
      if (!rec) continue;
      const meta = rec.metadata ?? {};
      const cStart = meta.credit_issued_ns ?? meta.request_start_ns;
      const cEnd = meta.request_end_ns;
      if (typeof cStart !== 'number' || typeof cEnd !== 'number') continue;

      recordCount += 1;
      if (cStart < originNs) originNs = cStart;
      if (cEnd > endNs) endNs = cEnd;

      const session = correlationId(meta.x_correlation_id);
      const explicitRoot = correlationId(meta.root_correlation_id);
      const parent = correlationId(meta.parent_correlation_id);
      if (session !== undefined && explicitRoot !== undefined) {
        correlationMaps.rootByCorrelation.set(session, explicitRoot);
      }
      if (session !== undefined && parent !== undefined) {
        correlationMaps.parentByCorrelation.set(session, parent);
      }

      const firstStarts =
        explicitRoot === undefined ? legacySessionFirstStart : explicitRootFirstStart;
      const key = explicitRoot ?? session;
      if (key === undefined) continue;
      const current = firstStarts.get(key);
      if (current === undefined || cStart < current) firstStarts.set(key, cStart);
    }
  } catch {
    return null;
  }

  if (recordCount === 0) return null;
  if (!Number.isFinite(originNs)) originNs = 0;

  const replayFirstStart = new Map(explicitRootFirstStart);
  for (const [session, firstStart] of legacySessionFirstStart) {
    const key = resolveCorrelationRoot(session, correlationMaps);
    const current = replayFirstStart.get(key);
    if (current === undefined || firstStart < current) replayFirstStart.set(key, firstStart);
  }

  const replayIndex = new Map<string, number>();
  [...replayFirstStart.entries()]
    .sort(
      ([aKey, aStart], [bKey, bStart]) =>
        aStart - bStart || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0),
    )
    .forEach(([key], index) => replayIndex.set(key, index));

  const requests: RequestRecord[] = [];
  try {
    for await (const line of gunzipLines(blob)) {
      const rec = parseRawRecord(line);
      if (!rec) continue;
      const m = rec.metadata ?? {};
      const cStart = m.credit_issued_ns ?? m.request_start_ns;
      const cEnd = m.request_end_ns;
      if (typeof cStart !== 'number' || typeof cEnd !== 'number') continue;

      const credit = cStart - originNs;
      const start = (m.request_start_ns ?? m.credit_issued_ns ?? originNs) - originNs;
      const ack = typeof m.request_ack_ns === 'number' ? m.request_ack_ns - originNs : null;
      const end = cEnd - originNs;
      requests.push({
        cid: m.conversation_id ?? 'unknown',
        ri: replayIndex.get(replayKey(m, correlationMaps) ?? ''),
        ti: typeof m.turn_index === 'number' ? m.turn_index : 0,
        srcTrace: typeof m.source_trace_id === 'string' ? m.source_trace_id : undefined,
        srcOuter: typeof m.source_outer_idx === 'number' ? m.source_outer_idx : undefined,
        srcInner: typeof m.source_inner_idx === 'number' ? m.source_inner_idx : undefined,
        srcKind: typeof m.source_kind === 'string' ? m.source_kind : undefined,
        wid: m.worker_id ?? 'unknown',
        ad: typeof m.agent_depth === 'number' ? m.agent_depth : 0,
        phase: m.benchmark_phase ?? 'unknown',
        credit,
        start,
        ack,
        end,
        ttftMs: readNum(rec.metrics?.time_to_first_token) ?? null,
        tpotMs:
          readNum(rec.metrics?.time_per_output_token) ??
          readNum(rec.metrics?.inter_token_latency) ??
          null,
        isl: readNum(rec.metrics?.input_sequence_length) ?? null,
        osl: readNum(rec.metrics?.output_sequence_length) ?? null,
        cancelled: m.was_cancelled === true,
      });
    }
  } catch {
    return null;
  }

  requests.sort((a, b) => a.start - b.start);

  return {
    version: REQUEST_TIMELINE_VERSION,
    startNs: originNs,
    endNs,
    durationS: endNs > originNs ? (endNs - originNs) / 1e9 : 0,
    requests,
  };
}

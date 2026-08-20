/**
 * Pre-compute the per-request timeline for the agentic detail page's
 * Gantt view. Output lands in `agentic_trace_replay.request_timeline`
 * and is read directly by the timeline API route.
 *
 * Shape is a thin array — roughly 150 bytes per request before JSONB
 * compression. The largest throughput runs contain hundreds of thousands of
 * requests, so extraction must not materialize the decompressed JSONL.
 *
 * Versioned so the backfill script knows which rows are stale — bump
 * `REQUEST_TIMELINE_VERSION` whenever the extraction algorithm changes.
 */

import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

/** Bump when the extraction algorithm changes — backfill recomputes anything older. */
export const REQUEST_TIMELINE_VERSION = 6;

export interface RequestRecord {
  /** Conversation id (groups turns of one agent session). */
  cid: string;
  /** Compact replay-lane id derived from AIPerf's stable correlation id. */
  ri?: number;
  /** Zero-based turn index within the conversation. */
  ti: number;
  /** Source trace id from the original raw dataset, when distinct from replay cid. */
  srcTrace?: string;
  /** Original raw top-level request index within srcTrace. */
  srcOuter?: number;
  /** Original nested request index within srcOuter, for subagent children. */
  srcInner?: number;
  /** Loader-specific source kind, e.g. weka_main or weka_flat. */
  srcKind?: string;
  /** Worker id (concurrency slot that handled this request). */
  wid: string;
  /** Sub-agent depth (0 = top-level). */
  ad: number;
  /** `warmup` or `profiling`. */
  phase: string;
  /** ns offset from timeline.startNs. Load gen decided to dispatch. */
  credit: number;
  /** ns offset from timeline.startNs. HTTP send started. */
  start: number;
  /** ns offset from timeline.startNs. First server acknowledgement (or null). */
  ack: number | null;
  /** ns offset from timeline.startNs. Last byte received. */
  end: number;
  /** Time-to-first-token in ms. */
  ttftMs: number | null;
  /** Time per output token in ms. */
  tpotMs: number | null;
  /** Input sequence length (tokens). */
  isl: number | null;
  /** Output sequence length (tokens). */
  osl: number | null;
  cancelled: boolean;
}

export interface RequestTimeline {
  version: number;
  /** Wall-clock ns of the earliest event (used as the relative-time origin). */
  startNs: number;
  /** Wall-clock ns of the latest `request_end_ns`. */
  endNs: number;
  /** Total span in seconds. */
  durationS: number;
  requests: RequestRecord[];
}

interface RawMetadata {
  conversation_id?: string;
  root_correlation_id?: string;
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

/** Pull a numeric metric out of the `{value, unit}` envelope (or a bare number). */
function readNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return undefined;
}

/**
 * AIPerf may sample the same source conversation into several concurrently
 * executing trajectory lanes. `conversation_id` intentionally stays the
 * source id, while the root correlation id identifies one replay of it across
 * every turn (and across warmup/profiling). Prefer the explicit root field and
 * retain the older x-correlation spelling as a compatibility fallback.
 */
function replayKey(meta: RawMetadata): string | undefined {
  const key = meta.root_correlation_id ?? meta.x_correlation_id;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

/**
 * Yield complete UTF-8 lines without retaining the decompressed profile.
 * `Readable.from([blob])` is intentional: without the array wrapper Node may
 * iterate the Buffer byte-by-byte instead of passing it as one chunk.
 */
async function* gunzipLines(blob: Buffer): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let carry = '';

  for await (const chunk of Readable.from([blob]).pipe(createGunzip())) {
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
}

function parseRawRecord(line: string): RawRecord | null {
  if (!line) return null;
  try {
    return JSON.parse(line) as RawRecord;
  } catch {
    return null;
  }
}

/**
 * Parse the gzipped `profile_export.jsonl` blob into a chart-ready
 * timeline. Returns null on a missing or malformed blob.
 */
export async function computeRequestTimeline(blob: Buffer | null): Promise<RequestTimeline | null> {
  if (!blob) return null;

  // First pass: find the timeline bounds and the first dispatch for each
  // replay. This deliberately stores only one entry per replay, not one entry
  // per request, so a 400+ MB decompressed profile stays memory-bounded.
  let originNs = Number.POSITIVE_INFINITY;
  let endNs = 0;
  let recordCount = 0;
  const replayFirstStart = new Map<string, number>();

  try {
    for await (const line of gunzipLines(blob)) {
      const rec = parseRawRecord(line);
      if (!rec) continue;
      const meta = rec.metadata ?? {};
      // Use credit_issued_ns when available (the true start of the request's
      // lifecycle), falling back to request_start_ns. Skip rows missing both.
      const cStart = meta.credit_issued_ns ?? meta.request_start_ns;
      const cEnd = meta.request_end_ns;
      if (typeof cStart !== 'number' || typeof cEnd !== 'number') continue;

      recordCount += 1;
      if (cStart < originNs) originNs = cStart;
      if (cEnd > endNs) endNs = cEnd;

      const key = replayKey(meta);
      if (key === undefined) continue;
      const current = replayFirstStart.get(key);
      if (current === undefined || cStart < current) replayFirstStart.set(key, cStart);
    }
  } catch {
    return null;
  }

  if (recordCount === 0) return null;
  if (!Number.isFinite(originNs)) originNs = 0;

  // Assign compact deterministic replay ids. UUIDs would add substantial
  // repeated payload to large timelines, so rank distinct correlation ids by
  // their first dispatch and send only the numeric rank to the frontend.
  const replayIndex = new Map<string, number>();
  [...replayFirstStart.entries()]
    .sort(
      ([aKey, aStart], [bKey, bStart]) =>
        aStart - bStart || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0),
    )
    .forEach(([key], index) => replayIndex.set(key, index));

  // Second gzip pass: build only the final compact request objects. Re-reading
  // costs some CPU but avoids simultaneously retaining the decompressed text,
  // parsed source records, and output records — the previous peak-memory
  // multiplier that made high-throughput backfills fail.
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
        ri: replayIndex.get(replayKey(m) ?? ''),
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

  // Stable order so backfill output is deterministic.
  requests.sort((a, b) => a.start - b.start);

  return {
    version: REQUEST_TIMELINE_VERSION,
    startNs: originNs,
    endNs,
    durationS: endNs > originNs ? (endNs - originNs) / 1e9 : 0,
    requests,
  };
}

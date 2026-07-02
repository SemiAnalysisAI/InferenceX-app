/**
 * Pre-compute the per-request timeline for the agentic detail page's
 * Gantt view. Output lands in `agentic_trace_replay.request_timeline`
 * and is read directly by the timeline API route.
 *
 * Shape is a thin array — ~150 bytes per request × ~200 requests per
 * point ≈ 30 KB per row before JSONB compression. Trivial vs the raw
 * gzipped JSONL blob (~1-3 MB).
 *
 * Versioned so the backfill script knows which rows are stale — bump
 * `REQUEST_TIMELINE_VERSION` whenever the extraction algorithm changes.
 */

import { gunzipSync } from 'node:zlib';

/** Bump when the extraction algorithm changes — backfill recomputes anything older. */
export const REQUEST_TIMELINE_VERSION = 5;

export interface RequestRecord {
  /** Conversation id (groups turns of one agent session). */
  cid: string;
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
 * Parse the gzipped `profile_export.jsonl` blob into a chart-ready
 * timeline. Returns null on a missing or malformed blob.
 */
export function computeRequestTimeline(blob: Buffer | null): RequestTimeline | null {
  if (!blob) return null;
  let text: string;
  try {
    text = gunzipSync(blob).toString('utf8');
  } catch {
    return null;
  }

  // First pass: parse + collect raw turns; find timeline origin.
  const raw: {
    meta: RawMetadata;
    ttftMs: number | null;
    tpotMs: number | null;
    isl: number | null;
    osl: number | null;
  }[] = [];
  let originNs = Number.POSITIVE_INFINITY;
  let endNs = 0;

  for (const line of text.split('\n')) {
    if (!line) continue;
    let rec: RawRecord;
    try {
      rec = JSON.parse(line) as RawRecord;
    } catch {
      continue;
    }
    const meta = rec.metadata ?? {};
    // Use credit_issued_ns when available (the true start of the request's
    // lifecycle), falling back to request_start_ns. Skip rows missing both.
    const cStart = meta.credit_issued_ns ?? meta.request_start_ns;
    const cEnd = meta.request_end_ns;
    if (typeof cStart !== 'number' || typeof cEnd !== 'number') continue;

    if (cStart < originNs) originNs = cStart;
    if (cEnd > endNs) endNs = cEnd;

    raw.push({
      meta,
      ttftMs: readNum(rec.metrics?.time_to_first_token) ?? null,
      tpotMs:
        readNum(rec.metrics?.time_per_output_token) ??
        readNum(rec.metrics?.inter_token_latency) ??
        null,
      isl: readNum(rec.metrics?.input_sequence_length) ?? null,
      osl: readNum(rec.metrics?.output_sequence_length) ?? null,
    });
  }

  if (raw.length === 0) return null;
  if (!Number.isFinite(originNs)) originNs = 0;

  // Second pass: shift timestamps to be relative to originNs (smaller
  // numbers fit in JSON nicely and the frontend doesn't need bigint math).
  const requests: RequestRecord[] = [];
  for (const r of raw) {
    const m = r.meta;
    const credit = (m.credit_issued_ns ?? m.request_start_ns ?? originNs) - originNs;
    const start = (m.request_start_ns ?? m.credit_issued_ns ?? originNs) - originNs;
    const ack = typeof m.request_ack_ns === 'number' ? m.request_ack_ns - originNs : null;
    const end = (m.request_end_ns ?? originNs) - originNs;
    requests.push({
      cid: m.conversation_id ?? 'unknown',
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
      ttftMs: r.ttftMs,
      tpotMs: r.tpotMs,
      isl: r.isl,
      osl: r.osl,
      cancelled: m.was_cancelled === true,
    });
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

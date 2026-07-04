/**
 * Warmup vs profiling phase slicing for the agentic per-point detail page.
 *
 * Agentic trace-replay runs have two phases: a warmup (cache-warming) pass, then
 * the measured profiling window. The server-metric time-series (`chart_series`)
 * spans the whole run with no per-point phase label, but the per-request
 * `request_timeline` IS phase-tagged. We derive the warmup→profiling boundary
 * from the timeline and slice the server series at it.
 *
 * ⚠️ ORIGIN-GAP INVARIANT: the two payloads share the aiperf clock but have
 * DIFFERENT zero origins — `serverMetrics.startNs` is the first server scrape,
 * `timeline.startNs` is the first request's credit (observed ~124 s apart in
 * real runs). The boundary must therefore be rebased through absolute ns by
 * subtracting `serverMetrics.startNs`; a same-axis offset comparison would be
 * off by the origin gap. This rebasing lives in `phaseBoundarySec` only.
 */

import type { RequestRecord, RequestTimeline } from '@/hooks/api/use-request-timeline';
import type {
  QueueDepthPoint,
  TimeSeriesPoint,
  TraceServerMetrics,
} from '@/hooks/api/use-trace-server-metrics';

export type StagePhase = 'warmup' | 'profiling';

/**
 * The subset of server-metric series the per-point charts render. Both the
 * top-level `TraceServerMetrics` and a per-source object (after the detail page
 * remaps `promptTps`→`prefillTps`, `generationTps`→`decodeTps`) are assignable.
 */
export interface ServerSeriesLike {
  kvCacheUsage: TimeSeriesPoint[];
  prefixCacheHitRate: TimeSeriesPoint[];
  queueDepth: QueueDepthPoint[];
  promptTokensBySource: Record<string, TimeSeriesPoint[]>;
  prefillTps: TimeSeriesPoint[];
  decodeTps: TimeSeriesPoint[];
  prefixCacheHitsTps: TimeSeriesPoint[];
  hostKvCacheUsage: TimeSeriesPoint[];
  kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[];
}

/** True when the timeline contains at least one non-profiling (warmup) request. */
export function timelineHasWarmup(timeline: RequestTimeline | null | undefined): boolean {
  return Boolean(timeline?.requests.some((r) => r.phase !== 'profiling'));
}

/**
 * Absolute-ns wall-clock instant where the profiling phase begins
 * = `timeline.startNs + earliest profiling request's start offset`.
 * Returns null unless BOTH a warmup and a profiling request exist (nothing to
 * split otherwise).
 */
export function phaseBoundaryNs(timeline: RequestTimeline | null | undefined): number | null {
  if (!timeline) return null;
  let hasWarmup = false;
  let minProfilingStart: number | null = null;
  for (const r of timeline.requests) {
    if (r.phase === 'profiling') {
      if (minProfilingStart === null || r.start < minProfilingStart) minProfilingStart = r.start;
    } else {
      hasWarmup = true;
    }
  }
  if (!hasWarmup || minProfilingStart === null) return null;
  return timeline.startNs + minProfilingStart;
}

/**
 * The profiling-start boundary expressed on the SERVER-METRIC chart's own t-axis
 * (seconds from `serverMetrics.startNs`). See the origin-gap invariant at the top
 * of the file — the `- serverMetrics.startNs` subtraction is mandatory.
 *
 * Returns null when there's no warmup/profiling split, or `serverMetrics` is
 * absent (→ callers fall back to the full-run series).
 */
export function phaseBoundarySec(
  serverMetrics: Pick<TraceServerMetrics, 'startNs'> | null | undefined,
  timeline: RequestTimeline | null | undefined,
): number | null {
  if (!serverMetrics) return null;
  const boundaryNs = phaseBoundaryNs(timeline);
  if (boundaryNs === null) return null;
  return Math.max(0, (boundaryNs - serverMetrics.startNs) / 1e9);
}

export interface PhaseSlicedSeries<S> {
  series: S;
  durationS: number;
}

/**
 * Slice every server-metric series to one phase:
 *  - warmup:    keep points with `t < boundary`, no rebase, `durationS = boundary`
 *  - profiling: keep points with `t >= boundary`, rebased so `t` starts at 0,
 *               `durationS = full - boundary`
 *
 * A point exactly at `t === boundary` belongs to profiling. Null boundary
 * (single-phase point, or no server metrics) → identity passthrough with the
 * full `durationS`. Pure — returns new objects, never mutates the input.
 *
 * NOTE: rebasing the profiling slice to start at 0 makes the cumulative charts
 * (prompt-token source, unique-input-tokens) read as "since profiling start"
 * rather than "since run start" — intended.
 */
export function sliceServerSeriesByPhase<S extends ServerSeriesLike>(
  series: S,
  phase: StagePhase,
  boundarySec: number | null,
  fullDurationS: number,
): PhaseSlicedSeries<S> {
  if (boundarySec === null) return { series, durationS: fullDurationS };
  const b = boundarySec;
  const keep = phase === 'warmup' ? (t: number) => t < b : (t: number) => t >= b;
  const rebase = phase === 'profiling' ? (t: number) => t - b : (t: number) => t;

  const sliceTs = (pts: TimeSeriesPoint[]): TimeSeriesPoint[] =>
    pts.filter((p) => keep(p.t)).map((p) => ({ ...p, t: rebase(p.t) }));
  const sliceQd = (pts: QueueDepthPoint[]): QueueDepthPoint[] =>
    pts.filter((p) => keep(p.t)).map((p) => ({ ...p, t: rebase(p.t) }));
  const sliceRecord = (
    rec: Record<string, TimeSeriesPoint[]>,
  ): Record<string, TimeSeriesPoint[]> => {
    const out: Record<string, TimeSeriesPoint[]> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = sliceTs(v);
    return out;
  };

  const slicedFields: ServerSeriesLike = {
    kvCacheUsage: sliceTs(series.kvCacheUsage),
    prefixCacheHitRate: sliceTs(series.prefixCacheHitRate),
    queueDepth: sliceQd(series.queueDepth),
    promptTokensBySource: sliceRecord(series.promptTokensBySource),
    prefillTps: sliceTs(series.prefillTps),
    decodeTps: sliceTs(series.decodeTps),
    prefixCacheHitsTps: sliceTs(series.prefixCacheHitsTps),
    hostKvCacheUsage: sliceTs(series.hostKvCacheUsage),
    kvCacheUsageByEngine: series.kvCacheUsageByEngine.map((e) => ({
      engineLabel: e.engineLabel,
      points: sliceTs(e.points),
    })),
  };

  const durationS = phase === 'warmup' ? b : Math.max(1, fullDurationS - b);
  return { series: { ...series, ...slicedFields } as S, durationS };
}

/** Filter request-timeline records to one phase (warmup = anything not profiling). */
export function requestsForPhase(requests: RequestRecord[], phase: StagePhase): RequestRecord[] {
  return phase === 'warmup'
    ? requests.filter((r) => r.phase !== 'profiling')
    : requests.filter((r) => r.phase === 'profiling');
}

/**
 * Scope a whole request timeline to one phase: keep only that phase's requests
 * and, for profiling, rebase every ns offset (and `startNs`) so the phase starts
 * at t=0 — mirroring `sliceServerSeriesByPhase` so the request-derived charts and
 * the server charts share a 0-based axis for the same phase. `durationS` becomes
 * the phase window. Returns the input unchanged when there's no warmup/profiling
 * split (single-phase point). Pure — new object, original untouched.
 *
 * The boundary here is on the REQUEST clock (offset from `timeline.startNs`), so
 * we use `phaseBoundaryNs` minus `timeline.startNs` rather than the server-axis
 * `phaseBoundarySec` (different origin — see the file header).
 */
export function sliceTimelineByPhase(
  timeline: RequestTimeline,
  phase: StagePhase,
): RequestTimeline {
  const boundaryNs = phaseBoundaryNs(timeline);
  if (boundaryNs === null) return timeline;
  const boundaryOff = boundaryNs - timeline.startNs; // ns offset on the request clock
  const inPhase = (r: RequestRecord) =>
    phase === 'warmup' ? r.start < boundaryOff : r.start >= boundaryOff;
  const shift = phase === 'profiling' ? boundaryOff : 0;
  const requests = timeline.requests.filter(inPhase).map((r) => ({
    ...r,
    credit: r.credit - shift,
    start: r.start - shift,
    ack: r.ack === null ? null : r.ack - shift,
    end: r.end - shift,
  }));
  const durationS =
    phase === 'warmup' ? boundaryOff / 1e9 : Math.max(1, timeline.durationS - boundaryOff / 1e9);
  return { ...timeline, startNs: timeline.startNs + shift, requests, durationS };
}

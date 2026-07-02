/**
 * Pure data-shaping helpers behind the agentic point-detail time-series
 * charts: rolling/cumulative aggregations over `TimeSeriesPoint[]` server
 * scrapes and per-request timeline records. No React, no SVG — everything
 * here is unit-testable in isolation (see time-series-math.test.ts).
 */

import type { RequestRecord } from '@/hooks/api/use-request-timeline';
import type { TimeSeriesPoint } from '@/hooks/api/use-trace-server-metrics';

/** One drawable line in a TimeSeriesChart. */
export interface ChartSeries {
  name: string;
  /** The line to draw (caller pre-smooths if desired). */
  data: TimeSeriesPoint[];
  /** Optional raw per-scrape values; rendered as low-opacity scatter behind the line. */
  rawData?: TimeSeriesPoint[];
  color: string;
  /** Override default stroke width (1.8). Use higher values for emphasis lines. */
  strokeWidth?: number;
  /** Stroke opacity (0..1). Use < 1 for background/underlay lines. */
  strokeOpacity?: number;
  /** Hide from the hover legend (e.g. per-engine underlay lines that
   *  would clutter the tooltip). The path still renders. */
  hideFromHover?: boolean;
}

export type RequestMetric = 'interactivity' | 'ttft' | 'e2e';
export type RequestPercentile = 'p75' | 'p90';
export type ThroughputSeriesKey = 'input' | 'decode';

/** Toggle one throughput series while preserving the at-least-one invariant. */
export function toggleThroughputSeries(
  selected: ReadonlySet<ThroughputSeriesKey>,
  key: ThroughputSeriesKey,
): ReadonlySet<ThroughputSeriesKey> {
  if (selected.has(key) && selected.size === 1) return selected;
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Linear-interpolated percentile (matches numpy's default method). */
export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (pos - lo);
}

/** Linear-interpolated value at time `t` from a time-sorted series. */
export function interpAt(data: TimeSeriesPoint[], t: number): number | null {
  if (data.length === 0) return null;
  if (t <= data[0]!.t) return data[0]!.value;
  if (t >= data.at(-1)!.t) return data.at(-1)!.value;
  // Binary search
  let lo = 0;
  let hi = data.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (data[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = data[lo]!;
  const b = data[hi]!;
  if (b.t === a.t) return a.value;
  const frac = (t - a.t) / (b.t - a.t);
  return a.value + (b.value - a.value) * frac;
}

/**
 * Build raw request samples plus a trailing request-count percentile. E2E
 * latency is measured from HTTP request start through final response byte.
 *
 * The percentile is computed in latency space. Interactivity then inverts
 * the selected TPOT percentile, matching the aggregate chart convention:
 * P90 interactivity = 1 / P90 TPOT (a conservative tail-latency view).
 */
export function rollingRequestMetric(
  requests: readonly RequestRecord[],
  metric: RequestMetric,
  percentile: RequestPercentile,
  windowSize = 50,
): { raw: TimeSeriesPoint[]; trend: TimeSeriesPoint[]; cumulative: TimeSeriesPoint[] } {
  const q = percentile === 'p75' ? 0.75 : 0.9;
  // Phase is the caller's concern — the agentic detail page passes a
  // phase-scoped (warmup or profiling) timeline. Here we only drop cancelled
  // requests and samples without a usable latency value.
  const samples = requests
    .filter((request) => !request.cancelled)
    .flatMap((request) => {
      const latencyMs =
        metric === 'ttft'
          ? request.ttftMs
          : metric === 'e2e'
            ? (request.end - request.start) / 1e6
            : request.tpotMs;
      if (latencyMs === null || !Number.isFinite(latencyMs) || latencyMs <= 0) return [];
      return [{ t: request.end / 1e9, latencyMs }];
    })
    .toSorted((a, b) => a.t - b.t);

  const raw = samples.map(({ t, latencyMs }) => ({
    t,
    value: metric === 'interactivity' ? 1000 / latencyMs : latencyMs / 1000,
  }));
  const trend = samples.map(({ t }, i) => {
    const start = Math.max(0, i - Math.max(1, windowSize) + 1);
    const sorted = samples
      .slice(start, i + 1)
      .map((sample) => sample.latencyMs)
      .toSorted((a, b) => a - b);
    const latencyMs = quantile(sorted, q);
    return { t, value: metric === 'interactivity' ? 1000 / latencyMs : latencyMs / 1000 };
  });
  const prefixLatencies: number[] = [];
  const cumulative = samples.map(({ t, latencyMs }) => {
    let lo = 0;
    let hi = prefixLatencies.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefixLatencies[mid]! <= latencyMs) lo = mid + 1;
      else hi = mid;
    }
    prefixLatencies.splice(lo, 0, latencyMs);
    const cumulativeLatencyMs = quantile(prefixLatencies, q);
    return {
      t,
      value: metric === 'interactivity' ? 1000 / cumulativeLatencyMs : cumulativeLatencyMs / 1000,
    };
  });

  return { raw, trend, cumulative };
}

/**
 * Time-weighted rolling average over a `windowS`-second trailing window.
 * Treats the input as a step function (value held constant between
 * samples) and integrates over the trailing window, dividing by the
 * window length. Good for smoothing irregularly-sampled event series
 * (e.g. request start/end events) where the regular sample-count
 * `rollingAverage` would over-weight bursts of close-together events.
 */
export function timeRollingAverage(data: TimeSeriesPoint[], windowS: number): TimeSeriesPoint[] {
  if (data.length === 0 || windowS <= 0) return data;
  const out: TimeSeriesPoint[] = Array.from({ length: data.length });
  for (let i = 0; i < data.length; i++) {
    const tEnd = data[i]!.t;
    const tStart = Math.max(0, tEnd - windowS);
    // Find the first sample j whose t is >= tStart; the step value at
    // tStart is data[j-1].value if j > 0, else data[0].value.
    let j = 0;
    while (j < data.length && data[j]!.t < tStart) j++;
    let prevT = tStart;
    let prevV = j > 0 ? data[j - 1]!.value : data[0]!.value;
    let area = 0;
    for (; j <= i; j++) {
      const curT = data[j]!.t;
      area += prevV * (curT - prevT);
      prevT = curT;
      prevV = data[j]!.value;
    }
    const dur = tEnd - tStart;
    out[i] = { t: tEnd, value: dur > 0 ? area / dur : data[i]!.value };
  }
  return out;
}

/** Centered rolling average over `windowSize` samples. */
export function rollingAverage(data: TimeSeriesPoint[], windowSize: number): TimeSeriesPoint[] {
  if (data.length === 0 || windowSize <= 1) return data;
  const half = Math.floor(windowSize / 2);
  const out: TimeSeriesPoint[] = Array.from({ length: data.length });
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      sum += data[j]!.value;
      n++;
    }
    out[i] = { t: data[i]!.t, value: n > 0 ? sum / n : 0 };
  }
  return out;
}

/**
 * Expanding-window cumulative mean from index 0..i.
 *
 * `burnInS` suppresses rendering during the unstable startup interval while
 * retaining those samples in every later average. This avoids visually
 * promoting a single bursty counter bucket without changing the run-to-date
 * meaning of the line once it appears.
 */
export function cumulativeAverage(data: TimeSeriesPoint[], burnInS = 0): TimeSeriesPoint[] {
  if (data.length === 0) return data;
  const out: TimeSeriesPoint[] = [];
  const firstT = data[0]!.t;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i]!.value;
    if (data[i]!.t - firstT >= burnInS) {
      out.push({ t: data[i]!.t, value: sum / (i + 1) });
    }
  }
  return out;
}

/**
 * Run-to-date time-weighted average of a step series.
 *
 * Duplicate timestamps are coalesced to their final value before integration;
 * this is important for request handoffs where several start/end events occur
 * at the same instant. Each value is held until the next timestamp.
 */
export function cumulativeTimeAverage(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (data.length === 0) return [];
  const points: TimeSeriesPoint[] = [];
  for (const point of data.toSorted((a, b) => a.t - b.t)) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.value)) continue;
    const previous = points.at(-1);
    if (previous?.t === point.t) previous.value = point.value;
    else points.push({ ...point });
  }
  if (points.length === 0) return [];

  const firstT = points[0]!.t;
  let previousT = firstT;
  let previousValue = points[0]!.value;
  let area = 0;
  return points.map((point, index) => {
    if (index === 0) return { t: point.t, value: point.value };
    area += previousValue * (point.t - previousT);
    const duration = point.t - firstT;
    previousT = point.t;
    previousValue = point.value;
    return { t: point.t, value: duration > 0 ? area / duration : point.value };
  });
}

/**
 * Cumulative count of successfully completed (non-cancelled) requests by end
 * time. Phase is the caller's concern — pass a phase-scoped timeline.
 */
export function cumulativeCompletedRequests(requests: readonly RequestRecord[]): TimeSeriesPoint[] {
  const completionTimes = requests
    .filter((request) => !request.cancelled)
    .map((request) => request.end / 1e9)
    .filter(Number.isFinite)
    .toSorted((a, b) => a - b);
  if (completionTimes.length === 0) return [];
  return [{ t: 0, value: 0 }, ...completionTimes.map((t, index) => ({ t, value: index + 1 }))];
}

/**
 * Retrospective average sequence length among requests active at each event.
 * OSL uses the request's final observed length across its whole lifetime.
 */
export function averageSequenceLengthInFlight(
  requests: readonly RequestRecord[],
  metric: 'isl' | 'osl',
): TimeSeriesPoint[] {
  const events = new Map<number, { tokenDelta: number; countDelta: number }>();
  const addEvent = (t: number, tokenDelta: number, countDelta: number) => {
    const current = events.get(t) ?? { tokenDelta: 0, countDelta: 0 };
    current.tokenDelta += tokenDelta;
    current.countDelta += countDelta;
    events.set(t, current);
  };

  // Phase is the caller's concern — pass a phase-scoped timeline.
  for (const request of requests) {
    const tokens = request[metric];
    if (
      request.cancelled ||
      tokens === null ||
      !Number.isFinite(tokens) ||
      tokens < 0 ||
      request.end < request.start
    ) {
      continue;
    }
    addEvent(request.start / 1e9, tokens, 1);
    addEvent(request.end / 1e9, -tokens, -1);
  }

  let tokensInFlight = 0;
  let requestsInFlight = 0;
  return [...events.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([t, event]) => {
      tokensInFlight += event.tokenDelta;
      requestsInFlight += event.countDelta;
      return { t, value: requestsInFlight > 0 ? tokensInFlight / requestsInFlight : 0 };
    });
}

// A promptTokensBySource bucket label denotes tokens served from some cache
// tier (local prefix cache, offloaded/host KV, remote KV transfer) rather than
// freshly computed. Matches vllm labels (`local_cache_hit`,
// `external_kv_transfer`) and the sglang labels the chart-series builder emits
// (`cache hit (HBM)`, `cache hit (CPU offload)`, `cache hit`).
const CACHE_SOURCE_RE = /cache|hit|transfer|reuse/iu;

/**
 * Cumulative "unique" (freshly prefill-computed) input tokens from the
 * promptTokensBySource breakdown: total prompt tokens minus everything served
 * from a cache tier. The breakdown's buckets sum to the real prompt-token
 * total per scrape, so this is internally consistent and naturally monotonic.
 *
 * Preferred over `cumulativeDifferenceMonotonic(prefillTps, prefixCacheHitsTps)`
 * because `vllm:prefix_cache_hits` re-counts tokens across chunked-prefill /
 * preemption scheduler passes — its cumulative routinely exceeds the prompt
 * tokens ever received, which drove the difference deeply negative and froze
 * the monotonic-clamped curve at whatever it reached in the first few seconds.
 *
 * Any bucket whose label isn't recognizably a cache tier counts as computed
 * (the safe direction for "unique"): a new fresh-compute label over-reports
 * unique slightly rather than silently freezing the line. Returns [] when no
 * breakdown is available so the caller can fall back.
 */
export function cumulativeUniqueInputTokens(
  promptTokensBySource: Record<string, TimeSeriesPoint[]> | undefined,
): TimeSeriesPoint[] {
  if (!promptTokensBySource) return [];
  const computedByT = new Map<number, number>();
  let sawComputed = false;
  for (const [source, series] of Object.entries(promptTokensBySource)) {
    if (CACHE_SOURCE_RE.test(source)) continue;
    sawComputed = true;
    for (const p of series) computedByT.set(p.t, (computedByT.get(p.t) ?? 0) + p.value);
  }
  if (!sawComputed) return [];
  const out: TimeSeriesPoint[] = [];
  let sum = 0;
  for (const t of [...computedByT.keys()].toSorted((x, y) => x - y)) {
    sum += computedByT.get(t)!;
    out.push({ t, value: sum });
  }
  return out;
}

/**
 * Per-event step series: at each request start/end, sum the ISLs of
 * currently-active requests across distinct `cid`s. Within a single
 * `cid` aiperf dispatches turns sequentially (turn N+1 waits for N),
 * so each cid contributes at most one in-flight ISL at a time. Across
 * different cids we assume content is independent (parent ↔ subagent
 * and conv ↔ conv share negligible prefix in practice — cross-conv
 * dedup added ~0.25 pp to theoretical hit rate, so treating them as
 * independent is a tight approximation of the true in-flight unique
 * token count).
 *
 * Output is a step function: one point per event, value held constant
 * until the next event. Time axis is seconds relative to the earliest
 * event in `requests`.
 */
export function inflightUniqueTokens(
  requests: readonly { cid: string; start: number; end: number; isl: number | null }[],
): TimeSeriesPoint[] {
  if (requests.length === 0) return [];
  // The request_timeline timestamps are ns-relative to its own origin.
  // Convert events to seconds and emit a step series.
  interface Event {
    tNs: number;
    kind: 'start' | 'end';
    cid: string;
    isl: number;
  }
  const events: Event[] = [];
  for (const r of requests) {
    const isl = r.isl ?? 0;
    if (isl <= 0) continue;
    events.push(
      { tNs: r.start, kind: 'start', cid: r.cid, isl },
      { tNs: r.end, kind: 'end', cid: r.cid, isl },
    );
  }
  if (events.length === 0) return [];
  // Sort by time; on ties, process 'end' before 'start' so a same-instant
  // turn handoff within one cid doesn't transiently double-count.
  events.sort((a, b) => a.tNs - b.tNs || (a.kind === 'end' ? -1 : 1));

  // Active ISL per cid (max in case the same cid somehow has overlapping
  // events; in practice it's always 0 or 1 request at a time per cid).
  const activeByCid = new Map<string, number>();
  let total = 0;
  const out: TimeSeriesPoint[] = [{ t: 0, value: 0 }];
  for (const e of events) {
    const tSec = e.tNs / 1e9;
    if (e.kind === 'start') {
      const prev = activeByCid.get(e.cid) ?? 0;
      const next = Math.max(prev, e.isl);
      activeByCid.set(e.cid, next);
      total += next - prev;
    } else {
      const cur = activeByCid.get(e.cid) ?? 0;
      if (cur > 0) {
        total -= cur;
        activeByCid.delete(e.cid);
      }
    }
    out.push({ t: tSec, value: Math.max(0, total) });
  }
  return out;
}

/**
 * Monotonic-non-decreasing cumulative difference of two rate series:
 * for each unique timestamp, compute Σa[0..t] − Σb[0..t], then enforce
 * a running max so the curve never dips below its prior value.
 *
 * Use this to plot things like "cumulative cache-missed tokens" where the
 * true value can only ever grow, but the underlying per-tick rates can
 * temporarily look negative due to counter timing skew between scrapes
 * (vllm's `prefix_cache_hits` and `prompt_tokens` counters can lag each
 * other by ~5-10 s in our data even though their lifetime totals agree).
 *
 * `a` and `b` may have different (or overlapping) timestamp sets — both
 * are unioned and walked in time order. Output has one point per unique
 * timestamp present in either input.
 */
export function cumulativeDifferenceMonotonic(
  a: TimeSeriesPoint[],
  b: TimeSeriesPoint[],
): TimeSeriesPoint[] {
  const aByT = new Map(a.map((p) => [p.t, p.value]));
  const bByT = new Map(b.map((p) => [p.t, p.value]));
  const allT = [...new Set([...aByT.keys(), ...bByT.keys()])].toSorted((x, y) => x - y);
  const out: TimeSeriesPoint[] = Array.from({ length: allT.length });
  let cumA = 0;
  let cumB = 0;
  let runningMax = 0;
  for (let i = 0; i < allT.length; i++) {
    const t = allT[i]!;
    cumA += aByT.get(t) ?? 0;
    cumB += bByT.get(t) ?? 0;
    const diff = cumA - cumB;
    if (diff > runningMax) runningMax = diff;
    out[i] = { t, value: runningMax };
  }
  return out;
}

/** Pointwise sum of two arrays sharing the same t index. */
function sumSeries(a: TimeSeriesPoint[], b: TimeSeriesPoint[]): TimeSeriesPoint[] {
  const n = Math.min(a.length, b.length);
  const out: TimeSeriesPoint[] = Array.from({ length: n });
  for (let i = 0; i < n; i++) {
    out[i] = { t: a[i]!.t, value: a[i]!.value + b[i]!.value };
  }
  return out;
}

/** Build throughput lines from the currently visible input/decode signals. */
export function buildThroughputChartSeries(
  input: TimeSeriesPoint[],
  decode: TimeSeriesPoint[],
  selected: ReadonlySet<ThroughputSeriesKey>,
): ChartSeries[] {
  const series: ChartSeries[] = [];
  if (selected.has('input')) {
    series.push({
      name: 'Input (avg n=50)',
      data: rollingAverage(input, 50),
      color: '#3b82f6',
      strokeWidth: 1.6,
    });
  }
  if (selected.has('decode')) {
    series.push({
      name: 'Decode (avg n=50)',
      data: rollingAverage(decode, 50),
      color: '#f97316',
      strokeWidth: 1.6,
    });
  }
  if (selected.size === 2) {
    series.push({
      name: 'Total running avg (60s burn-in)',
      data: cumulativeAverage(sumSeries(input, decode), 60),
      color: '#ef4444',
      strokeWidth: 3,
    });
  }
  return series;
}

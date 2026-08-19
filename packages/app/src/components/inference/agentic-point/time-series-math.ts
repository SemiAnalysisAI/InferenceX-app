/**
 * Pure data-shaping helpers behind the agentic point-detail time-series
 * charts: rolling/cumulative aggregations over `TimeSeriesPoint[]` server
 * scrapes and per-request timeline records. No React, no SVG — everything
 * here is unit-testable in isolation (see time-series-math.test.ts).
 */

import type { RequestChartRecord } from '@/hooks/api/use-request-chart-data';
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

/**
 * Find the largest plotted value without spreading the full dataset into a
 * variadic call. Agentic runs can contain tens of thousands of request samples,
 * which exceeds browser argument limits when passed to `Math.max(...values)`.
 */
export function maxTimeSeriesValue(
  series: readonly ChartSeries[],
  initialValue = Number.NEGATIVE_INFINITY,
): number {
  let maximum = initialValue;
  for (const chartSeries of series) {
    for (const point of chartSeries.data) maximum = Math.max(maximum, point.value);
  }
  return maximum;
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
  requests: readonly RequestChartRecord[],
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

  // Exact expanding percentiles without inserting into a growing sorted array
  // (which is O(n²) from repeated `splice` shifts on six-figure request sets).
  // Coordinate-compress all observed values, then track prefix counts in a
  // Fenwick tree so insertion and kth-value lookup are both O(log n).
  const latencyValues = [...new Set(samples.map(({ latencyMs }) => latencyMs))].toSorted(
    (a, b) => a - b,
  );
  const latencyIndex = new Map(latencyValues.map((value, index) => [value, index + 1]));
  const counts = new Uint32Array(latencyValues.length + 1);
  const addLatency = (index: number) => {
    for (let cursor = index; cursor < counts.length; cursor += cursor & -cursor) {
      counts[cursor]! += 1;
    }
  };
  const kthLatency = (zeroBasedRank: number): number => {
    let index = 0;
    let target = zeroBasedRank + 1;
    let step = 1;
    while (step * 2 < counts.length) step *= 2;
    for (; step > 0; step >>= 1) {
      const next = index + step;
      if (next < counts.length && counts[next]! < target) {
        index = next;
        target -= counts[next]!;
      }
    }
    return latencyValues[index]!;
  };
  const cumulative = samples.map(({ t, latencyMs }, index) => {
    addLatency(latencyIndex.get(latencyMs)!);
    const count = index + 1;
    const position = (count - 1) * q;
    const lowRank = Math.floor(position);
    const highRank = Math.ceil(position);
    const low = kthLatency(lowRank);
    const high = kthLatency(highRank);
    const cumulativeLatencyMs = low + (high - low) * (position - lowRank);
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
  // Prefix integral of the input step function. `areaAt[i]` is the integral
  // from t=0 through data[i].t, with the first value extended back to zero.
  // A moving left cursor then evaluates every trailing window in O(n) total.
  const areaAt = new Float64Array(data.length);
  areaAt[0] = data[0]!.value * data[0]!.t;
  for (let index = 1; index < data.length; index += 1) {
    const previous = data[index - 1]!;
    const current = data[index]!;
    areaAt[index] = areaAt[index - 1]! + previous.value * (current.t - previous.t);
  }
  const out: TimeSeriesPoint[] = Array.from({ length: data.length });
  let left = 0;
  for (let i = 0; i < data.length; i++) {
    const tEnd = data[i]!.t;
    const tStart = Math.max(0, tEnd - windowS);
    while (left + 1 <= i && data[left + 1]!.t <= tStart) left += 1;
    const areaAtStart =
      tStart <= data[0]!.t
        ? data[0]!.value * tStart
        : areaAt[left]! + data[left]!.value * (tStart - data[left]!.t);
    const area = areaAt[i]! - areaAtStart;
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
 * Centered, volume-weighted ratio over matching rate series.
 *
 * Counter families that describe one logical fraction can publish their
 * deltas in adjacent scrape buckets. Averaging the pointwise ratios gives a
 * tiny-denominator bucket the same weight as a million-token bucket and can
 * therefore produce impossible percentages. Sum the rates over the window
 * first, then divide. The semantic upper bound is applied only after that
 * aggregation as a guard against residual counter timing skew.
 *
 * The denominator owns the timeline. Missing numerator samples contribute
 * zero, which is the correct interpretation for a no-hit interval.
 */
export function rollingRatioOfSums(
  numerator: TimeSeriesPoint[],
  denominator: TimeSeriesPoint[],
  windowSize: number,
  upperBound = 1,
): TimeSeriesPoint[] {
  if (denominator.length === 0 || windowSize <= 0) return [];

  const numeratorByT = new Map<number, number>();
  for (const point of numerator) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.value)) continue;
    numeratorByT.set(point.t, (numeratorByT.get(point.t) ?? 0) + Math.max(0, point.value));
  }

  // The ETL emits sorted canonical-grid series. Coalesce defensively so a
  // duplicate denominator timestamp cannot receive the numerator twice.
  const rows: { t: number; numerator: number; denominator: number }[] = [];
  for (const point of denominator) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.value)) continue;
    const previous = rows.at(-1);
    if (previous?.t === point.t) {
      previous.denominator += Math.max(0, point.value);
      continue;
    }
    rows.push({
      t: point.t,
      numerator: numeratorByT.get(point.t) ?? 0,
      denominator: Math.max(0, point.value),
    });
  }
  if (rows.length === 0) return [];

  const numeratorPrefix = new Float64Array(rows.length + 1);
  const denominatorPrefix = new Float64Array(rows.length + 1);
  for (let i = 0; i < rows.length; i++) {
    numeratorPrefix[i + 1] = numeratorPrefix[i]! + rows[i]!.numerator;
    denominatorPrefix[i + 1] = denominatorPrefix[i]! + rows[i]!.denominator;
  }

  const leftSpan = Math.floor((windowSize - 1) / 2);
  const rightSpan = windowSize - leftSpan - 1;
  const boundedUpper = Number.isFinite(upperBound) ? Math.max(0, upperBound) : Infinity;
  const out: TimeSeriesPoint[] = [];
  for (let i = 0; i < rows.length; i++) {
    const start = Math.max(0, i - leftSpan);
    const end = Math.min(rows.length, i + rightSpan + 1);
    const denominatorSum = denominatorPrefix[end]! - denominatorPrefix[start]!;
    if (denominatorSum <= 0) continue;
    const numeratorSum = numeratorPrefix[end]! - numeratorPrefix[start]!;
    out.push({
      t: rows[i]!.t,
      value: Math.min(boundedUpper, Math.max(0, numeratorSum / denominatorSum)),
    });
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
export function cumulativeCompletedRequests(
  requests: readonly RequestChartRecord[],
): TimeSeriesPoint[] {
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
  requests: readonly RequestChartRecord[],
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

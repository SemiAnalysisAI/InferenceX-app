import {
  bucketTimeMs,
  sumPowerAt,
  type GpuPowerRole,
  type GpuPowerSeries,
  type GpuPowerSeriesResponse,
} from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

export const POWER_TIMELINE_METRIC_KEY = 'y_measuredPowerTimeline';
const ARTIFACT_PREFIX = 'gpu_metrics_';
const SOURCE_PATTERN = /^(?:.*\/)?power_validation_(?<name>.+)\.json$/u;

interface AuditedPoint {
  power_audit?: { source?: string } | null;
}

export function telemetryNameForPoint(point: AuditedPoint): string | null {
  const source = point.power_audit?.source;
  if (!source) return null;
  return SOURCE_PATTERN.exec(source)?.groups?.name ?? null;
}

export function telemetryArtifactForPoint(point: AuditedPoint): string | null {
  const name = telemetryNameForPoint(point);
  return name ? `${ARTIFACT_PREFIX}${name}` : null;
}

export function traceKeyForPoint(point: AuditedPoint & { run_url?: string }): string | null {
  const runId = runIdFromUrl(point.run_url);
  const name = telemetryNameForPoint(point);
  return runId && name ? `${runId}:${name}` : null;
}

export function runIdFromUrl(url: string | null | undefined): string | null {
  return url?.match(/\/runs\/(?<runId>\d+)/u)?.groups?.runId ?? null;
}

export function runAttemptFromUrl(url: string | null | undefined): number | null {
  const attempt = url?.match(/\/runs\/\d+\/attempts\/(?<attempt>\d+)/u)?.groups?.attempt;
  return attempt ? Number(attempt) : null;
}

export function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0];
  for (const value of values) {
    let end = 0;
    while (end < prefix.length && end < value.length && prefix[end] === value[end]) end++;
    prefix = prefix.slice(0, end);
    if (prefix === '') break;
  }
  return prefix;
}

export interface PowerTimelineRequest {
  runId: string;
  prefix: string;
  sources: string[];
}

export function planPowerTimelineRequests(
  points: readonly InferenceData[],
): PowerTimelineRequest[] {
  const byRun = new Map<string, Set<string>>();
  for (const point of points) {
    const runId = runIdFromUrl(point.run_url);
    const artifact = telemetryArtifactForPoint(point);
    if (!runId || !artifact) continue;
    if (!byRun.has(runId)) byRun.set(runId, new Set());
    byRun.get(runId)!.add(artifact);
  }
  return [...byRun.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([runId, artifacts]) => {
      const names = [...artifacts].toSorted();
      return {
        runId,
        prefix: longestCommonPrefix(names.map((name) => name.slice(ARTIFACT_PREFIX.length))),
        sources: names.map((name) => `power_validation_${name.slice(ARTIFACT_PREFIX.length)}.json`),
      };
    });
}

export function traceKeyRunId(key: string | null | undefined): string | null {
  const runId = key?.split(':')[0];
  return runId || null;
}

export function prioritizeRun(
  requests: PowerTimelineRequest[],
  runId: string | null,
): PowerTimelineRequest[] {
  const index = runId ? requests.findIndex((request) => request.runId === runId) : -1;
  if (index <= 0) return requests;
  return [requests[index], ...requests.slice(0, index), ...requests.slice(index + 1)];
}

export function prioritizeRuns(
  requests: PowerTimelineRequest[],
  runIds: ReadonlySet<string>,
): PowerTimelineRequest[] {
  if (runIds.size === 0) return requests;
  const first = requests.filter((request) => runIds.has(request.runId));
  if (first.length === 0 || first.length === requests.length) return requests;
  const rest = requests.filter((request) => !runIds.has(request.runId));
  const moved = first.some((request, index) => requests[index] !== request);
  return moved ? [...first, ...rest] : requests;
}

export interface PowerTimelineTrace {
  key: string;
  point: InferenceData;
  runId: string;
  series: GpuPowerSeries;
  windowStartMs: number | null;
  windowEndMs: number | null;
}

export type PowerTimelineAxis = 'wall' | 'elapsed' | 'serving';
export type PowerTimelineLines = 'mean' | 'gpu' | 'pool';

export function parsePowerTimelineParams(params: {
  i_ptaxis?: string;
  i_ptlines?: string;
  i_ptwindow?: string;
  i_ptfocus?: string;
  i_ptutility?: string;
  i_ptconc?: string;
  i_ptraw?: string;
}) {
  return {
    axis: (['wall', 'elapsed', 'serving'].includes(params.i_ptaxis ?? '')
      ? params.i_ptaxis
      : null) as PowerTimelineAxis | null,
    lines: (params.i_ptlines === 'gpu' || params.i_ptlines === 'pool'
      ? params.i_ptlines
      : 'mean') as PowerTimelineLines,
    windowOnly: params.i_ptwindow === 'window',
    focus:
      params.i_ptfocus && /^[1-9]\d*:[\w.-]+$/u.test(params.i_ptfocus) ? params.i_ptfocus : null,
    utility: params.i_ptutility === '1',
    raw: params.i_ptraw === '1',
    concurrency: /^[1-9]\d{0,5}$/u.test(params.i_ptconc ?? '') ? Number(params.i_ptconc) : null,
  };
}

export function hasPowerTimelineWindow(trace: PowerTimelineTrace): boolean {
  return (
    trace.windowStartMs !== null &&
    trace.windowEndMs !== null &&
    Number.isFinite(trace.windowStartMs) &&
    Number.isFinite(trace.windowEndMs) &&
    trace.windowEndMs > trace.windowStartMs
  );
}

export function powerTimelineSampleX(
  trace: PowerTimelineTrace,
  column: number,
  axis: PowerTimelineAxis,
  windowOnly: boolean,
): number | null {
  const timeMs = bucketTimeMs(trace.series, column);
  if ((axis === 'serving' || windowOnly) && !hasPowerTimelineWindow(trace)) return null;
  if (windowOnly && windowPhase(trace, timeMs) !== 'window') return null;
  if (axis === 'wall') return timeMs;
  const origin = axis === 'serving' ? trace.windowStartMs! : bucketTimeMs(trace.series, 0);
  return (timeMs - origin) / 1000;
}

export type MissingTraceReason = 'no-source' | 'no-run' | 'run-not-fetched' | 'not-in-run';

export interface MissingTrace {
  point: InferenceData;
  reason: MissingTraceReason;
}

export interface PowerTimelineJoin {
  traces: PowerTimelineTrace[];
  missing: MissingTrace[];
}

export function joinPowerTimeline(
  points: readonly InferenceData[],
  responses: ReadonlyMap<string, GpuPowerSeriesResponse>,
): PowerTimelineJoin {
  const traces: PowerTimelineTrace[] = [];
  const missing: MissingTrace[] = [];
  for (const point of points) {
    const runId = runIdFromUrl(point.run_url);
    const name = telemetryNameForPoint(point);
    if (!name) {
      missing.push({ point, reason: 'no-source' });
      continue;
    }
    if (!runId) {
      missing.push({ point, reason: 'no-run' });
      continue;
    }
    const response = responses.get(runId);
    if (!response) {
      missing.push({ point, reason: 'run-not-fetched' });
      continue;
    }
    const source = `power_validation_${name}.json`;
    const artifact = `${ARTIFACT_PREFIX}${name}`;
    const series =
      response.series.find((entry) => entry.source === source) ??
      response.series.find((entry) => entry.source === undefined && entry.artifact === artifact);
    if (!series) {
      missing.push({ point, reason: 'not-in-run' });
      continue;
    }
    const audit = point.power_audit;
    traces.push({
      key: `${runId}:${name}`,
      point,
      runId,
      series,
      windowStartMs: unixSecondsToMs(audit?.window_start_unix),
      windowEndMs: unixSecondsToMs(audit?.window_end_unix),
    });
  }
  return { traces, missing };
}

function unixSecondsToMs(seconds: number | undefined): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1000 : null;
}

export type WindowPhase = 'before' | 'window' | 'after' | 'unknown';

export function windowPhase(trace: PowerTimelineTrace, timeMs: number): WindowPhase {
  if (!hasPowerTimelineWindow(trace)) return 'unknown';
  if (timeMs < trace.windowStartMs!) return 'before';
  if (timeMs > trace.windowEndMs!) return 'after';
  return 'window';
}

export function traceConfigLabel(point: InferenceData): string {
  const parts: string[] = [];
  if (point.disagg) parts.push('PD');
  if (typeof point.tp === 'number' && point.tp > 0) parts.push(`TP${point.tp}`);
  parts.push(`c${point.conc}`);
  return parts.join(' · ');
}

export type PowerPoolRole = GpuPowerRole | 'all';

export interface PowerPool {
  role: PowerPoolRole;
  rows: number[];
}

const POOL_ORDER: readonly PowerPoolRole[] = ['all', 'prefill', 'decode'];

export function tracePools(series: Pick<GpuPowerSeries, 'devices' | 'power'>): PowerPool[] {
  const rows = new Map<PowerPoolRole, number[]>();
  series.devices?.forEach((device, row) => {
    if (!device.role) return;
    if (!rows.has(device.role)) rows.set(device.role, []);
    rows.get(device.role)!.push(row);
  });
  return POOL_ORDER.filter((role) => rows.has(role)).map((role) => ({
    role,
    rows: rows.get(role)!,
  }));
}

export interface PoolSizeGroup {
  size: number;
  roles: PowerPoolRole[];
}

export function groupPoolsBySize(
  pools: readonly Pick<PowerPool, 'role' | 'rows'>[],
): PoolSizeGroup[] {
  const bySize = new Map<number, Set<PowerPoolRole>>();
  for (const pool of pools) {
    if (!bySize.has(pool.rows.length)) bySize.set(pool.rows.length, new Set());
    bySize.get(pool.rows.length)!.add(pool.role);
  }
  return [...bySize.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([size, roles]) => ({
      size,
      roles: POOL_ORDER.filter((role) => roles.has(role)),
    }));
}

/** Seconds of the centered rolling mean the timeline draws unless raw samples are requested. */
export const POWER_TIMELINE_SMOOTH_SECONDS = 30;

/**
 * Centered rolling mean over `window` samples. Nulls are skipped inside a window and stay null
 * in the output, so gaps in telemetry are never bridged with invented values.
 */
export function rollingMean(values: readonly (number | null)[], window: number): (number | null)[] {
  const span = Math.max(1, Math.round(window));
  if (span <= 1) return [...values];
  const half = Math.floor(span / 2);
  const sums = [0];
  const counts = [0];
  for (const value of values) {
    const valid = value !== null && Number.isFinite(value);
    sums.push(sums.at(-1)! + (valid ? value : 0));
    counts.push(counts.at(-1)! + (valid ? 1 : 0));
  }
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    const lo = Math.max(0, index - half);
    const hi = Math.min(values.length, index - half + span);
    const count = counts[hi] - counts[lo];
    return count > 0 ? (sums[hi] - sums[lo]) / count : null;
  });
}

/**
 * Moves label centers apart so no two are closer than `rowHeight`, keeping their order and
 * staying inside [min, max]. Labels are shifted symmetrically around their wanted position
 * instead of only downwards, so a cluster stays centered on the lines it names.
 */
export function spreadLabelYs(
  wanted: readonly number[],
  rowHeight: number,
  min: number,
  max: number,
): number[] {
  const order = wanted.map((_, index) => index).toSorted((a, b) => wanted[a] - wanted[b]);
  interface Block {
    start: number;
    members: number[];
    center: number;
  }
  const blocks: Block[] = [];
  for (const index of order) {
    let block: Block = { start: wanted[index], members: [index], center: wanted[index] };
    while (blocks.length > 0) {
      const previous = blocks.at(-1)!;
      if (previous.start + previous.members.length * rowHeight <= block.start) break;
      blocks.pop();
      const members = [...previous.members, ...block.members];
      const center = members.reduce((sum, member) => sum + wanted[member], 0) / members.length;
      block = { members, center, start: center - ((members.length - 1) * rowHeight) / 2 };
    }
    blocks.push(block);
  }
  const ys = [...wanted];
  const total = order.length * rowHeight;
  const room = Math.max(0, max - min);
  // Clamp the whole layout into range; when it cannot fit, compress the row height evenly.
  const row = total - rowHeight > room && order.length > 1 ? room / (order.length - 1) : rowHeight;
  let cursor = min;
  for (const block of blocks) {
    let y = Math.max(block.start, cursor);
    for (const member of block.members) {
      ys[member] = y;
      y += row;
    }
    cursor = y;
  }
  // Pull back from the bottom edge, preserving spacing.
  let ceiling = max;
  for (const index of order.toReversed()) {
    if (ys[index] > ceiling) ys[index] = ceiling;
    ceiling = ys[index] - row;
  }
  return ys;
}

export function allGpuPool(series: Pick<GpuPowerSeries, 'power'>): PowerPool {
  return { role: 'all', rows: series.power.map((_, row) => row) };
}

export interface TracePoolSummary {
  role: PowerPoolRole;
  gpuCount: number;
  peakWatts: number | null;
}

export interface TraceWindowSummary {
  windowSeconds: number | null;
  bucketSeconds: number;
  pools: TracePoolSummary[];
}

export function summarizeTraceWindow(
  trace: PowerTimelineTrace,
  pools: readonly PowerPool[],
): TraceWindowSummary {
  const hasWindow = hasPowerTimelineWindow(trace);
  const columns = hasWindow
    ? trace.series.t
        .map((_, column) => column)
        .filter((column) => windowPhase(trace, bucketTimeMs(trace.series, column)) === 'window')
    : [];
  return {
    windowSeconds: hasWindow ? (trace.windowEndMs! - trace.windowStartMs!) / 1000 : null,
    bucketSeconds: trace.series.bucketSeconds,
    pools: pools.map((pool) => {
      const sums = columns
        .map((column) => sumPowerAt(trace.series, pool.rows, column))
        .filter((value): value is number => value !== null);
      return {
        role: pool.role,
        gpuCount: pool.rows.length,
        peakWatts: sums.length > 0 ? Math.max(...sums) : null,
      };
    }),
  };
}

let pendingFocus: string | null = null;

export function requestPowerTraceFocus(key: string): void {
  pendingFocus = key;
}

export function consumePowerTraceFocus(): string | null {
  const key = pendingFocus;
  pendingFocus = null;
  return key;
}

/**
 * Concurrency shared by the most hardware configs (ties go to the higher level),
 * so a first look at the timeline compares chips at one load instead of every sweep point.
 */
export function mostCoveredConcurrency(
  points: readonly { conc: number; hwKey: string }[],
): number | null {
  const coverage = new Map<number, Set<string>>();
  for (const { conc, hwKey } of points) {
    if (!Number.isSafeInteger(conc) || conc <= 0) continue;
    let keys = coverage.get(conc);
    if (!keys) coverage.set(conc, (keys = new Set()));
    keys.add(hwKey);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [conc, keys] of coverage) {
    if (keys.size > bestCount || (keys.size === bestCount && best !== null && conc > best)) {
      best = conc;
      bestCount = keys.size;
    }
  }
  return best;
}

/** What the timeline shows in place of (or on top of) its plot. */
export type PowerTimelineStatus =
  | { kind: 'loading'; runs: number; blocking: boolean }
  | { kind: 'error'; blocking: true }
  | { kind: 'empty'; reason: 'noArtifacts' | 'noTraces'; blocking: true }
  | { kind: 'empty'; reason: 'missingWindow'; missing: number; blocking: true };

export interface PowerTimelineStatusInput {
  /** Requests still in flight. */
  loadingRuns: number;
  /** Requests that were sent (after the per-chart run cap). */
  fetchedRuns: number;
  /** Requests that failed. */
  failedRuns: number;
  /** Whether any plotted point has a telemetry artifact to request. */
  hasAnyArtifact: boolean;
  /** Traces that pass the legend, concurrency and overlay filters. */
  visibleTraces: number;
  /** Visible traces omitted because they lack serving-window bounds. */
  missingWindows: number;
  /** Whether at least one line can be drawn. */
  drawable: boolean;
}

/**
 * Decides the timeline's status panel. A blocking status replaces the plot (its placeholder axes
 * are hidden); a non-blocking one is a small notice over lines that are already drawn, so a run
 * that is still loading never hides the runs that have arrived.
 */
export function powerTimelineStatus(input: PowerTimelineStatusInput): PowerTimelineStatus | null {
  if (input.drawable) {
    return input.loadingRuns > 0
      ? { kind: 'loading', runs: input.loadingRuns, blocking: false }
      : null;
  }
  if (input.loadingRuns > 0) return { kind: 'loading', runs: input.loadingRuns, blocking: true };
  if (!input.hasAnyArtifact) return { kind: 'empty', reason: 'noArtifacts', blocking: true };
  if (input.fetchedRuns > 0 && input.failedRuns === input.fetchedRuns) {
    return { kind: 'error', blocking: true };
  }
  if (input.visibleTraces > 0 && input.missingWindows === input.visibleTraces) {
    return {
      kind: 'empty',
      reason: 'missingWindow',
      missing: input.missingWindows,
      blocking: true,
    };
  }
  return { kind: 'empty', reason: 'noTraces', blocking: true };
}

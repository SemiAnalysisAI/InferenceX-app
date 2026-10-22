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

export function referenceLabelSlots(lines: readonly { watts: number }[]): number[] {
  const used = new Map<number, number>();
  return lines.map((line) => {
    const slot = used.get(line.watts) ?? 0;
    used.set(line.watts, slot + 1);
    return slot;
  });
}

export function stackTraceLabels(
  labels: readonly { left: number; right: number; y: number }[],
  rowHeight: number,
): number[] {
  const ys = labels.map((label) => label.y);
  const placed: { left: number; right: number; y: number }[] = [];
  const order = labels.map((_, index) => index).toSorted((a, b) => labels[a].y - labels[b].y);
  for (const index of order) {
    const { left, right } = labels[index];
    let y = ys[index];
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        if (left < other.right && other.left < right && Math.abs(y - other.y) < rowHeight) {
          y = other.y + rowHeight;
          moved = true;
        }
      }
    }
    ys[index] = y;
    placed.push({ left, right, y });
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

/**
 * Joins chart points to the per-second GPU telemetry behind their measured
 * average power (the PowerX "Timeline" display).
 *
 * Every validated row records its window in `power_audit`, whose `source` is
 * `power_validation_<name>.json`. Two collectors publish the telemetry:
 * - single-node runners upload one `gpu_metrics_<name>` CSV artifact per
 *   config, so the source names the artifact exactly;
 * - Slurm / Dynamo runners upload one `power_audit_<RESULT_FILENAME>` bundle per
 *   sweep whose `LOGS/power/samples.csv` covers every concurrency; the API cuts
 *   it into one series per `power_validation_*.json` it contains and labels
 *   each with that `source`, so the same file name joins it to the row.
 * Nothing is matched by hardware or concurrency; points whose telemetry is
 * missing (expired artifact, another collector) are reported, not guessed.
 */
import type {
  GpuPowerRole,
  GpuPowerSeries,
  GpuPowerSeriesResponse,
} from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

export const POWER_TIMELINE_METRIC_KEY = 'y_measuredPowerTimeline';
const ARTIFACT_PREFIX = 'gpu_metrics_';
const SOURCE_PATTERN = /^(?:.*\/)?power_validation_(?<name>.+)\.json$/u;

interface AuditedPoint {
  power_audit?: { source?: string } | null;
}

/** The `<name>` of a point's `power_validation_<name>.json` audit source. */
export function telemetryNameForPoint(point: AuditedPoint): string | null {
  const source = point.power_audit?.source;
  if (!source) return null;
  return SOURCE_PATTERN.exec(source)?.groups?.name ?? null;
}

/** `gpu_metrics_<RESULT_FILENAME>` for a point, from its power-audit source. */
export function telemetryArtifactForPoint(point: AuditedPoint): string | null {
  const name = telemetryNameForPoint(point);
  return name ? `${ARTIFACT_PREFIX}${name}` : null;
}

/**
 * Stable identity of a point's trace: run id plus audit name. Unique within a
 * chart because the audit name carries the config and the concurrency.
 */
export function traceKeyForPoint(point: AuditedPoint & { run_url?: string }): string | null {
  const runId = runIdFromUrl(point.run_url);
  const name = telemetryNameForPoint(point);
  return runId && name ? `${runId}:${name}` : null;
}

/** Workflow run id from a GitHub Actions run URL. */
export function runIdFromUrl(url: string | null | undefined): string | null {
  return url?.match(/\/runs\/(?<runId>\d+)/u)?.groups?.runId ?? null;
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
  /** RESULT_FILENAME prefix shared by every wanted artifact of the run. */
  prefix: string;
  /** Sorted, unique validation basenames expected by the displayed points. */
  sources: string[];
}

/**
 * One request per workflow run, narrowed to the common RESULT_FILENAME prefix
 * of the points' artifacts so a sweep of other models is not downloaded.
 * Points without a run URL or an audit source plan nothing.
 */
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

/** Run id half of a trace key (`traceKeyForPoint`). */
export function traceKeyRunId(key: string | null | undefined): string | null {
  const runId = key?.split(':')[0];
  return runId || null;
}

/**
 * Moves the request for `runId` to the front so it survives the per-chart run
 * cap; the order of the other requests is kept. Returns the same array when
 * nothing needs moving.
 */
export function prioritizeRun(
  requests: PowerTimelineRequest[],
  runId: string | null,
): PowerTimelineRequest[] {
  const index = runId ? requests.findIndex((request) => request.runId === runId) : -1;
  if (index <= 0) return requests;
  return [requests[index], ...requests.slice(0, index), ...requests.slice(index + 1)];
}

/**
 * Moves every request whose run is in `runIds` ahead of the others, keeping
 * the relative order inside both groups. Unofficial-run overlays are loaded
 * on purpose, so their telemetry must survive the per-chart run cap before
 * official rows compete for the remaining slots. Returns the same array when
 * nothing needs moving.
 */
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
  /** `traceKeyForPoint(point)`. */
  key: string;
  point: InferenceData;
  runId: string;
  series: GpuPowerSeries;
  /** Validated measurement window (UTC ms) from `power_audit`, when recorded. */
  windowStartMs: number | null;
  windowEndMs: number | null;
}

/**
 * Why a validated point has no trace:
 * - `no-source`: the row predates `power_audit.source` (older schema), so no
 *   artifact can be named;
 * - `no-run`: no workflow run URL to look in;
 * - `run-not-fetched`: its run is not among the loaded responses (over the
 *   per-chart run limit, still loading, or the request failed);
 * - `not-in-run`: the run was loaded but holds neither a matching
 *   `gpu_metrics_*` artifact nor a power-audit bundle with the point's
 *   validation file (expired, over the download cap, or another collector).
 */
export type MissingTraceReason = 'no-source' | 'no-run' | 'run-not-fetched' | 'not-in-run';

export interface MissingTrace {
  point: InferenceData;
  reason: MissingTraceReason;
}

export interface PowerTimelineJoin {
  traces: PowerTimelineTrace[];
  /** Points with a validated average but no telemetry trace, with the reason. */
  missing: MissingTrace[];
}

/** Attaches fetched series to points; order follows `points`. */
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
    // A bundle-cut series names the point's validation file; a per-config
    // CSV artifact names the config itself.
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

/** Sample position relative to the validated window. */
export type WindowPhase = 'before' | 'window' | 'after' | 'unknown';

export function windowPhase(trace: PowerTimelineTrace, timeMs: number): WindowPhase {
  if (trace.windowStartMs === null || trace.windowEndMs === null) return 'unknown';
  if (timeMs < trace.windowStartMs) return 'before';
  if (timeMs > trace.windowEndMs) return 'after';
  return 'window';
}

/** Short config label: `TP8 · c64`, plus `PD` for disaggregated points. */
export function traceConfigLabel(point: InferenceData): string {
  const parts: string[] = [];
  if (point.disagg) parts.push('PD');
  if (typeof point.tp === 'number' && point.tp > 0) parts.push(`TP${point.tp}`);
  parts.push(`c${point.conc}`);
  return parts.join(' · ');
}

// ── Worker-role pools ────────────────────────────────────────────────────────

export type PowerPoolRole = GpuPowerRole | 'all';

export interface PowerPool {
  role: PowerPoolRole;
  /** Row indices into `series.power`, in series order. */
  rows: number[];
}

const POOL_ORDER: readonly PowerPoolRole[] = ['all', 'prefill', 'decode'];

/**
 * The GPU pools of a series by worker role, in `prefill`, `decode` order —
 * only the roles that have at least one device. A series whose collector
 * assigns no roles yields no pools; callers fall back to `allGpuPool`.
 */
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

/**
 * Pools that hold the same number of GPUs share one rated ceiling, so their
 * reference draws once, labelled `prefill / decode ×16`, instead of two labels
 * printed over each other. Sizes ascending, roles in pool order, deduplicated.
 */
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

/**
 * Label row for each reference line: lines at the same watts (different
 * hardware with an equal pool ceiling) stack their labels upward, slot 0 on
 * the line and slot n `n` rows above, instead of overprinting. Input order.
 */
export function referenceLabelSlots(lines: readonly { watts: number }[]): number[] {
  const used = new Map<number, number>();
  return lines.map((line) => {
    const slot = used.get(line.watts) ?? 0;
    used.set(line.watts, slot + 1);
    return slot;
  });
}

/** Every GPU of the series as one pool. */
export function allGpuPool(series: Pick<GpuPowerSeries, 'power'>): PowerPool {
  return { role: 'all', rows: series.power.map((_, row) => row) };
}

// ── Deep link from a pinned scatter tooltip ─────────────────────────────────
//
// "View power trace" on a pinned tooltip switches the metric to the Timeline
// display; the timeline mounts afterwards and reads the requested trace here
// so it can emphasise that config. Module state rather than URL state: the
// focus is a one-shot gesture, and the share link stays `i_metric` alone.

let pendingFocus: string | null = null;

export function requestPowerTraceFocus(key: string): void {
  pendingFocus = key;
}

/** The pending focus request, cleared on read. */
export function consumePowerTraceFocus(): string | null {
  const key = pendingFocus;
  pendingFocus = null;
  return key;
}

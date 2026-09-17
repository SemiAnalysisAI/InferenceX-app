/**
 * Joins chart points to the per-second GPU telemetry behind their measured
 * average power (the PowerX "Timeline" display).
 *
 * The runner uploads one `gpu_metrics_<RESULT_FILENAME>` artifact per config
 * and records the validated window in `power_audit`, whose `source` is
 * `power_validation_<RESULT_FILENAME>.json`. The RESULT_FILENAME therefore
 * identifies a point's trace exactly; nothing is matched by hardware or
 * concurrency. Points whose artifact is missing (disaggregated Dynamo rows use
 * a different collector, or the artifact expired) are reported, not guessed.
 */
import type { GpuPowerSeries, GpuPowerSeriesResponse } from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

export const POWER_TIMELINE_METRIC_KEY = 'y_measuredPowerTimeline';
const ARTIFACT_PREFIX = 'gpu_metrics_';
const SOURCE_PATTERN = /^(?:.*\/)?power_validation_(?<name>.+)\.json$/u;

/** `gpu_metrics_<RESULT_FILENAME>` for a point, from its power-audit source. */
export function telemetryArtifactForPoint(point: {
  power_audit?: { source?: string } | null;
}): string | null {
  const source = point.power_audit?.source;
  if (!source) return null;
  const name = SOURCE_PATTERN.exec(source)?.groups?.name;
  return name ? `${ARTIFACT_PREFIX}${name}` : null;
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
  artifacts: string[];
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
        artifacts: names,
      };
    });
}

export interface PowerTimelineTrace {
  /** Stable per-point key (artifact name is unique within a run). */
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
 * - `not-in-run`: the run was loaded but holds no matching `gpu_metrics_*`
 *   artifact (another collector, e.g. disaggregated Dynamo rows, or expired).
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
    const artifact = telemetryArtifactForPoint(point);
    if (!artifact) {
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
    const series = response.series.find((entry) => entry.artifact === artifact);
    if (!series) {
      missing.push({ point, reason: 'not-in-run' });
      continue;
    }
    const audit = point.power_audit;
    traces.push({
      key: `${runId}:${artifact}`,
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

/**
 * Client-side measurement-window math for the PowerX viewer: UTC-deterministic
 * timestamp parsing, window-to-trace alignment, and a viewer-side re-run of
 * the producer's per-device trapezoid integration
 * (`per_device_trapezoidal_with_linear_boundary_interpolation`,
 * InferenceX utils/aggregate_power.py). This is an independent cross-check of
 * the published `avg_power_w`, not a source of truth.
 */
import type { GpuMetricRow, PowerWindow } from './types';

/** |Δ| at or below this % renders as ok (well inside the producer tolerance). */
export const RECONCILIATION_OK_PCT = 2;
/** |Δ| at or below this % renders as warn — the producer's accumulator cross-check tolerance (5%). */
export const RECONCILIATION_WARN_PCT = 5;

// nvidia-smi naive local time, e.g. "2025/01/15 12:34:56.789"
const NVIDIA_NAIVE_RE =
  /^(?<year>\d{4})\/(?<month>\d{2})\/(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?$/u;
// naive ISO without timezone designator, e.g. "2025-01-15T12:34:56.789"
const NAIVE_ISO_RE =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?$/u;
// ISO with explicit offset — safe to hand to Date regardless of viewer TZ
const TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/u;
const NUMERIC_EPOCH_RE = /^\d+(?:\.\d+)?$/u;

function utcMsFromParts(match: RegExpExecArray): number {
  const { year, month, day, hour, minute, second, fraction } = match.groups!;
  const ms = fraction ? Number(fraction.padEnd(3, '0')) : 0;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    ms,
  );
}

/**
 * Parse a trace timestamp to UTC epoch milliseconds, deterministically in any
 * viewer timezone. Naive timestamps (nvidia-smi and bare ISO) are interpreted
 * as UTC — matching the UTC clocks of the benchmark runner containers that
 * wrote them. Returns null for formats whose UTC placement would be a guess.
 */
export function parseTimestampUtcMs(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  if (NUMERIC_EPOCH_RE.test(value)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const nvidiaMatch = NVIDIA_NAIVE_RE.exec(value);
  if (nvidiaMatch) return utcMsFromParts(nvidiaMatch);

  const naiveIsoMatch = NAIVE_ISO_RE.exec(value);
  if (naiveIsoMatch) return utcMsFromParts(naiveIsoMatch);

  if (TZ_SUFFIX_RE.test(value)) {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

export interface AlignedWindow {
  startSeconds: number;
  endSeconds: number;
  clampedStart: boolean;
  clampedEnd: boolean;
}

/**
 * Place a unix-epoch measurement window on the chart's relative-seconds axis.
 * Every sample in one CSV shifts by the same constant under viewer-TZ vs UTC
 * parsing, so seconds relative to the trace minimum land on the existing axis.
 * Returns null when the window does not intersect the trace — never a shifted
 * guess (e.g. a non-UTC runner clock).
 */
export function alignWindowToTrace(
  data: GpuMetricRow[],
  window: PowerWindow,
): AlignedWindow | null {
  if (window.end_unix <= window.start_unix) return null;

  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const row of data) {
    const ms = parseTimestampUtcMs(row.timestamp);
    if (ms === null) continue;
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;

  const windowStartMs = window.start_unix * 1000;
  const windowEndMs = window.end_unix * 1000;
  if (windowEndMs <= minMs || windowStartMs >= maxMs) return null;

  const clampedStart = windowStartMs < minMs;
  const clampedEnd = windowEndMs > maxMs;
  return {
    startSeconds: (Math.max(windowStartMs, minMs) - minMs) / 1000,
    endSeconds: (Math.min(windowEndMs, maxMs) - minMs) / 1000,
    clampedStart,
    clampedEnd,
  };
}

/** Linear interpolation at a timestamp bracketed by sorted samples. */
function interpolatePower(samples: [number, number][], timeS: number): number {
  let rightIndex = samples.findIndex(([t]) => t >= timeS);
  if (rightIndex === -1) rightIndex = samples.length;
  if (rightIndex < samples.length && Math.abs(samples[rightIndex][0] - timeS) <= 1e-9) {
    return samples[rightIndex][1];
  }
  const leftIndex = rightIndex - 1;
  const [leftTime, leftPower] = samples[leftIndex];
  const [rightTime, rightPower] = samples[rightIndex];
  const fraction = (timeS - leftTime) / (rightTime - leftTime);
  return leftPower + fraction * (rightPower - leftPower);
}

/** Trapezoid energy of one device over [startS, endS], boundary-interpolated. */
function integrateDevice(samples: [number, number][], startS: number, endS: number): number {
  const clipped: [number, number][] = [[startS, interpolatePower(samples, startS)]];
  for (const [t, p] of samples) {
    if (t > startS && t < endS) clipped.push([t, p]);
  }
  clipped.push([endS, interpolatePower(samples, endS)]);

  let energyJ = 0;
  for (let i = 1; i < clipped.length; i++) {
    const [leftTime, leftPower] = clipped[i - 1];
    const [rightTime, rightPower] = clipped[i];
    energyJ += (rightTime - leftTime) * ((leftPower + rightPower) / 2);
  }
  return energyJ;
}

export interface WindowPowerRecompute {
  avgPowerPerGpuW: number;
  totalEnergyJ: number;
  gpuCount: number;
  sampleCount: number;
  /** true when the window extends past the trace for any device (clamped). */
  partialCoverage: boolean;
}

/**
 * Re-integrate the trace over the measurement window, mirroring the producer:
 * per-GPU sort by UTC epoch, same-timestamp samples averaged, linear
 * interpolation at both boundaries, trapezoid inside, energies summed, then
 * `/ duration / gpuCount`. Coverage gaps are clamped per device and flagged.
 * Returns null when no GPU has at least 2 samples overlapping the window.
 */
export function integrateWindowPower(
  data: GpuMetricRow[],
  window: PowerWindow,
): WindowPowerRecompute | null {
  if (window.end_unix <= window.start_unix) return null;

  // Group by GPU; average duplicate timestamps like the producer does.
  const byGpu = new Map<number, Map<number, number[]>>();
  for (const row of data) {
    const ms = parseTimestampUtcMs(row.timestamp);
    if (ms === null || !Number.isFinite(row.power) || row.power < 0) continue;
    const timeS = ms / 1000;
    let series = byGpu.get(row.index);
    if (!series) {
      series = new Map();
      byGpu.set(row.index, series);
    }
    const values = series.get(timeS);
    if (values) values.push(row.power);
    else series.set(timeS, [row.power]);
  }

  let totalEnergyJ = 0;
  let sumOfDeviceMeansW = 0;
  let gpuCount = 0;
  let sampleCount = 0;
  let partialCoverage = false;

  for (const series of byGpu.values()) {
    const samples: [number, number][] = [...series.entries()]
      .map(([t, values]): [number, number] => [
        t,
        values.reduce((a, b) => a + b, 0) / values.length,
      ])
      .sort((a, b) => a[0] - b[0]);
    if (samples.length < 2) continue;

    // Clamp the window to this device's sample extent; skip non-overlapping devices.
    const deviceStart = Math.max(window.start_unix, samples[0][0]);
    const deviceEnd = Math.min(window.end_unix, samples.at(-1)![0]);
    if (deviceEnd <= deviceStart) continue;
    if (deviceStart > window.start_unix || deviceEnd < window.end_unix) partialCoverage = true;

    const energyJ = integrateDevice(samples, deviceStart, deviceEnd);
    totalEnergyJ += energyJ;
    sumOfDeviceMeansW += energyJ / (deviceEnd - deviceStart);
    gpuCount += 1;
    sampleCount += samples.filter(([t]) => t >= deviceStart && t <= deviceEnd).length;
  }

  if (gpuCount === 0) return null;

  return {
    // Full coverage reduces to the producer's totalEnergy / duration / count;
    // clamped devices contribute their covered-portion mean instead of a
    // silently deflated value.
    avgPowerPerGpuW: sumOfDeviceMeansW / gpuCount,
    totalEnergyJ,
    gpuCount,
    sampleCount,
    partialCoverage,
  };
}

/** Classify recomputed-vs-published delta with the producer-derived thresholds. */
export function classifyDelta(
  recomputedW: number,
  publishedW: number,
): { deltaPct: number; level: 'ok' | 'warn' | 'alert' } {
  const deltaPct =
    publishedW === 0
      ? recomputedW === 0
        ? 0
        : Infinity
      : ((recomputedW - publishedW) / publishedW) * 100;
  const magnitude = Math.abs(deltaPct);
  const level =
    magnitude <= RECONCILIATION_OK_PCT
      ? 'ok'
      : magnitude <= RECONCILIATION_WARN_PCT
        ? 'warn'
        : 'alert';
  return { deltaPct, level };
}

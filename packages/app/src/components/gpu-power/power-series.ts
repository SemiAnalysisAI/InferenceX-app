/**
 * Compact per-GPU power series for the PowerX timeline.
 *
 * A `gpu_metrics_<RESULT_FILENAME>` artifact carries ~1 Hz samples for every
 * GPU of one benchmark config (server start, warmup, and the measured window).
 * The raw rows are heavy (a 25-config run is ~27 MB of JSON), so the API can
 * return this columnar shape instead: one row of watts per GPU, aligned on
 * fixed-width time buckets, with `null` where a GPU had no sample.
 *
 * Runner timestamps are UTC wall clock (`2026/09/12 20:19:57.158`); the
 * validated measurement window in `power_audit` is UTC epoch seconds, so the
 * two line up without a timezone guess.
 */
import type { GpuMetricRow, GpuPowerRunInfo } from './types';

/** Worker role a GPU served, when the collector's manifest assigns one. */
export type GpuPowerRole = 'prefill' | 'decode';

export interface GpuPowerDevice {
  /**
   * Producer device identifier: the nvidia-smi / amd-smi index (`"3"`) for
   * `gpu_metrics_*` CSVs, `<hostname>/<GPU-uuid>` for DCGM power-audit
   * bundles — the same form as `power_audit.observed_gpu_ids` on the row.
   */
  id: string;
  role?: GpuPowerRole;
}

export interface GpuPowerSeries {
  /** GitHub artifact name: `gpu_metrics_<RESULT_FILENAME>` or `power_audit_<RESULT_FILENAME>`. */
  artifact: string;
  /**
   * Basename of the `power_validation_*.json` this series belongs to, for
   * series cut from a power-audit bundle (one bundle holds a whole
   * concurrency sweep). Absent for `gpu_metrics_*` series, whose artifact
   * already names one config.
   */
  source?: string;
  /** UTC epoch milliseconds of bucket 0. */
  startMs: number;
  /** Bucket width in seconds. */
  bucketSeconds: number;
  /** GPU indices, one per row of `power`, ascending. */
  gpus: number[];
  /** Seconds since `startMs` for each bucket, ascending. */
  t: number[];
  /** Watts per GPU (outer) per bucket (inner); `null` when no sample landed in the bucket. */
  power: (number | null)[][];
  /** One entry per row of `power` when the collector reports device identity or roles. */
  devices?: GpuPowerDevice[];
}

export interface GpuPowerSeriesResponse {
  runInfo: GpuPowerRunInfo;
  series: GpuPowerSeries[];
}

const RUNNER_TIMESTAMP =
  /^(?<y>\d{4})[/-](?<mo>\d{2})[/-](?<d>\d{2})[ T](?<h>\d{2}):(?<mi>\d{2}):(?<s>\d{2})(?:\.(?<ms>\d{1,6}))?$/u;

/**
 * Parses a runner telemetry timestamp as UTC epoch milliseconds.
 *
 * nvidia-smi / amd-smi write `YYYY/MM/DD HH:MM:SS.mmm` without a zone; the
 * collectors run in UTC, and `new Date(...)` would read that as browser local
 * time, so the digits are assembled explicitly. ISO strings with a zone and
 * numeric epochs (seconds or milliseconds) are accepted as-is.
 */
export function parseTelemetryTimestampUtc(raw: string): number | null {
  const text = raw.trim();
  const match = RUNNER_TIMESTAMP.exec(text);
  if (match?.groups) {
    const { y, mo, d, h, mi, s, ms } = match.groups;
    const millis = ms ? Math.round(Number(`0.${ms}`) * 1000) : 0;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), millis);
  }
  if (/^\d+(?:\.\d+)?$/u.test(text)) {
    const numeric = Number(text);
    return numeric < 1e12 ? Math.round(numeric * 1000) : Math.round(numeric);
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Buckets raw per-GPU rows into the compact series. Samples of one GPU that
 * share a bucket are averaged; buckets nobody sampled are omitted from `t`.
 * Returns `null` when no row carries a parseable timestamp.
 */
export function bucketPowerSeries(
  artifact: string,
  rows: readonly GpuMetricRow[],
  bucketSeconds = 1,
): GpuPowerSeries | null {
  if (!(bucketSeconds > 0)) throw new RangeError('bucketSeconds must be positive');
  const bucketMs = bucketSeconds * 1000;
  let startMs = Number.POSITIVE_INFINITY;
  const parsed: { ms: number; gpu: number; power: number }[] = [];
  for (const row of rows) {
    if (!Number.isFinite(row.power) || !Number.isInteger(row.index)) continue;
    const ms = parseTelemetryTimestampUtc(row.timestamp);
    if (ms === null) continue;
    parsed.push({ ms, gpu: row.index, power: row.power });
    if (ms < startMs) startMs = ms;
  }
  if (parsed.length === 0) return null;
  startMs = Math.floor(startMs / bucketMs) * bucketMs;

  const gpus = [...new Set(parsed.map((sample) => sample.gpu))].toSorted((a, b) => a - b);
  const gpuRow = new Map(gpus.map((gpu, row) => [gpu, row]));
  // bucket index -> per GPU [sum, count]
  const buckets = new Map<number, [number, number][]>();
  for (const sample of parsed) {
    const bucket = Math.floor((sample.ms - startMs) / bucketMs);
    let cells = buckets.get(bucket);
    if (!cells) {
      cells = gpus.map(() => [0, 0]);
      buckets.set(bucket, cells);
    }
    const cell = cells[gpuRow.get(sample.gpu)!];
    cell[0] += sample.power;
    cell[1] += 1;
  }
  const bucketIndices = [...buckets.keys()].toSorted((a, b) => a - b);
  const power: (number | null)[][] = gpus.map(() =>
    Array.from({ length: bucketIndices.length }, (): number | null => null),
  );
  bucketIndices.forEach((bucket, column) => {
    const cells = buckets.get(bucket)!;
    cells.forEach(([sum, count], row) => {
      power[row][column] = count > 0 ? Math.round((sum / count) * 100) / 100 : null;
    });
  });
  return {
    artifact,
    startMs,
    bucketSeconds,
    gpus,
    t: bucketIndices.map((bucket) => bucket * bucketSeconds),
    power,
  };
}

/** Mean watts across the GPUs that have a sample in bucket `column`, or `null`. */
export function meanPowerAt(series: GpuPowerSeries, column: number): number | null {
  let sum = 0;
  let count = 0;
  for (const row of series.power) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

/**
 * Summed watts over `rows` in bucket `column`, or `null` unless EVERY row has
 * a sample: a pool total with a device missing would read as a dip against
 * the pool's TDP, so the bucket is left as a gap instead.
 */
export function sumPowerAt(
  series: GpuPowerSeries,
  rows: readonly number[],
  column: number,
): number | null {
  if (rows.length === 0) return null;
  let sum = 0;
  for (const row of rows) {
    const value = series.power[row]?.[column];
    if (value === null || value === undefined) return null;
    sum += value;
  }
  return sum;
}

/** UTC epoch milliseconds of bucket `column`. */
export function bucketTimeMs(series: GpuPowerSeries, column: number): number {
  return series.startMs + series.t[column] * 1000;
}

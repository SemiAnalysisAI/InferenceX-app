/**
 * Per-GPU watt series bucketed to one second for the PowerX timeline.
 *
 * Shared by the app (live GitHub artifacts) and ingest (precomputed series), so
 * both paths produce identical output. Pure: no I/O.
 */
import type { GpuMetricSampleRow as GpuMetricRow } from '../queries/gpu-metrics';

export type GpuPowerRole = 'prefill' | 'decode';

export interface GpuPowerDevice {
  id: string;
  role?: GpuPowerRole;
}

export interface GpuPowerSeries {
  artifact: string;
  source?: string;
  startMs: number;
  bucketSeconds: number;
  gpus: number[];
  t: number[];
  power: (number | null)[][];
  devices?: GpuPowerDevice[];
}

const RUNNER_TIMESTAMP =
  /^(?<y>\d{4})[/-](?<mo>\d{2})[/-](?<d>\d{2})[ T](?<h>\d{2}):(?<mi>\d{2}):(?<s>\d{2})(?:\.(?<ms>\d{1,6}))?$/u;

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

export function bucketPowerSeries(
  artifact: string,
  rows: readonly GpuMetricRow[],
  bucketSeconds = 1,
): GpuPowerSeries | null {
  if (!(bucketSeconds > 0)) throw new RangeError('bucketSeconds must be positive');
  const bucketMs = bucketSeconds * 1000;
  let startMs = Number.POSITIVE_INFINITY;
  const parsed: { ms: number; gpu: number; power: number }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.power === undefined || !Number.isFinite(row.power) || !Number.isInteger(row.index))
      continue;
    const ms = parseTelemetryTimestampUtc(row.timestamp);
    if (ms === null) continue;
    const key = `${row.index}:${ms}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ ms, gpu: row.index, power: row.power });
    if (ms < startMs) startMs = ms;
  }
  if (parsed.length === 0) return null;
  startMs = Math.floor(startMs / bucketMs) * bucketMs;

  const gpus = [...new Set(parsed.map((sample) => sample.gpu))].toSorted((a, b) => a - b);
  const gpuRow = new Map(gpus.map((gpu, row) => [gpu, row]));
  const buckets = new Map<number, { cells: [number, number][]; offsetMs: number; count: number }>();
  for (const sample of parsed) {
    const bucket = Math.floor((sample.ms - startMs) / bucketMs);
    let entry = buckets.get(bucket);
    if (!entry) {
      entry = { cells: gpus.map(() => [0, 0]), offsetMs: 0, count: 0 };
      buckets.set(bucket, entry);
    }
    const cell = entry.cells[gpuRow.get(sample.gpu)!];
    cell[0] += sample.power;
    cell[1] += 1;
    entry.offsetMs += sample.ms - startMs;
    entry.count += 1;
  }
  const bucketIndices = [...buckets.keys()].toSorted((a, b) => a - b);
  const power: (number | null)[][] = gpus.map(() =>
    Array.from({ length: bucketIndices.length }, (): number | null => null),
  );
  bucketIndices.forEach((bucket, column) => {
    buckets.get(bucket)!.cells.forEach(([sum, count], row) => {
      power[row][column] = count > 0 ? Math.round((sum / count) * 100) / 100 : null;
    });
  });
  return {
    artifact,
    startMs,
    bucketSeconds,
    gpus,
    t: bucketIndices.map((bucket) => {
      const { offsetMs, count } = buckets.get(bucket)!;
      return Math.round(offsetMs / count) / 1000;
    }),
    power,
  };
}

export function bucketPowerFiles(
  artifact: string,
  files: readonly { name: string; data: readonly GpuMetricRow[] }[],
): GpuPowerSeries | null {
  const populated = files
    .filter((file) => file.data.length > 0)
    .toSorted((a, b) => a.name.localeCompare(b.name));
  if (populated.length === 0) return null;
  if (populated.length === 1) return bucketPowerSeries(artifact, populated[0].data);
  const devices = populated.flatMap((file) =>
    [...new Set(file.data.map((row) => row.index))]
      .toSorted((a, b) => a - b)
      .map((gpu) => ({ id: `${file.name}/${gpu}`, file, gpu })),
  );
  const rows = devices.flatMap(({ file, gpu }, index) =>
    file.data.filter((row) => row.index === gpu).map((row) => ({ ...row, index })),
  );
  const bucketed = bucketPowerSeries(artifact, rows);
  return bucketed ? { ...bucketed, devices: devices.map(({ id }) => ({ id })) } : null;
}

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

export function bucketTimeMs(series: GpuPowerSeries, column: number): number {
  return series.startMs + series.t[column] * 1000;
}

import type { GpuMetricKey, GpuMetricRow } from './types';
export interface ParsedPoint {
  seconds: number;
  /** Absolute sample time in ms; smoothing and alignment work in this space. */
  ms: number;
  value: number;
  gpuIndex: number;
  /** The raw sample behind this point; null once the value has been averaged. */
  raw: GpuMetricRow | null;
  /** For the mean line: how many chips contributed at this timestamp. */
  count?: number;
}

function parseTimestamp(raw: string): Date | null {
  const isoDate = new Date(raw);
  if (!isNaN(isoDate.getTime())) return isoDate;
  const numeric = parseFloat(raw);
  if (!isNaN(numeric)) {
    return numeric < 1e12 ? new Date(numeric * 1000) : new Date(numeric);
  }
  return null;
}

export function buildTelemetryData(
  data: GpuMetricRow[],
  visibleGpus: Set<number>,
  metricKey: GpuMetricKey,
): { t0Ms: number; groups: Map<number, ParsedPoint[]> } {
  // t=0 is the first sample of the whole series, not of the visible chips, so
  // hiding a chip never shifts the time axis under the remaining lines.
  let minTime = Infinity;
  const parsed: { row: GpuMetricRow; ms: number }[] = [];
  for (const row of data) {
    const time = parseTimestamp(row.timestamp);
    if (!time) continue;
    const ms = time.getTime();
    if (ms < minTime) minTime = ms;
    if (visibleGpus.has(row.index)) parsed.push({ row, ms });
  }

  const groups = new Map<number, ParsedPoint[]>();
  for (const { row, ms } of parsed) {
    const value = row[metricKey];
    // A metric the collector never sampled has no point, not a zero.
    if (value === undefined) continue;
    if (!groups.has(row.index)) groups.set(row.index, []);
    groups.get(row.index)!.push({
      seconds: (ms - minTime) / 1000,
      ms,
      value,
      gpuIndex: row.index,
      raw: row,
    });
  }
  for (const points of groups.values()) {
    points.sort((a, b) => a.seconds - b.seconds);
  }
  return { t0Ms: minTime, groups };
}

/** Keep the read-only view's serialized point shape while sharing chart preparation. */
export function buildGroupedData(
  data: GpuMetricRow[],
  visibleGpus: Set<number>,
  metricKey: GpuMetricKey,
) {
  const { groups } = buildTelemetryData(data, visibleGpus, metricKey);
  return new Map(
    [...groups].map(([index, points]) => [index, points.map(({ ms: _ms, ...point }) => point)]),
  );
}

export function buildCorrelationData(
  data: GpuMetricRow[],
  visibleGpus: Set<number>,
  xMetric: GpuMetricKey,
  yMetric: GpuMetricKey,
) {
  return data
    .filter((r) => visibleGpus.has(r.index))
    .flatMap((r) => {
      const x = r[xMetric];
      const y = r[yMetric];
      return x === undefined || y === undefined ? [] : [{ x, y, gpuIndex: r.index, raw: r }];
    });
}

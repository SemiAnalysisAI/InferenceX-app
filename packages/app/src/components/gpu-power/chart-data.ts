import type { GpuMetricConfig, GpuMetricKey, GpuMetricRow } from './types';

/**
 * The correlation y-axis to draw. A power-only series (multinode DCGM bundle)
 * has no temperature axis to default to; use the first other collected metric
 * instead of an empty plot. Shared by the explorer and the read-only view.
 */
export function correlationYMetric(
  availableMetrics: readonly Pick<GpuMetricConfig, 'key'>[],
  xMetric: GpuMetricKey,
  yMetric: GpuMetricKey,
): GpuMetricKey {
  return availableMetrics.some((m) => m.key === yMetric)
    ? yMetric
    : (availableMetrics.find((m) => m.key !== xMetric)?.key ?? xMetric);
}
export interface ParsedPoint {
  seconds: number;
  /** Absolute sample time in ms; smoothing and alignment work in this space. */
  ms: number;
  /** NaN marks an unavailable reading so chart lines retain the gap. */
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
    const value = row[metricKey] ?? NaN;
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
  const measuredGroups = new Map<number, Omit<ParsedPoint, 'ms'>[]>();
  for (const [index, points] of groups) {
    const measured = points
      .filter((point) => Number.isFinite(point.value))
      .map(({ ms: _ms, ...point }) => point);
    if (measured.length > 0) measuredGroups.set(index, measured);
  }
  return measuredGroups;
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

import type { GpuMetricKey, GpuMetricRow } from './types';
export interface ParsedPoint {
  seconds: number;
  value: number;
  gpuIndex: number;
  raw: GpuMetricRow;
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

export function buildGroupedData(
  data: GpuMetricRow[],
  visibleGpus: Set<number>,
  metricKey: GpuMetricKey,
): Map<number, ParsedPoint[]> {
  let minTime = Infinity;
  const parsed: { row: GpuMetricRow; ms: number }[] = [];
  for (const row of data) {
    if (!visibleGpus.has(row.index)) continue;
    const time = parseTimestamp(row.timestamp);
    if (!time) continue;
    const ms = time.getTime();
    parsed.push({ row, ms });
    if (ms < minTime) minTime = ms;
  }

  const groups = new Map<number, ParsedPoint[]>();
  for (const { row, ms } of parsed) {
    if (!groups.has(row.index)) groups.set(row.index, []);
    groups.get(row.index)!.push({
      seconds: (ms - minTime) / 1000,
      value: row[metricKey] ?? 0,
      gpuIndex: row.index,
      raw: row,
    });
  }
  for (const points of groups.values()) {
    points.sort((a, b) => a.seconds - b.seconds);
  }
  return groups;
}

export function buildCorrelationData(
  data: GpuMetricRow[],
  visibleGpus: Set<number>,
  xMetric: GpuMetricKey,
  yMetric: GpuMetricKey,
) {
  return data
    .filter((r) => visibleGpus.has(r.index))
    .map((r) => ({ x: r[xMetric] ?? 0, y: r[yMetric] ?? 0, gpuIndex: r.index, raw: r }));
}

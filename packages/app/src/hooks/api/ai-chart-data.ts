export type AiMetricDirection = 'higher' | 'lower';

export interface AiMetricPoint {
  hwKey?: string | null;
  x: number;
}

export interface RankAiHardwareOptions {
  metric: string;
  metricPath: string;
  chartDefinition: Record<string, unknown>;
  topN: number;
  distinctGpus: boolean;
}

function isMeasuredTelemetryMetric(metric: string): boolean {
  return metric.startsWith('y_measured');
}

export function isAiMetricValueValid(metric: string, value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (value > 0 || (value === 0 && isMeasuredTelemetryMetric(metric)))
  );
}

export function readAiMetric(point: unknown, path: string, metric: string): number | null {
  let value: unknown = point;

  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || !(key in value)) return null;
    value = (value as Record<string, unknown>)[key];
  }

  return isAiMetricValueValid(metric, value) ? value : null;
}

export function getAiMetricDirection(
  metric: string,
  chartDefinition: Record<string, unknown>,
): AiMetricDirection {
  const roofline = chartDefinition[`${metric}_roofline`];
  return typeof roofline === 'string' && roofline.startsWith('lower_') ? 'lower' : 'higher';
}

export function buildAiLineData<T extends AiMetricPoint>(
  points: readonly T[],
  metric: string,
  metricPath: string,
  visibleHardwareKeys: ReadonlySet<string>,
): Record<string, { x: number; y: number }[]> {
  const lines: Record<string, { x: number; y: number }[]> = {};

  for (const point of points) {
    const hwKey = point.hwKey ?? '';
    if (!hwKey || !visibleHardwareKeys.has(hwKey)) continue;

    lines[hwKey] ??= [];
    lines[hwKey].push({
      x: point.x,
      y: readAiMetric(point, metricPath, metric) ?? Number.NaN,
    });
  }

  for (const [hwKey, line] of Object.entries(lines)) {
    line.sort((a, b) => a.x - b.x);
    if (!line.some(({ y }) => Number.isFinite(y))) delete lines[hwKey];
  }
  return lines;
}

export function normalizeAiRadarRows(
  rawRows: ReadonlyMap<string, readonly (number | null)[]>,
  metrics: readonly string[],
  chartDefinition: Record<string, unknown>,
): Map<string, (number | null)[]> {
  const mins = metrics.map(() => Infinity);
  const maxs = metrics.map(() => -Infinity);

  for (const values of rawRows.values()) {
    for (let index = 0; index < metrics.length; index++) {
      const value = values[index];
      if (!isAiMetricValueValid(metrics[index], value)) continue;
      mins[index] = Math.min(mins[index], value);
      maxs[index] = Math.max(maxs[index], value);
    }
  }

  const normalizedRows = new Map<string, (number | null)[]>();
  for (const [hwKey, values] of rawRows) {
    normalizedRows.set(
      hwKey,
      metrics.map((metric, index) => {
        const value = values[index];
        if (
          !isAiMetricValueValid(metric, value) ||
          !Number.isFinite(mins[index]) ||
          maxs[index] === mins[index]
        ) {
          return null;
        }

        const normalized = (value - mins[index]) / (maxs[index] - mins[index]);
        return getAiMetricDirection(metric, chartDefinition) === 'lower'
          ? 1 - normalized
          : normalized;
      }),
    );
  }

  return normalizedRows;
}

export function rankAiHardwareKeys<T extends AiMetricPoint>(
  points: readonly T[],
  options: RankAiHardwareOptions,
): string[] {
  const direction = getAiMetricDirection(options.metric, options.chartDefinition);
  const bestByHardware = new Map<string, number>();

  for (const point of points) {
    const hwKey = point.hwKey ?? '';
    if (!hwKey) continue;

    const value = readAiMetric(point, options.metricPath, options.metric);
    if (value === null) continue;

    const existing = bestByHardware.get(hwKey);
    if (existing === undefined || (direction === 'lower' ? value < existing : value > existing)) {
      bestByHardware.set(hwKey, value);
    }
  }

  const compare = (left: number, right: number) =>
    direction === 'lower' ? left - right : right - left;

  if (!options.distinctGpus) {
    return [...bestByHardware.entries()]
      .toSorted(([, left], [, right]) => compare(left, right))
      .slice(0, options.topN)
      .map(([hwKey]) => hwKey);
  }

  const bestPerGpu = new Map<string, { hwKey: string; value: number }>();
  for (const [hwKey, value] of bestByHardware) {
    const baseGpu = hwKey.split('_')[0];
    const existing = bestPerGpu.get(baseGpu);
    if (!existing || compare(value, existing.value) < 0) {
      bestPerGpu.set(baseGpu, { hwKey, value });
    }
  }

  return [...bestPerGpu.values()]
    .toSorted((left, right) => compare(left.value, right.value))
    .slice(0, options.topN)
    .map(({ hwKey }) => hwKey);
}

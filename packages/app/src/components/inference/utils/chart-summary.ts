/**
 * Screen-reader overview of an inference scatter chart.
 *
 * The chart's SVG is exposed as one image with this overview, so assistive
 * tech hears what the chart is, what each axis measures and how each
 * configuration performs, rather than walking every tick label and point.
 * Values are written out in full (no "285M"), configurations are named by
 * what they are, never by their colour.
 */

export interface SummarySeries {
  /** What the series is, e.g. "Vera Rubin NVL72 FP4 (Dynamo TRTLLM)". */
  name: string;
  points: readonly { x: number; y: number }[];
}

export interface ChartSummaryInput {
  locale: 'en' | 'zh';
  xLabel: string;
  yLabel: string;
  series: readonly SummarySeries[];
}

export interface ChartSummary {
  /** Short accessible name: what the chart plots. */
  label: string;
  /** Overview: chart type, axes and their ranges, then each configuration. */
  description: string;
}

const STRINGS = {
  en: {
    label: (y: string, x: string) => `${y} versus ${x}`,
    type: (count: number) =>
      `Line chart with ${count} ${count === 1 ? 'configuration' : 'configurations'}, one line each.`,
    empty: 'Line chart with no configurations selected.',
    axis: (axis: 'X' | 'Y', label: string, min: string, max: string) =>
      `${axis} axis: ${label}, values from ${min} to ${max}.`,
    series: (name: string, count: number, y: string, x: string) =>
      `${name}: ${count} ${count === 1 ? 'point' : 'points'}, highest Y value ${y} at X value ${x}.`,
  },
  zh: {
    label: (y: string, x: string) => `${y} 与 ${x}`,
    type: (count: number) => `折线图，共 ${count} 个配置，每个配置一条线。`,
    empty: '折线图，未选择任何配置。',
    axis: (axis: 'X' | 'Y', label: string, min: string, max: string) =>
      `${axis} 轴：${label}，数值从 ${min} 到 ${max}。`,
    series: (name: string, count: number, y: string, x: string) =>
      `${name}：${count} 个数据点，Y 轴最高值 ${y}，对应 X 轴数值 ${x}。`,
  },
} as const;

function extent(values: readonly number[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? [min, max] : null;
}

export function buildChartSummary({
  locale,
  xLabel,
  yLabel,
  series,
}: ChartSummaryInput): ChartSummary {
  const t = STRINGS[locale];
  const format = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumSignificantDigits: 3,
  }).format;
  const label = t.label(yLabel, xLabel);
  const withPoints = series.filter((entry) =>
    entry.points.some((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  );
  if (withPoints.length === 0) return { label, description: t.empty };

  const all = withPoints.flatMap((entry) => entry.points);
  const parts: string[] = [t.type(withPoints.length)];
  const xRange = extent(all.map((point) => point.x));
  const yRange = extent(all.map((point) => point.y));
  if (xRange) parts.push(t.axis('X', xLabel, format(xRange[0]), format(xRange[1])));
  if (yRange) parts.push(t.axis('Y', yLabel, format(yRange[0]), format(yRange[1])));

  // Highest-y first, matching how the plot reads top to bottom.
  const peaks = withPoints
    .map((entry) => {
      const valid = entry.points.filter(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      );
      const peak = valid.reduce((best, point) => (point.y > best.y ? point : best));
      return { entry, peak, count: valid.length };
    })
    .toSorted((a, b) => b.peak.y - a.peak.y || a.entry.name.localeCompare(b.entry.name));
  for (const { entry, peak, count } of peaks) {
    parts.push(t.series(entry.name, count, format(peak.y), format(peak.x)));
  }
  return { label, description: parts.join(' ') };
}

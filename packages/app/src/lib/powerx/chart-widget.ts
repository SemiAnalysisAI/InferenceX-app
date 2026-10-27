import type { PanelLine, PanelMarker } from '@/components/inference/ui/PowerPanelPlot';
import type { InferenceSeriesEntry } from '@/lib/views-api/series';

import { snapTo } from './widget-hash';

/** Pure helpers behind the "Live chart" widget on /powerx/tutorial. */

export const CHART_METRICS = ['energy', 'power'] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];
export const DEFAULT_CHART_METRIC: ChartMetric = 'energy';

/** The pair with validated power on both metrics; the 8k/1k sequence carries no P90 points yet. */
export const CHART_PRESET = {
  model: 'DeepSeek-V4-Pro',
  sequence: 'agentic-traces',
  gpus: ['b200', 'mi355x'],
  precisions: 'fp4',
} as const;

export const CHART_METRIC_KEYS: Record<ChartMetric, string> = {
  energy: 'y_measuredJPerOutputToken',
  power: 'y_measuredP90Power',
};

export function chartViewUrl(metric: ChartMetric): string {
  const params = new URLSearchParams({
    model: CHART_PRESET.model,
    sequence: CHART_PRESET.sequence,
    gpus: CHART_PRESET.gpus.join(','),
    precisions: CHART_PRESET.precisions,
    metric: CHART_METRIC_KEYS[metric],
  });
  return `/api/v1/views/inference?${params.toString()}`;
}

export function chartDashboardUrl(metric: ChartMetric): string {
  const params = new URLSearchParams({ i_metric: CHART_METRIC_KEYS[metric] });
  return `/inference?${params.toString()}`;
}

export interface ChartViewResponse {
  series: readonly InferenceSeriesEntry[];
  xAxis: { label: string };
  metric: { label: string; labelZh: string; unit: string | null };
  count: number;
}

export interface ChartPanelData {
  markers: PanelMarker[];
  lines: PanelLine[];
  legend: { key: string; label: string; points: number }[];
}

/** Flattens the views-API series into PowerPanelPlot markers and one sorted line per series. */
export function toPanelData(
  response: ChartViewResponse,
  colorOf: (hwKey: string) => string,
  tooltip: (series: InferenceSeriesEntry, point: InferenceSeriesEntry['points'][number]) => string,
): ChartPanelData {
  const markers: PanelMarker[] = [];
  const lines: PanelLine[] = [];
  const legend: ChartPanelData['legend'] = [];
  for (const series of response.series) {
    const points = series.points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .toSorted((a, b) => a.x - b.x);
    if (points.length === 0) continue;
    for (const point of points) {
      markers.push({
        key: series.hwKey,
        x: point.x,
        y: point.y,
        tooltip: tooltip(series, point),
      });
    }
    lines.push({
      key: series.hwKey,
      color: colorOf(series.hwKey),
      points: points.map((point) => ({ x: point.x, y: point.y })),
    });
    legend.push({ key: series.hwKey, label: series.label, points: points.length });
  }
  return { markers, lines, legend };
}

export const encodeChartMetric = (metric: ChartMetric): string => metric;
export const decodeChartMetric = (raw: string | null): ChartMetric =>
  snapTo(raw ?? undefined, CHART_METRICS, DEFAULT_CHART_METRIC);

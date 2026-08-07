'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';

import { chartPoints, collectiveXColorKey, collectiveXRunDasharray, fitAlphaBeta } from './data';
import type {
  CollectiveXChartPoint,
  CollectiveXOperation,
  CollectiveXPercentile,
  CollectiveXRunSeries,
  CollectiveXYAxis,
} from './types';

interface CollectiveXChartProps {
  chartId: string;
  series: CollectiveXRunSeries[];
  colors: Record<string, string>;
  operation: CollectiveXOperation;
  percentile: CollectiveXPercentile;
  yAxis: CollectiveXYAxis;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

const OPERATION_LABELS: Record<CollectiveXOperation, string> = {
  dispatch: 'Dispatch',
  stage: 'Stage',
  combine: 'Combine',
  roundtrip: 'Round trip (measured)',
};

const Y_AXIS_LABELS: Record<CollectiveXYAxis, string> = {
  latency: 'Latency (µs)',
  'tokens-per-second': 'Token rate at selected latency percentile (tokens/s)',
  'activation-rate': 'Activation-data rate at selected latency percentile (GB/s)',
  'payload-rate': 'Payload bandwidth at selected latency percentile (GB/s, per chip)',
};

function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 10];
  const min = d3.min(values) ?? 1;
  const max = d3.max(values) ?? 1;
  return min === max ? [min / 2, max * 2] : [min / 1.08, max * 1.08];
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(value < 1e10 ? 1 : 0)}G`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value < 1e7 ? 1 : 0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value < 1e4 ? 1 : 0)}k`;
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(value < 3 ? 1 : 0);
  return value.toFixed(2);
}

function formatTokenCount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : formatCompact(value);
}

function formatMetric(value: number, yAxis: CollectiveXYAxis): string {
  if (yAxis === 'latency') return `${value.toFixed(value >= 100 ? 0 : 1)} µs`;
  if (yAxis === 'tokens-per-second') return `${formatCompact(value)} tok/s`;
  return `${value.toFixed(value >= 100 ? 0 : 2)} GB/s`;
}

function formatPercentiles(
  value: CollectiveXRunSeries['points'][number]['components']['dispatch'],
): string {
  if (value === null) return 'unavailable';
  return `${value.latency_us.p50.toFixed(1)} / ${value.latency_us.p90.toFixed(1)} / ${value.latency_us.p95.toFixed(1)} / ${value.latency_us.p99.toFixed(1)} µs`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function CollectiveXChart({
  chartId,
  series,
  colors,
  operation,
  percentile,
  yAxis,
  caption,
  legendElement,
  testId,
}: CollectiveXChartProps) {
  const points = useMemo(
    () => chartPoints(series, operation, percentile, yAxis),
    [series, operation, percentile, yAxis],
  );
  const seriesById = useMemo(() => new Map(series.map((item) => [item.series_id, item])), [series]);
  // Per-series α/β fit for the current operation (p50). β is the per-GPU
  // bandwidth term, α the fixed overhead; surfaced in the tooltip. Null when a
  // series has too few points / a degenerate byte axis to fit.
  const fitsBySeries = useMemo(
    () => new Map(series.map((item) => [item.series_id, fitAlphaBeta(item, operation)])),
    [series, operation],
  );
  const lines = useMemo(() => {
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const point of points) {
      (result[point.seriesId] ??= []).push({ x: point.x, y: point.y });
    }
    for (const line of Object.values(result)) {
      line.sort((a, b) => a.x - b.x);
    }
    return result;
  }, [points]);

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(() => paddedDomain(points.map((point) => point.y)), [points]);
  const xTickValues = useMemo(
    () => [...new Set(points.map((point) => point.x))].toSorted((a, b) => a - b),
    [points],
  );

  const noDataOverlay =
    points.length === 0 ? (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-sm text-muted-foreground">
          {series.length > 0
            ? `${OPERATION_LABELS[operation]} is unavailable for the selected series.`
            : 'No matching CollectiveX series.'}
        </p>
      </div>
    ) : undefined;

  return (
    <D3Chart<CollectiveXChartPoint>
      chartId={chartId}
      data={points}
      height={560}
      margin={{ top: 24, right: 20, bottom: 62, left: 78 }}
      watermark="logo"
      testId={testId}
      grabCursor
      instructions="Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip"
      xScale={{ type: 'log', domain: xDomain, nice: false }}
      yScale={{ type: 'log', domain: yDomain, nice: false }}
      xAxis={{
        label: 'Source tokens / rank (log)',
        tickCount: 8,
        tickValues: xTickValues,
        tickFormat: (value) => formatTokenCount(Number(value)),
      }}
      yAxis={{
        label: Y_AXIS_LABELS[yAxis],
        tickCount: 5,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      layers={[
        {
          type: 'line',
          key: 'collectivex-lines',
          lines,
          config: {
            getColor: (key) => {
              const item = seriesById.get(key);
              return colors[item ? collectiveXColorKey(item) : ''] ?? '#888';
            },
            getStrokeDasharray: (key) => {
              const item = seriesById.get(key);
              return item ? collectiveXRunDasharray(item.run_index) : 'none';
            },
            strokeWidth: 2.25,
            curve: d3.curveLinear,
          },
        },
        {
          type: 'point',
          key: 'collectivex-points',
          data: points,
          config: {
            getCx: () => 0,
            getCy: () => 0,
            getX: (point) => point.x,
            getY: (point) => point.y,
            getColor: (point) => colors[point.colorKey] ?? '#888',
            getRadius: () => 3.5,
            stroke: 'var(--background)',
            strokeWidth: 1,
            keyFn: (point) => `${point.seriesId}-${point.x}`,
            maxPoints: Infinity,
          },
        },
      ]}
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [1, 20],
        resetEventName: `collectivex_zoom_reset_${chartId}`,
      }}
      tooltip={{
        rulerType: 'crosshair',
        attachToLayer: 1,
        content: (point, isPinned) => {
          const color = colors[point.colorKey] ?? '#888';
          const measurement = point.point;
          const measuredRoundtrip = measurement.components.roundtrip;
          const fit = fitsBySeries.get(point.seriesId);
          const fitLine = fit
            ? `<div class="mt-1 text-muted-foreground">Fit β=${fit.betaGbps.toFixed(fit.betaGbps >= 100 ? 0 : 1)} GB/s · α=${fit.alphaUs.toFixed(1)} µs (p50, per chip)</div>`
            : '';
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${escapeHtml(OPERATION_LABELS[operation])} ${yAxis === 'latency' ? percentile : `at ${percentile} latency`}: <strong>${formatMetric(point.y, yAxis)}</strong></div>
            <div class="text-muted-foreground">${measurement.tokens_per_rank} tokens/rank · ${measurement.global_tokens} global tokens</div>
            <div class="mt-1 text-muted-foreground">Latency p50 / p90 / p95 / p99</div>
            <div class="text-muted-foreground">Dispatch: ${formatPercentiles(measurement.components.dispatch)}</div>
            <div class="text-muted-foreground">Stage: ${formatPercentiles(measurement.components.stage)}</div>
            <div class="text-muted-foreground">Combine: ${formatPercentiles(measurement.components.combine)}</div>
            <div class="text-muted-foreground">Round trip: ${formatPercentiles(measuredRoundtrip)}${measuredRoundtrip ? ' (measured)' : ''}</div>
            ${fitLine}
          </div>`;
        },
        getRulerX: (point, scale) =>
          (scale as d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>)(point.x),
        getRulerY: (point, scale) => scale(point.y),
        onHoverStart: (selection) => {
          selection.attr('r', 6);
        },
        onHoverEnd: (selection) => {
          selection.attr('r', 3.5);
        },
      }}
      transitionDuration={200}
      legendElement={legendElement}
      noDataOverlay={noDataOverlay}
      caption={caption}
    />
  );
}

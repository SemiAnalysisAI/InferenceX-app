'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';

import { sparseLogTicks } from './axis';
import { chartPoints, collectiveXColorKey, collectiveXTopologyLabel } from './data';
import type {
  CollectiveXChartPoint,
  CollectiveXOperation,
  CollectiveXPercentile,
  CollectiveXSeries,
  CollectiveXScale,
  CollectiveXXAxis,
  CollectiveXYAxis,
} from './types';

interface CollectiveXChartProps {
  chartId: string;
  series: CollectiveXSeries[];
  colors: Record<string, string>;
  operation: CollectiveXOperation;
  percentile: CollectiveXPercentile;
  xAxis: CollectiveXXAxis;
  yAxis: CollectiveXYAxis;
  xScaleType: CollectiveXScale;
  yScaleType: CollectiveXScale;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

const OPERATION_LABELS: Record<CollectiveXOperation, string> = {
  dispatch: 'Dispatch',
  stage: 'Stage',
  combine: 'Combine',
  roundtrip: 'Round trip (measured)',
  'isolated-sum': 'Isolated sum (Σp, not measured)',
};

const X_AXIS_LABELS: Record<CollectiveXXAxis, string> = {
  'tokens-per-rank': 'Source tokens / rank',
  'global-tokens': 'Global source tokens',
};

const Y_AXIS_LABELS: Record<CollectiveXYAxis, string> = {
  latency: 'Latency (µs)',
  'tokens-per-second': 'Token rate at selected latency percentile (tokens/s)',
  'activation-rate': 'Activation-data rate at selected latency percentile (GB/s)',
  'total-logical-rate': 'Total logical data rate at selected latency percentile (GB/s)',
};

function paddedDomain(values: number[], scaleType: CollectiveXScale): [number, number] {
  if (values.length === 0) return scaleType === 'log' ? [1, 10] : [0, 1];
  const min = d3.min(values) ?? 0;
  const max = d3.max(values) ?? 1;
  if (min === max) {
    if (scaleType === 'log') return [Math.max(min / 2, Number.MIN_VALUE), max * 2];
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    return [min - padding, max + padding];
  }
  if (scaleType === 'log') return [min / 1.08, max * 1.08];
  const padding = (max - min) * 0.06;
  return [Math.max(0, min - padding), max + padding];
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
  value: CollectiveXSeries['points'][number]['components']['dispatch'],
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
  xAxis,
  yAxis,
  xScaleType,
  yScaleType,
  caption,
  legendElement,
  testId,
}: CollectiveXChartProps) {
  const points = useMemo(
    () => chartPoints(series, operation, percentile, xAxis, yAxis),
    [series, operation, percentile, xAxis, yAxis],
  );
  const seriesById = useMemo(() => new Map(series.map((item) => [item.series_id, item])), [series]);
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

  const xDomain = useMemo(
    () =>
      paddedDomain(
        points.map((point) => point.x),
        xScaleType,
      ),
    [points, xScaleType],
  );
  const yDomain = useMemo(
    () =>
      paddedDomain(
        points.map((point) => point.y),
        yScaleType,
      ),
    [points, yScaleType],
  );
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
      xScale={
        xScaleType === 'log'
          ? { type: 'log', domain: xDomain, nice: false }
          : { type: 'linear', domain: xDomain, nice: true }
      }
      yScale={{ type: yScaleType, domain: yDomain, nice: yScaleType === 'linear' }}
      xAxis={{
        label: `${X_AXIS_LABELS[xAxis]}${xScaleType === 'log' ? ' (log)' : ''}`,
        tickCount: 8,
        tickValues: xTickValues,
        tickFormat: (value) => formatTokenCount(Number(value)),
      }}
      yAxis={{
        label: Y_AXIS_LABELS[yAxis],
        tickCount: 5,
        tickValues:
          yScaleType === 'log'
            ? (scale) => sparseLogTicks(scale.domain().map(Number), 5)
            : undefined,
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
          const eplb = point.series.eplb;
          const eplbDetails = eplb.enabled
            ? `${escapeHtml(eplb.planner ?? 'enabled')} · ${eplb.physical_experts}/${eplb.logical_experts} physical/logical · ${eplb.redundant_experts} redundant · ${eplb.replicated_experts} replicated (max ${eplb.max_replicas ?? 'n/a'}x) · reference T=${eplb.reference_tokens_per_rank ?? 'n/a'} · imbalance ${eplb.imbalance_before?.toFixed(3) ?? 'n/a'} -> ${eplb.imbalance_after?.toFixed(3) ?? 'n/a'}`
            : `off · ${eplb.logical_experts} logical experts`;
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${escapeHtml(OPERATION_LABELS[operation])} ${yAxis === 'latency' ? percentile : `at ${percentile} latency`}: <strong>${formatMetric(point.y, yAxis)}</strong> · ${escapeHtml(point.series.status)}</div>
            <div class="text-muted-foreground">${measurement.tokens_per_rank} tokens/rank · ${measurement.global_tokens} global tokens</div>
            <div class="mt-1 text-muted-foreground">Dispatch p50/p90/p95/p99: ${formatPercentiles(measurement.components.dispatch)}</div>
            <div class="text-muted-foreground">Stage p50/p90/p95/p99: ${formatPercentiles(measurement.components.stage)}</div>
            <div class="text-muted-foreground">Combine p50/p90/p95/p99: ${formatPercentiles(measurement.components.combine)}</div>
            <div class="text-muted-foreground">Round trip p50/p90/p95/p99: ${formatPercentiles(measuredRoundtrip)}${measuredRoundtrip ? ' (measured)' : ''}</div>
            <div class="text-muted-foreground">Fan-out: ${measurement.routing.fanout_mean.toFixed(2)} · routed copies: ${measurement.routing.routed_copies} · recv max: ${measurement.routing.recv_tokens_max}</div>
            <div class="text-muted-foreground">Expert CV: ${measurement.routing.expert_load_cv.toFixed(3)} · rank CV: ${measurement.routing.payload_rank_cv.toFixed(3)} · hotspot: ${measurement.routing.hotspot_ratio.toFixed(2)}x · empty experts/ranks: ${measurement.routing.empty_expert_count}/${measurement.routing.empty_rank_count}</div>
            <div class="text-muted-foreground">Correctness: semantic ${measurement.correctness.semantic_pass ? 'pass' : 'fail'} · precision ${measurement.correctness.precision.passed ? 'pass' : 'fail'} · EPLB: ${eplbDetails}</div>
            <div class="text-muted-foreground">Stability: Q${measurement.stability.qualification_indices.join('/')} · p50 ${measurement.stability.p50_max_min_ratio?.toFixed(3) ?? '-'}x · p99 ${measurement.stability.p99_max_min_ratio?.toFixed(3) ?? '-'}x</div>
            ${measurement.anomalies.length > 0 ? `<div class="text-muted-foreground">Anomalies: ${measurement.anomalies.map(escapeHtml).join(' · ')}</div>` : ''}
            ${eplb.mapping_sha256 ? `<div class="text-muted-foreground" style="word-break: break-all;">EPLB mapping SHA-256: ${escapeHtml(eplb.mapping_sha256)}</div>` : ''}
            <div class="mt-1 text-muted-foreground">Mode: ${escapeHtml(point.series.mode)} · payload unit: ${escapeHtml(point.series.measurement.payload_unit)} · combine: ${escapeHtml(point.series.measurement.combine_semantics)}</div>
            <div class="text-muted-foreground">Topology: EP${point.series.system.ep_size} · ${escapeHtml(point.series.system.scope)} · ${escapeHtml(collectiveXTopologyLabel(point.series.system))}</div>
            <div class="text-muted-foreground">${escapeHtml(point.series.measurement.contract)} · ${escapeHtml(point.series.suite)}</div>
            <div class="text-muted-foreground">${escapeHtml(point.series.workload.precision_profile)} · dispatch ${escapeHtml(point.series.workload.dispatch_precision.communication_format)} · combine ${escapeHtml(point.series.workload.combine_precision.communication_format)}</div>
            <div class="text-muted-foreground">${escapeHtml(point.series.workload.routing)}${point.series.workload.eplb ? '+eplb' : ''}</div>
            <div class="mt-1 text-muted-foreground">workload=${escapeHtml(point.series.workload.workload_id.slice(0, 24))} · allocations=${point.series.allocation_ids.length}</div>
            <div class="text-muted-foreground" style="word-break: break-all;">point=${escapeHtml(measurement.point_id)}</div>
            <div class="text-muted-foreground">evidence=${measurement.evidence_ids.map((id) => escapeHtml(id.slice(-8))).join(' · ')}</div>
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

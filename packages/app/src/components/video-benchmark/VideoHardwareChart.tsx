'use client';

import { curveLinear, type Selection } from 'd3';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml } from '@/lib/utils';
import { paretoFrontier } from './frontier';
import { hardwareLabel } from './hardware';
import { formatMetric, metricLabel, metricValue, VIDEO_METRICS, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';
import type { VideoDashboardState } from './video-url-state';

export const VIDEO_CHART_ID = 'video-hardware';
/** Matches ChartSection's default `${analyticsPrefix}_zoom_reset_${chartId}`. */
export const VIDEO_ZOOM_RESET_EVENT = `video_zoom_reset_${VIDEO_CHART_ID}`;

export interface PlottedVideoPoint extends VideoPoint {
  x: number;
  y: number;
  color: string;
  label: string;
}

/**
 * Points with both axes available (newest observation per hardware cell), the
 * cross-hardware Pareto hull over the C1 cells, and per-hardware queueing tails
 * (C1→C2→C4) when the load control shows them.
 */
export function plotVideoPoints(
  points: VideoPoint[],
  state: VideoDashboardState,
  colorFor: (hardwareKey: string) => string,
  hidden: ReadonlySet<string>,
) {
  const options = { tier: state.tier, basis: state.basis };
  const plotted: PlottedVideoPoint[] = latestVideoCells(points).flatMap((p) => {
    if (!p.hardwareKey || hidden.has(p.hardwareKey)) return [];
    if (!state.queue && p.concurrency !== 1) return [];
    const x = metricValue(p, state.x, options);
    const y = metricValue(p, state.y, options);
    if (x === null || y === null) return [];
    return [{ ...p, x, y, color: colorFor(p.hardwareKey), label: hardwareLabel(p.hardwareKey) }];
  });
  const frontier = paretoFrontier(
    plotted.filter((p) => p.concurrency === 1),
    VIDEO_METRICS[state.x].polarity,
    VIDEO_METRICS[state.y].polarity,
  );
  const optimal = new Set(frontier.map((p) => p.hardwareKey));
  const visible = state.optimal ? plotted.filter((p) => optimal.has(p.hardwareKey)) : plotted;
  const tails: Record<string, { x: number; y: number }[]> = {};
  if (state.queue)
    for (const p of visible) {
      if (!p.hardwareKey) continue;
      (tails[p.hardwareKey] ??= []).push({ x: p.x, y: p.y });
    }
  for (const key of Object.keys(tails)) {
    tails[key].sort((a, b) => a.x - b.x);
    if (tails[key].length < 2) delete tails[key];
  }
  return { plotted: visible, frontier, tails };
}

const STRINGS = {
  en: {
    hull: 'Dashed hull joins the Pareto-optimal hardware at C1. Dotted tails show C2/C4 client concurrency on the batch-one server: requests queue, throughput stays flat, so they are evidence, not a frontier.',
    controls:
      'Shift+scroll to zoom; drag to pan; double-click to reset. Click a point to pin its details.',
    n: 'valid samples',
    run: 'run',
    noData: 'No hardware has both selected metrics for this configuration.',
  },
  zh: {
    hull: '虚线包络连接 C1 下 Pareto 最优的硬件；点线尾迹是 batch-one 服务器上 C2/C4 客户端并发的结果：请求排队、吞吐量基本持平，因此只是证据，不构成前沿。',
    controls: 'Shift+滚轮缩放，拖动平移，双击重置。点击数据点可固定详情。',
    n: '有效样本',
    run: '运行',
    noData: '当前配置下没有硬件同时具备所选的两个指标。',
  },
};

export default function VideoHardwareChart({
  points,
  state,
  colorFor,
  hidden,
  onSelect,
}: {
  points: VideoPoint[];
  state: VideoDashboardState;
  colorFor: (hardwareKey: string) => string;
  hidden: ReadonlySet<string>;
  onSelect?: (point: VideoPoint) => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const options = { tier: state.tier, basis: state.basis };
  const { plotted, frontier, tails } = plotVideoPoints(points, state, colorFor, hidden);
  const xLabel = metricLabel(state.x, locale, options);
  const yLabel = metricLabel(state.y, locale, options);
  const drawLabels = (
    group: Selection<SVGGElement, unknown, null, undefined>,
    x: ContinuousScale,
    y: ContinuousScale,
  ) => {
    group
      .selectAll<SVGTextElement, PlottedVideoPoint>('text.video-point-label')
      .data(plotted, (p) => p.id)
      .join('text')
      .attr('class', 'video-point-label')
      .attr('x', (p) => x(p.x) + 10)
      .attr('y', (p) => y(p.y) - 10)
      .attr('font-size', px(CHART_TYPE.axisLabel))
      .attr('font-weight', (p) => (p.concurrency === 1 ? 600 : 400))
      .attr('fill', 'var(--foreground)')
      .attr('pointer-events', 'none')
      .text((p) => (p.concurrency === 1 ? p.label : `C${p.concurrency}`));
  };
  const maxX = Math.max(0, ...plotted.map((p) => p.x));
  const maxY = Math.max(0, ...plotted.map((p) => p.y));
  return (
    <D3Chart
      chartId={VIDEO_CHART_ID}
      testId="video-hardware-chart"
      data={plotted}
      height={440}
      margin={{ top: 20, right: 28, bottom: 80, left: 85 }}
      watermark="logo"
      transitionDuration={0}
      xScale={{ type: 'linear', domain: [0, maxX * 1.12 || 1], nice: true }}
      yScale={{ type: 'linear', domain: [0, maxY * 1.15 || 1], nice: true }}
      xAxis={{ label: xLabel, tickCount: 6 }}
      yAxis={{ label: yLabel, tickCount: 6 }}
      layers={[
        {
          type: 'roofline',
          key: 'pareto-hull',
          rooflines: frontier.length > 1 ? { hull: frontier.map((p) => ({ x: p.x, y: p.y })) } : {},
          config: {
            getColor: () => 'var(--foreground)',
            strokeWidth: 1.5,
            strokeDasharray: '6 4',
            curve: curveLinear,
          },
        },
        {
          type: 'line',
          key: 'queueing-tails',
          lines: tails,
          config: {
            getColor: (key) => colorFor(key),
            getStrokeDasharray: () => '2 4',
            strokeWidth: 1.5,
            curve: curveLinear,
          },
        },
        {
          type: 'point',
          data: plotted,
          config: {
            getCx: () => 0,
            getCy: () => 0,
            getX: (p) => p.x,
            getY: (p) => p.y,
            getColor: (p) => p.color,
            getRadius: (p) => (p.concurrency === 1 ? 7 : 4),
            stroke: 'var(--foreground)',
            strokeWidth: 1,
            keyFn: (p) => p.id,
          },
        },
        {
          type: 'custom',
          key: 'video-point-labels',
          render: (group, ctx) => {
            drawLabels(
              group,
              (ctx.renderedXScale ?? ctx.xScale) as ContinuousScale,
              (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale,
            );
          },
          onZoom: (group, ctx) =>
            drawLabels(group, ctx.newXScale as ContinuousScale, ctx.newYScale as ContinuousScale),
        },
      ]}
      tooltip={{
        rulerType: 'none',
        content: (p) =>
          `<div class="p-3 text-sm"><strong>${escapeHtml(p.label)}</strong> · C${p.concurrency ?? '?'}<br/>${escapeHtml(xLabel)}: ${formatMetric(p.x, state.x)}<br/>${escapeHtml(yLabel)}: ${formatMetric(p.y, state.y)}<br/>${s.n}: ${p.samples} · ${s.run} #${escapeHtml(p.runId)}</div>`,
        onPointClick: onSelect,
      }}
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [1, 20],
        resetEventName: VIDEO_ZOOM_RESET_EVENT,
      }}
      instructions={s.controls}
      noDataOverlay={
        plotted.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {s.noData}
          </p>
        ) : undefined
      }
      caption={<p className="text-xs text-muted-foreground">{s.hull}</p>}
    />
  );
}

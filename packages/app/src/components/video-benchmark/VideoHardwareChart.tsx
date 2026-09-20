'use client';

import { curveLinear, type Selection } from 'd3';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml } from '@/lib/utils';
import { zeroAnchoredDomain } from './chart-domain';
import { layoutLabel } from './deployment';
import { formatMetric, metricLabel, type VideoPoint } from './metrics';
import { plotVideoPoints, type PlottedVideoPoint } from './plot';
import { metricOptions, type VideoDashboardState } from './video-url-state';

export const VIDEO_CHART_ID = 'video-hardware';
/** Matches ChartSection's default `${analyticsPrefix}_zoom_reset_${chartId}`. */
export const VIDEO_ZOOM_RESET_EVENT = `video_zoom_reset_${VIDEO_CHART_ID}`;

const STRINGS = {
  en: {
    single: (layouts: string) =>
      `One deployment measured per hardware so far (${layouts}), so each hardware is a single point. A per-hardware Pareto curve needs the GPUs-per-video sweep.`,
    multi:
      "Solid lines join each hardware's Pareto-optimal deployments (GPUs per video and model split); faded points are dominated deployments.",
    global: 'Dashed line: cross-hardware Pareto frontier over all deployments.',
    globalOne:
      'Cross-hardware Pareto frontier: one hardware dominates, so there is no line to draw.',
    queued:
      'Small faded markers: C2/C4 client concurrency on the same batch-one deployment. Requests queue and throughput stays flat, so they are evidence, never joined into a curve.',
    controls:
      'Shift+scroll to zoom; drag to pan; double-click to reset. Click a point to pin its details.',
    deployment: 'Deployment',
    queuedTag: 'queued',
    n: 'valid samples',
    run: 'run',
    noData: 'No hardware has both selected metrics for this configuration.',
  },
  zh: {
    single: (layouts: string) =>
      `目前每种硬件只测得一种部署（${layouts}），因此每种硬件只有一个点；要得到各硬件自己的 Pareto 曲线，还需扫描每条视频占用的 GPU 数。`,
    multi:
      '实线连接同一硬件的 Pareto 最优部署（每条视频占用的 GPU 数及模型切分方式）；淡色点为被支配的部署。',
    global: '虚线为所有部署的跨硬件 Pareto 前沿。',
    globalOne: '跨硬件 Pareto 前沿：有一种硬件全面占优，因此没有可画的连线。',
    queued:
      '小号淡色标记为同一 batch-one 部署上的 C2/C4 客户端并发：请求排队、吞吐量持平，仅作为证据展示，不连成曲线。',
    controls: 'Shift+滚轮缩放，拖动平移，双击重置。点击数据点可固定详情。',
    deployment: '部署',
    queuedTag: '排队',
    n: '有效样本',
    run: '运行',
    noData: '当前配置下没有硬件同时具备所选的两个指标。',
  },
};

const faded = (color: string) => `color-mix(in oklab, ${color} 45%, transparent)`;

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
  const options = metricOptions(state);
  const { plotted, frontiers, global, multiLayout } = plotVideoPoints(
    points,
    state,
    colorFor,
    hidden,
  );
  const xLabel = metricLabel(state.x, locale, options);
  const yLabel = metricLabel(state.y, locale, options);
  const lines: Record<string, { x: number; y: number }[]> = {};
  const lineColors: Record<string, string> = {};
  for (const [key, frontier] of Object.entries(frontiers)) {
    if (frontier.length < 2) continue;
    lines[key] = frontier.map((p) => ({ x: p.x, y: p.y }));
    lineColors[key] = frontier[0].color;
  }
  const layouts = [
    ...new Set(plotted.filter((p) => !p.queued).map((p) => layoutLabel(p, locale))),
  ].join(locale === 'zh' ? '；' : '; ');
  const colon = locale === 'zh' ? '：' : ': ';
  const queuedTag = locale === 'zh' ? `（${s.queuedTag}）` : ` (${s.queuedTag})`;
  const pointLabel = (p: PlottedVideoPoint) => {
    if (p.queued) return `C${p.concurrency}`;
    return multiLayout ? `${p.label} · ${layoutLabel(p, locale)}` : p.label;
  };
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
      .attr('font-weight', (p) => (p.optimal ? 600 : 400))
      .attr('fill', (p) => (p.optimal ? 'var(--foreground)' : 'var(--muted-foreground)'))
      .attr('pointer-events', 'none')
      .text(pointLabel);
  };
  const xDomain = zeroAnchoredDomain(
    plotted.map((p) => p.x),
    1.12,
  );
  // Profit per GPU-hour goes negative when the API price misses the tier cost: those
  // points stay on the canvas, and when every hardware loses money the top is break-even.
  const yDomain = zeroAnchoredDomain(
    plotted.map((p) => p.y),
    1.15,
  );
  const caption = [
    multiLayout ? s.multi : s.single(layouts || '—'),
    state.frontier ? (global.length > 1 ? s.global : s.globalOne) : null,
    state.queue && !state.optimal ? s.queued : null,
  ].filter((text): text is string => text !== null);
  return (
    <D3Chart
      chartId={VIDEO_CHART_ID}
      testId="video-hardware-chart"
      data={plotted}
      height={440}
      margin={{ top: 20, right: 28, bottom: 80, left: 85 }}
      watermark="logo"
      transitionDuration={0}
      xScale={{ type: 'linear', domain: xDomain, nice: true }}
      yScale={{ type: 'linear', domain: yDomain, nice: true }}
      xAxis={{ label: xLabel, tickCount: 6 }}
      yAxis={{ label: yLabel, tickCount: 6 }}
      layers={[
        {
          type: 'roofline',
          key: 'pareto-global',
          rooflines:
            state.frontier && global.length > 1
              ? { global: global.map((p) => ({ x: p.x, y: p.y })) }
              : {},
          config: {
            getColor: () => 'var(--foreground)',
            strokeWidth: 1.5,
            strokeDasharray: '6 4',
            curve: curveLinear,
          },
        },
        {
          type: 'line',
          key: 'hardware-frontiers',
          lines,
          config: {
            getColor: (key) => lineColors[key] ?? 'var(--foreground)',
            strokeWidth: 2,
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
            getColor: (p) => (p.queued || !p.optimal ? faded(p.color) : p.color),
            getRadius: (p) => (p.queued ? 3.5 : p.optimal ? 7 : 5),
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
          `<div class="p-3 text-sm"><strong>${escapeHtml(p.label)}</strong> · C${p.concurrency ?? '?'}${p.queued ? queuedTag : ''}<br/>${s.deployment}${colon}${escapeHtml(layoutLabel(p, locale))}<br/>${escapeHtml(xLabel)}${colon}${formatMetric(p.x, state.x)}<br/>${escapeHtml(yLabel)}${colon}${formatMetric(p.y, state.y)}<br/>${s.n}${colon}${p.samples} · ${s.run} #${escapeHtml(p.runId)}</div>`,
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
      caption={
        <p className="text-xs text-muted-foreground" data-testid="video-chart-caption">
          {caption.join(' ')}
        </p>
      }
    />
  );
}

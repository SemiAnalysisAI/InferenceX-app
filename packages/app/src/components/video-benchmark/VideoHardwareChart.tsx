'use client';

import type { ReactNode } from 'react';
import { curveLinear, type Selection } from 'd3';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { EmptyState } from '@/components/ui/empty-state';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { axisLabelUnit, chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';
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
    multiOptimal:
      "Solid lines join each hardware's Pareto-optimal deployments (GPUs per video and model split); dominated deployments are hidden. Turn off Optimal only to show them.",
    controls: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
    deployment: 'Deployment',
    n: 'Valid samples',
    run: 'Run',
    runtime: 'Runtime',
    runLink: 'GitHub Actions run',
    noData: 'No hardware has both selected metrics for this configuration',
  },
  zh: {
    single: (layouts: string) =>
      `目前每种硬件只测得一种部署（${layouts}），因此每种硬件只有一个点；要得到各硬件自己的 Pareto 曲线，还需扫描每条视频占用的 GPU 数。`,
    multi:
      '实线连接同一硬件的 Pareto 最优部署（每条视频占用的 GPU 数及模型切分方式）；淡色点为被支配的部署。',
    multiOptimal:
      '实线连接同一硬件的 Pareto 最优部署（每条视频占用的 GPU 数及模型切分方式）；被支配的部署已隐藏，关闭“仅最优”可显示。',
    controls: 'Shift+滚轮缩放 · 拖动平移 · 双击重置',
    deployment: '部署',
    n: '有效样本',
    run: '运行',
    runtime: 'Runtime',
    runLink: 'GitHub Actions 运行记录',
    noData: '当前配置下没有硬件同时具备所选的两个指标',
  },
};

const faded = (color: string) => `color-mix(in oklab, ${color} 45%, transparent)`;

export default function VideoHardwareChart({
  points,
  state,
  colorFor,
  hidden,
  onSelect,
  legend,
  footer,
}: {
  points: VideoPoint[];
  state: VideoDashboardState;
  colorFor: (hardwareKey: string) => string;
  hidden: ReadonlySet<string>;
  onSelect?: (point: VideoPoint) => void;
  legend?: ReactNode;
  footer?: ReactNode;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const options = metricOptions(state);
  const { plotted, frontiers, multiLayout } = plotVideoPoints(points, state, colorFor, hidden);
  const xLabel = metricLabel(state.x, locale, options);
  const yLabel = metricLabel(state.y, locale, options);
  const lines: Record<string, { x: number; y: number }[]> = {};
  const lineColors: Record<string, string> = {};
  for (const [key, frontier] of Object.entries(frontiers)) {
    if (frontier.length < 2) continue;
    lines[key] = frontier.map((p) => ({ x: p.x, y: p.y }));
    lineColors[key] = frontier[0].color;
  }
  const layouts = [...new Set(plotted.map((p) => layoutLabel(p, locale)))].join(
    locale === 'zh' ? '；' : '; ',
  );
  const metrics = (p: PlottedVideoPoint, unitsOnly: boolean) => [
    { value: formatMetric(p.y, state.y), label: unitsOnly ? axisLabelUnit(yLabel) : yLabel },
    { value: formatMetric(p.x, state.x), label: unitsOnly ? axisLabelUnit(xLabel) : xLabel },
  ];
  const pointLabel = (p: PlottedVideoPoint) =>
    multiLayout ? `${p.label} · ${layoutLabel(p, locale)}` : p.label;
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
  // Both axes start at zero so per-dollar and per-video readings compare by length, not offset.
  const xDomain = zeroAnchoredDomain(
    plotted.map((p) => p.x),
    1.12,
  );
  const yDomain = zeroAnchoredDomain(
    plotted.map((p) => p.y),
    1.15,
  );
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
            getColor: (p) => (p.optimal ? p.color : faded(p.color)),
            getRadius: (p) => (p.optimal ? 7 : 5),
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
          chartHoverCard({
            title: p.label,
            subtitle: layoutLabel(p, locale),
            color: p.color,
            metrics: metrics(p, true),
            summary: `${s.n} ${p.samples} · ${s.run} #${p.runId}`,
          }),
        details: (p, _isOverlay, close) => (
          <ChartPointDetails
            title={p.label}
            subtitle={layoutLabel(p, locale)}
            color={p.color}
            metrics={metrics(p, false)}
            rows={[
              { label: s.deployment, value: layoutLabel(p, locale) },
              { label: s.n, value: String(p.samples) },
              { label: s.run, value: `#${p.runId}` },
              { label: s.runtime, value: p.runtime, wide: true },
            ]}
            links={[
              {
                action: 'run',
                label: s.runLink,
                href: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${p.runId}`,
                external: true,
              },
            ]}
            onClose={close}
          />
        ),
        getRulerX: (p, x) => (x as ContinuousScale)(p.x),
        getRulerY: (p, y) => y(p.y),
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
          {multiLayout ? (state.optimal ? s.multiOptimal : s.multi) : s.single(layouts || '—')}
        </p>
      }
      legendElement={legend}
      footer={footer}
    />
  );
}

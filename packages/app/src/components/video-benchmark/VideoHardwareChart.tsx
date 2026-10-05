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
import { qualityMeasurement } from './quality';

export const VIDEO_CHART_ID = 'video-hardware';
/** Matches ChartSection's default `${analyticsPrefix}_zoom_reset_${chartId}`. */
export const VIDEO_ZOOM_RESET_EVENT = `video_zoom_reset_${VIDEO_CHART_ID}`;

const STRINGS = {
  en: {
    single: (layouts: string) =>
      `Measured observations are shown as separate points (${layouts}). A frontier line requires distinct measured deployments for the same hardware within a comparable cohort.`,
    multi:
      'Solid lines join eligible measured frontier deployments within each hardware and comparable cohort; faded points are dominated. Segments guide the eye, without estimating unmeasured configurations.',
    multiOptimal:
      'Solid lines join eligible measured frontier deployments within each hardware and comparable cohort. Segments guide the eye, without estimating unmeasured configurations. Turn off Optimal Only to show dominated deployments.',
    controls:
      'Shift+scroll to zoom; drag to pan; double-click to reset. Click a point to pin its details.',
    deployment: 'Deployment',
    n: 'valid samples',
    run: 'run',
    noData: 'No hardware has both selected metrics for this configuration.',
    emptyCaption: 'No eligible measured points for the current filters.',
    noQuality:
      'No deployment has complete, calibrated evidence for this quality dimension. Unjudged or uncalibrated results cannot enter a quality-qualified frontier.',
    noQualityMatch:
      'No deployment meets the selected quality conditions. Review the threshold, decision status and sample coverage.',
  },
  zh: {
    single: (layouts: string) =>
      `实测观测以独立散点展示（${layouts}）。前沿连线需要同一硬件、同一可比组内不同部署的实测结果。`,
    multi:
      '实线连接同一硬件、同一可比组内符合条件的实测前沿部署；淡色点为被支配的部署。线段仅帮助读图，不估计未测量的配置。',
    multiOptimal:
      '实线连接同一硬件、同一可比组内符合条件的实测前沿部署。线段仅帮助读图，不估计未测量的配置。关闭“仅最优”可显示被支配的部署。',
    controls: 'Shift+滚轮缩放，拖动平移，双击重置。点击数据点可固定详情。',
    deployment: '部署',
    n: '有效样本',
    run: '运行',
    noData: '当前配置下没有硬件同时具备所选的两个指标。',
    emptyCaption: '当前筛选条件下没有符合条件的实测点。',
    noQuality:
      '暂无部署具备该质量维度完整且经过校准的证据。尚未评判或未经校准的结果不能进入质量合格前沿。',
    noQualityMatch: '暂无部署满足当前质量条件。请检查阈值、判定状态和样本覆盖。',
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
  const colon = locale === 'zh' ? '：' : ': ';
  const pointLabel = (p: PlottedVideoPoint) =>
    multiLayout ? `${p.label} · ${layoutLabel(p, locale)}` : p.label;
  const drawLabels = (
    group: Selection<SVGGElement, unknown, null, undefined>,
    x: ContinuousScale,
    y: ContinuousScale,
    width: number,
    height: number,
  ) => {
    const labels = group
      .selectAll<SVGTextElement, PlottedVideoPoint>('text.video-point-label')
      .data(plotted, (p) => p.id)
      .join('text')
      .attr('class', 'video-point-label')
      .attr('x', (p) => x(p.x) + 10)
      .attr('y', (p) => y(p.y) - 10)
      .attr('text-anchor', 'start')
      .attr('display', (p) =>
        x(p.x) < 0 || x(p.x) > width || y(p.y) < 0 || y(p.y) > height ? 'none' : null,
      )
      .attr('font-size', px(CHART_TYPE.axisLabel))
      .attr('font-weight', (p) => (p.optimal ? 600 : 400))
      .attr('fill', (p) => (p.optimal ? 'var(--foreground)' : 'var(--muted-foreground)'))
      .attr('pointer-events', 'none')
      .text(pointLabel);
    const placed: { x: number; y: number; width: number; height: number }[] = [];
    labels.each(function (p) {
      if (this.getAttribute('display') === 'none') return;
      let box = this.getBBox();
      if (box.width > width) {
        this.textContent = pointLabel(p)
          .replace(' 张 GPU', ' GPU')
          .replace(' GPU', 'G')
          .replace('Ulysses ', 'U')
          .replace(' × ', '/');
        box = this.getBBox();
      }
      if (box.x + box.width > width) {
        this.setAttribute('text-anchor', 'end');
        this.setAttribute('x', String(x(p.x) - 10));
        box = this.getBBox();
      }
      // Keep the measured label inside the clip and choose the nearest free row.
      const left = Math.max(0, Math.min(width - box.width, box.x));
      const top = Math.max(0, Math.min(height - box.height, box.y));
      const neighbors = placed.filter((b) => left < b.x + b.width && left + box.width > b.x);
      const candidates = [
        top,
        ...neighbors.flatMap((b) => [b.y - box.height - 4, b.y + b.height + 4]),
      ];
      const nextTop =
        candidates
          .filter((candidate) => candidate >= 0 && candidate + box.height <= height)
          .sort((a, b) => Math.abs(a - top) - Math.abs(b - top))
          .find((candidate) =>
            neighbors.every(
              (b) => candidate + box.height + 4 <= b.y || candidate >= b.y + b.height + 4,
            ),
          ) ?? top;
      this.setAttribute('x', String(Number(this.getAttribute('x')) + left - box.x));
      this.setAttribute('y', String(Number(this.getAttribute('y')) + nextTop - box.y));
      placed.push({ x: left, y: nextTop, width: box.width, height: box.height });
    });
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
              ctx.width,
              ctx.height,
            );
          },
          onZoom: (group, ctx) =>
            drawLabels(
              group,
              ctx.newXScale as ContinuousScale,
              ctx.newYScale as ContinuousScale,
              ctx.width,
              ctx.height,
            ),
        },
      ]}
      tooltip={{
        rulerType: 'none',
        content: (p) =>
          `<div class="p-3 text-sm"><strong>${escapeHtml(p.label)}</strong><br/>${s.deployment}${colon}${escapeHtml(layoutLabel(p, locale))}<br/>${escapeHtml(xLabel)}${colon}${formatMetric(p.x, state.x)}<br/>${escapeHtml(yLabel)}${colon}${formatMetric(p.y, state.y)}<br/>${s.n}${colon}${p.samples} · ${s.run} #${escapeHtml(p.runId)}</div>`,
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
            {state.y === 'quality' || state.qualityThreshold !== null
              ? points.some(
                  (p) =>
                    qualityMeasurement(p, state.qualityMetric)?.calibration?.status ===
                    'calibrated',
                )
                ? s.noQualityMatch
                : s.noQuality
              : s.noData}
          </p>
        ) : undefined
      }
      caption={
        <p className="text-xs text-muted-foreground" data-testid="video-chart-caption">
          {plotted.length === 0
            ? s.emptyCaption
            : multiLayout
              ? state.optimal
                ? s.multiOptimal
                : s.multi
              : s.single(layouts || '—')}
        </p>
      }
    />
  );
}

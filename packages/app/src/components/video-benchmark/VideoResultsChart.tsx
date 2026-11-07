'use client';

import { curveLinear } from 'd3';
import { useMemo, type ReactNode } from 'react';
import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';
import { Button } from '@/components/ui/button';
import ChartLegend, { type CommonLegendItemProps } from '@/components/ui/chart-legend';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { EmptyState } from '@/components/ui/empty-state';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig, TooltipConfig } from '@/lib/d3-chart/D3Chart/types';
import { axisLabelUnit, chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { zeroAnchoredDomain } from './chart-domain';
import { hardwareLabel, hardwareSort } from './hardware';
import type { ResultCell, ResultsState } from './results';
import {
  RESULTS_X_METRIC_KEYS,
  RESULTS_X_METRICS,
  RESULTS_Y_METRICS,
  resultsChartSeries,
  resultsClip,
  resultsHistorySeries,
  resultsMetricLabel,
  type ResultsChartPoint,
} from './results-chart';
import { resultsNumber as n } from './VideoResultsCharts';

export const VIDEO_RESULTS_CHART_ID = 'video-results-chart';

const STRINGS = {
  en: {
    gpus: (count: number | null) => (count === null ? 'GPU count not recorded' : `${count} GPU`),
    noMatchedRun: 'no matched run',
    noMatchedRunHelp: 'No qualifying run for this workload on this hardware.',
    optimal: 'Optimal only',
    optimalHelp:
      "On: each hardware's Pareto-optimal deployments only. Off: dominated deployments are shown faded.",
    labels: 'Deployment labels',
    singleDeployment:
      'Each hardware has one measured deployment for this workload so far. Frontier curves appear once more GPU counts are measured.',
    noData:
      'No visible hardware has both selected metrics for this workload. Choose another axis metric or show more hardware.',
    controls: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
    unofficial: 'Unofficial run',
    conc: (count: number) => `Conc ${count}`,
    gpuSplit: 'GPUs (part. / alloc.)',
    deployment: 'Deployment',
    replicas: (count: number) => `${count} ${count === 1 ? 'replica' : 'replicas'}`,
    concurrency: 'Concurrency',
    perVideo: 'Cost per video',
    energy: 'Energy per clip',
    power: 'Avg board power',
    valid: 'Valid clips',
    runtime: 'Runtime',
    runLink: 'GitHub Actions run',
    viewTelemetry: 'View telemetry',
  },
  zh: {
    gpus: (count: number | null) => (count === null ? '未记录 GPU 数量' : `${count} 张 GPU`),
    noMatchedRun: '无匹配运行',
    noMatchedRunHelp: '该硬件在此工作负载下没有符合条件的运行。',
    optimal: '仅最优',
    optimalHelp: '开启时只显示各硬件的 Pareto 最优部署；关闭时以淡色显示被支配的部署。',
    labels: '部署标签',
    singleDeployment:
      '目前该工作负载在每种硬件上只测得一种部署。测得更多 GPU 数量的部署后，将显示前沿曲线。',
    noData: '当前工作负载下，没有可见硬件同时具备所选的两项指标。请更换坐标轴指标或显示更多硬件。',
    controls: 'Shift+滚轮缩放 · 拖动平移 · 双击重置',
    unofficial: '非官方运行',
    conc: (count: number) => `并发 ${count}`,
    gpuSplit: 'GPU（参与 / 分配）',
    deployment: '部署',
    replicas: (count: number) => `${count} 个副本`,
    concurrency: '并发数',
    perVideo: '每条视频成本',
    energy: '每条视频能耗',
    power: '板卡平均功率',
    valid: '有效视频',
    runtime: 'Runtime',
    runLink: 'GitHub Actions 运行记录',
    viewTelemetry: '查看遥测',
  },
};

interface PlotPoint extends ResultsChartPoint {
  /** The shared scatter layer keys shapes by precision; every video point is a circle. */
  precision: '';
  hardwareKey: string;
  overlay: boolean;
  color: string;
}

export default function VideoResultsChart({
  cells,
  history,
  roster,
  state,
  colorFor,
  labels,
  onLabelsChange,
  legendExpanded,
  onLegendExpandedChange,
  onUpdate,
  onOpen,
  heading,
  footer,
}: {
  /** Official and named-run deployment cells across every GPU count, hidden hardware included. */
  cells: ResultCell[];
  /** Chip config runs to compare over time; null plots the selected run's deployments. */
  history: ResultCell[] | null;
  roster: readonly string[];
  state: ResultsState;
  colorFor: (hardwareKey: string) => string;
  labels: boolean;
  onLabelsChange: (labels: boolean) => void;
  legendExpanded: boolean;
  onLegendExpandedChange: (expanded: boolean) => void;
  onUpdate: (patch: Partial<ResultsState>) => void;
  onOpen: (pointKey: string, source: 'popover') => void;
  /** Chart title; it sits in the chart caption so image exports carry it. */
  heading?: ReactNode;
  /** Result context under the chart. */
  footer?: ReactNode;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const x = RESULTS_X_METRICS[state.xMetric],
    y = RESULTS_Y_METRICS[state.yMetric];
  const clip = useMemo(() => resultsClip(history ?? cells), [history, cells]);
  const xLabel = resultsMetricLabel(x, locale, clip),
    yLabel = resultsMetricLabel(y, locale);
  const series = useMemo(
    () =>
      (history ? resultsHistorySeries : resultsChartSeries)(history ?? cells, {
        x: state.xMetric,
        y: state.yMetric,
        basis: state.costBasis,
        tier: state.costTier,
        optimal: state.optimal,
        hidden: state.hidden,
      }),
    [
      history,
      cells,
      state.xMetric,
      state.yMetric,
      state.costBasis,
      state.costTier,
      state.optimal,
      state.hidden,
    ],
  );
  const plotted = useMemo<PlotPoint[]>(
    () =>
      series.flatMap((item) =>
        item.points.map((point) => ({
          ...point,
          precision: '',
          hardwareKey: item.hardwareKey,
          overlay: item.overlay,
          color: item.overlay ? overlayRunColor(0) : colorFor(item.hardwareKey),
        })),
      ),
    [series, colorFor],
  );
  const lines = useMemo(
    () =>
      Object.fromEntries(
        series
          .filter((item) => item.frontier.length > 1)
          .map((item) => [item.key, item.frontier.map(({ x: px, y: py }) => ({ x: px, y: py }))]),
      ),
    [series],
  );
  const lineColors = useMemo(
    () =>
      new Map(
        series.map((item) => [
          item.key,
          item.overlay ? overlayRunColor(0) : colorFor(item.hardwareKey),
        ]),
      ),
    [series, colorFor],
  );
  const layers = useMemo<LayerConfig<PlotPoint>[]>(
    () => [
      {
        type: 'line',
        key: 'video-results-frontiers',
        lines,
        config: {
          getColor: (key) => lineColors.get(key) ?? 'var(--foreground)',
          strokeWidth: 2,
          curve: curveLinear,
        },
      },
      {
        type: 'scatter',
        key: 'video-results-points',
        data: plotted,
        keyFn: (point) => point.key,
        config: {
          getColor: (point) => point.color,
          getOpacity: (point) => (point.optimal ? 1 : 0.35),
          getLabelText: (point) =>
            history ? (point.cell.metadata.date ?? '') : s.gpus(point.cell.point.participating),
          foreground: 'var(--foreground)',
          hideLabels: !labels,
          dataAttrs: {
            hardware: (point) => point.hardwareKey,
            overlay: (point) => String(point.overlay),
            point: (point) => point.key,
            optimal: (point) => String(point.optimal),
          },
        },
      },
    ],
    [lines, lineColors, plotted, labels, s, history],
  );
  const tooltip = useMemo<TooltipConfig<PlotPoint>>(() => {
    const otherX = RESULTS_X_METRICS[RESULTS_X_METRIC_KEYS.find((key) => key !== state.xMetric)!];
    const selection = { basis: state.costBasis, tier: state.costTier };
    const describe = ({ cell, overlay, x: xValue, y: yValue }: PlotPoint) => {
      const { point } = cell;
      const engine = cell.metadata.engine;
      const tp = point.server?.tp ?? null,
        ulysses = point.server?.ulysses ?? null;
      return {
        title: hardwareLabel(point.hardwareKey ?? ''),
        subtitle: engine ? (FRAMEWORK_LABELS[engine] ?? engine) : undefined,
        date: point.observedAt?.slice(0, 10) ?? '—',
        strategy: tp !== null && ulysses !== null ? `TP${tp} × Ulysses ${ulysses}` : null,
        replicas: point.replicas === null ? null : s.replicas(point.replicas),
        warning: overlay ? `${s.unofficial} #${point.runId}` : undefined,
        yValue: n(yValue, y.digits),
        xValue: n(xValue, x.digits),
      };
    };
    return {
      rulerType: 'none',
      attachToLayer: 1,
      content: (plot) => {
        const { point } = plot.cell;
        const d = describe(plot);
        return chartHoverCard({
          title: d.title,
          subtitle: [d.subtitle, history ? d.date : null].filter(Boolean).join(' · ') || undefined,
          color: plot.color,
          warning: d.warning,
          metrics: [
            { value: d.yValue, label: axisLabelUnit(yLabel) },
            { value: d.xValue, label: axisLabelUnit(xLabel) },
          ],
          summary: [
            s.gpus(point.participating),
            d.strategy,
            d.replicas,
            point.concurrency === null ? null : s.conc(point.concurrency),
          ]
            .filter(Boolean)
            .join(' · '),
        });
      },
      details: (plot, _isOverlay, close) => {
        const { cell } = plot;
        const { point } = cell;
        const d = describe(plot);
        const cost = cell.cost[state.costBasis];
        const other = otherX.value(cell, selection);
        return (
          <ChartPointDetails
            title={d.title}
            subtitle={d.subtitle}
            color={plot.color}
            date={d.date}
            warning={d.warning}
            metrics={[
              { value: d.yValue, label: yLabel },
              { value: d.xValue, label: xLabel },
            ]}
            rows={[
              {
                label: s.concurrency,
                value: point.concurrency === null ? '—' : String(point.concurrency),
              },
              {
                label: s.gpuSplit,
                value: `${n(point.participating, 0)} / ${n(point.allocated, 0)}`,
              },
              { label: s.valid, value: `${n(point.valid, 0)} / ${n(point.scheduled, 0)}` },
              ...(d.strategy
                ? [
                    {
                      label: s.deployment,
                      value: [d.strategy, d.replicas].filter(Boolean).join(' · '),
                      wide: true,
                    },
                  ]
                : []),
              {
                label: resultsMetricLabel(otherX, locale, clip),
                value: n(other, otherX.digits),
              },
              { label: s.perVideo, value: cost ? `$${n(cost.perVideo, 4)}` : '—' },
              {
                label: s.energy,
                value: cell.joulesPerClip === null ? '—' : `${n(cell.joulesPerClip / 1000, 1)} kJ`,
              },
              {
                label: s.power,
                value: point.avgPowerW === null ? '—' : `${n(point.avgPowerW, 0)} W`,
              },
              ...(point.runtime
                ? [{ label: s.runtime, value: point.runtime.slice(0, 12), wide: true }]
                : []),
            ]}
            links={[
              {
                action: 'run',
                label: s.runLink,
                href: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${encodeURIComponent(point.runId)}`,
                external: true,
              },
            ]}
            onClose={close}
            onAction={(_action, event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="outline"
              size="xs"
              data-action="view-telemetry"
              className="mt-3 w-full"
              onClick={(event) => {
                event.stopPropagation();
                close();
                onOpen(plot.key, 'popover');
              }}
            >
              {s.viewTelemetry} →
            </Button>
          </ChartPointDetails>
        );
      },
      onPointClick: (point) => {
        track('video_results_point_pinned', {
          gpu: point.hardwareKey,
          overlay: point.overlay,
          optimal: point.optimal,
        });
      },
    };
  }, [locale, s, state, x, y, xLabel, yLabel, clip, history, onOpen]);

  const hidden = new Set(state.hidden);
  const measured = new Set(cells.map((cell) => cell.point.hardwareKey));
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onUpdate({ hidden: [...next] });
    track('video_results_hardware_toggled', { gpu: key, enabled: !next.has(key) });
  };
  const legendItems: CommonLegendItemProps[] = roster
    .toSorted((a, b) => hardwareSort(a) - hardwareSort(b))
    .map((key) =>
      measured.has(key)
        ? {
            name: key,
            hw: key,
            label: hardwareLabel(key),
            color: colorFor(key),
            lineDasharray: 'none',
            isActive: !hidden.has(key),
            onClick: toggle,
          }
        : {
            name: key,
            hw: key,
            label: `${hardwareLabel(key)} · ${s.noMatchedRun}`,
            color: 'var(--muted-foreground)',
            lineDasharray: 'none',
            isActive: false,
            blockedReason: s.noMatchedRunHelp,
            onClick: () => {},
          },
    );
  const single = !history && series.length > 0 && series.every((item) => item.measured <= 1);

  return (
    <D3Chart<PlotPoint>
      chartId={VIDEO_RESULTS_CHART_ID}
      testId="video-results-chart"
      data={plotted}
      height={440}
      // The x title centres on the plot, so a wide left margin pushes the zh title past the
      // right edge at 320 px in DM Sans.
      margin={{ top: 24, right: 28, bottom: 64, left: 72 }}
      watermark="logo"
      transitionDuration={0}
      xScale={{
        type: 'linear',
        domain: zeroAnchoredDomain(
          plotted.map((point) => point.x),
          1.12,
        ),
        nice: true,
      }}
      yScale={{
        type: 'linear',
        domain: zeroAnchoredDomain(
          plotted.map((point) => point.y),
          1.15,
        ),
        nice: true,
      }}
      xAxis={{ label: xLabel, tickCount: 6 }}
      yAxis={{ label: yLabel, tickCount: 6 }}
      layers={layers}
      tooltip={tooltip}
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [1, 20],
        resetEventName: `video_results_zoom_reset_${VIDEO_RESULTS_CHART_ID}`,
      }}
      instructions={s.controls}
      noDataOverlay={
        plotted.length === 0 ? (
          <EmptyState bare role="status" className="pointer-events-none absolute inset-0 p-8">
            {s.noData}
          </EmptyState>
        ) : undefined
      }
      caption={heading}
      footer={
        single || footer ? (
          <>
            {single && (
              <p
                className="mb-3 text-xs text-muted-foreground"
                data-testid="video-results-single-note"
              >
                {s.singleDeployment}
              </p>
            )}
            {footer}
          </>
        ) : undefined
      }
      legendElement={
        <ChartLegend
          variant="sidebar"
          legendItems={legendItems}
          onItemRemove={toggle}
          isLegendExpanded={legendExpanded}
          onExpandedChange={(expanded) => {
            onLegendExpandedChange(expanded);
            track('video_results_legend_expanded', { enabled: expanded });
          }}
          reset={{
            id: 'video-results-legend-reset',
            disabled: state.hidden.length === 0,
            onClick: () => {
              onUpdate({ hidden: [] });
              track('video_results_legend_reset');
            },
          }}
          switches={[
            {
              id: 'video-results-optimal',
              label: s.optimal,
              checked: state.optimal,
              infoTooltip: s.optimalHelp,
              onCheckedChange: (optimal) => {
                onUpdate({ optimal });
                track('video_results_optimal_toggled', { enabled: optimal });
              },
            },
            {
              id: 'video-results-labels',
              label: s.labels,
              checked: labels,
              onCheckedChange: (enabled) => {
                onLabelsChange(enabled);
                track('video_results_labels_toggled', { enabled });
              },
            },
          ]}
          keyIndicators={
            state.unofficialRun ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="inline-block size-3 shrink-0 rounded-full"
                  style={{ background: overlayRunColor(0) }}
                />
                {s.unofficial} #{state.unofficialRun}
              </p>
            ) : undefined
          }
        />
      }
    />
  );
}

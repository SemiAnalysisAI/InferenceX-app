'use client';

import { curveLinear } from 'd3';
import { useMemo, useRef, useState } from 'react';
import ChartLegend, { type CommonLegendItemProps } from '@/components/ui/chart-legend';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { D3ChartHandle, LayerConfig, TooltipConfig } from '@/lib/d3-chart/D3Chart/types';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { escapeHtml } from '@/lib/shared/utils';
import { FRAMEWORK_LABELS } from '@semianalysisai/inferencex-constants';
import {
  runLinkHTML,
  tooltipLine,
  tooltipShellStyle,
} from '@/components/inference/utils/tooltipUtils';
import { zeroAnchoredDomain } from './chart-domain';
import { hardwareLabel, hardwareSort } from './hardware';
import type { ResultCell, ResultsState } from './results';
import {
  RESULTS_X_METRIC_KEYS,
  RESULTS_X_METRICS,
  RESULTS_Y_METRICS,
  resultsChartSeries,
  resultsClip,
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
    optimal: 'Optimal Only',
    optimalHelp:
      "On: each hardware's Pareto-optimal deployments only. Off: dominated deployments are shown faded.",
    labels: 'Deployment labels',
    resetFilter: 'Reset filter',
    singleDeployment:
      'Each hardware has one measured deployment for this workload so far. Frontier curves appear once more GPU counts are measured.',
    noData:
      'No visible hardware has both selected metrics for this workload. Choose another axis metric or show more hardware.',
    dismiss: 'Click elsewhere to dismiss',
    unofficial: 'Unofficial run',
    date: 'Date',
    totalGpus: 'Total GPUs',
    gpuDetail: (participating: string, allocated: string) =>
      `${participating} participating · ${allocated} allocated`,
    deployment: 'Deployment',
    replicas: (count: number) => `${count} ${count === 1 ? 'replica' : 'replicas'}`,
    concurrency: 'Concurrency',
    perVideo: 'Cost per video',
    energy: 'Energy per clip',
    power: 'Avg board power',
    valid: 'Valid clips',
    runtime: 'Runtime',
    viewTelemetry: 'View telemetry',
  },
  zh: {
    gpus: (count: number | null) => (count === null ? '未记录 GPU 数量' : `${count} 张 GPU`),
    noMatchedRun: '无匹配运行',
    noMatchedRunHelp: '该硬件在此工作负载下没有符合条件的运行。',
    optimal: '仅最优',
    optimalHelp: '开启时只显示各硬件的 Pareto 最优部署；关闭时以淡色显示被支配的部署。',
    labels: '部署标签',
    resetFilter: '重置筛选',
    singleDeployment:
      '目前该工作负载在每种硬件上只测得一种部署。测得更多 GPU 数量的部署后，将显示前沿曲线。',
    noData: '当前工作负载下，没有可见硬件同时具备所选的两项指标。请更换坐标轴指标或显示更多硬件。',
    dismiss: '点击其他位置关闭',
    unofficial: '非官方运行',
    date: '日期',
    totalGpus: 'GPU 总数',
    gpuDetail: (participating: string, allocated: string) =>
      `参与计算 ${participating} 张 · 分配 ${allocated} 张`,
    deployment: '部署',
    replicas: (count: number) => `${count} 个副本`,
    concurrency: '并发数',
    perVideo: '每条视频成本',
    energy: '每条视频能耗',
    power: '板卡平均功率',
    valid: '有效视频',
    runtime: 'Runtime',
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
  roster,
  state,
  colorFor,
  labels,
  onLabelsChange,
  onUpdate,
  onOpen,
}: {
  /** Official and named-run deployment cells across every GPU count, hidden hardware included. */
  cells: ResultCell[];
  roster: readonly string[];
  state: ResultsState;
  colorFor: (hardwareKey: string) => string;
  labels: boolean;
  onLabelsChange: (labels: boolean) => void;
  onUpdate: (patch: Partial<ResultsState>) => void;
  onOpen: (pointKey: string, source: 'popover') => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const chartRef = useRef<D3ChartHandle>(null);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const x = RESULTS_X_METRICS[state.xMetric],
    y = RESULTS_Y_METRICS[state.yMetric];
  const clip = useMemo(() => resultsClip(cells), [cells]);
  const xLabel = resultsMetricLabel(x, locale, clip),
    yLabel = resultsMetricLabel(y, locale);
  const series = useMemo(
    () =>
      resultsChartSeries(cells, {
        x: state.xMetric,
        y: state.yMetric,
        basis: state.costBasis,
        tier: state.costTier,
        optimal: state.optimal,
        hidden: state.hidden,
      }),
    [
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
          getLabelText: (point) => s.gpus(point.cell.point.participating),
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
    [lines, lineColors, plotted, labels, s],
  );
  const tooltip = useMemo<TooltipConfig<PlotPoint>>(() => {
    const line = (label: string, value: string) => tooltipLine(escapeHtml(label), value);
    const otherX = RESULTS_X_METRICS[RESULTS_X_METRIC_KEYS.find((key) => key !== state.xMetric)!];
    const selection = { basis: state.costBasis, tier: state.costTier };
    return {
      rulerType: 'none',
      attachToLayer: 1,
      content: ({ cell, overlay, x: xValue, y: yValue }, pinned) => {
        const { point } = cell;
        const cost = cell.cost[state.costBasis];
        const engine = cell.metadata.engine;
        const title = [
          `${hardwareLabel(point.hardwareKey ?? '')} · ${s.gpus(point.participating)}${engine ? ` (${FRAMEWORK_LABELS[engine] ?? engine})` : ''}`,
          ...(overlay ? [`${s.unofficial} #${point.runId}`] : []),
        ].join(' · ');
        const tp = point.server?.tp ?? null,
          ulysses = point.server?.ulysses ?? null;
        const deployment =
          tp !== null && ulysses !== null
            ? [
                `TP${tp} × Ulysses ${ulysses}`,
                ...(point.replicas === null ? [] : [s.replicas(point.replicas)]),
              ].join(' · ')
            : null;
        const other = otherX.value(cell, selection);
        return `<div style="${tooltipShellStyle({ isPinned: pinned })}; min-width: 220px" data-testid="video-results-popover">
          ${pinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${s.dismiss}</div>` : ''}
          <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(title)}</div>
          ${line(s.date, escapeHtml(point.observedAt?.slice(0, 10) ?? '—'))}
          ${point.runtime ? line(s.runtime, `<span class="font-mono">${escapeHtml(point.runtime.slice(0, 12))}</span>`) : ''}
          ${line(xLabel, n(xValue, x.digits))}
          ${line(yLabel, n(yValue, y.digits))}
          ${line(s.totalGpus, escapeHtml(s.gpuDetail(n(point.participating, 0), n(point.allocated, 0))))}
          ${deployment ? line(s.deployment, escapeHtml(deployment)) : ''}
          ${point.concurrency === null ? '' : line(s.concurrency, String(point.concurrency))}
          ${line(resultsMetricLabel(otherX, locale, clip), n(other, otherX.digits))}
          ${line(s.perVideo, cost ? `$${n(cost.perVideo, 4)}` : '—')}
          ${line(s.energy, cell.joulesPerClip === null ? '—' : `${n(cell.joulesPerClip / 1000, 1)} kJ`)}
          ${line(s.power, point.avgPowerW === null ? '—' : `${n(point.avgPowerW, 0)} W`)}
          ${line(s.valid, `${n(point.valid, 0)} / ${n(point.scheduled, 0)}`)}
          ${runLinkHTML(`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${encodeURIComponent(point.runId)}`, locale, point.hardwareKey ?? '')}
          ${pinned ? `<button type="button" data-action="view-telemetry" class="mt-2 w-full rounded-md border border-border bg-accent px-2 py-1 text-xs font-medium text-accent-foreground cursor-pointer">${s.viewTelemetry} &rarr;</button>` : ''}
        </div>`;
      },
      onPointClick: (point) => {
        track('video_results_point_pinned', {
          gpu: point.hardwareKey,
          overlay: point.overlay,
          optimal: point.optimal,
        });
        chartRef.current
          ?.getTooltipElement()
          ?.querySelector('[data-action="view-telemetry"]')
          ?.addEventListener('click', (event) => {
            event.stopPropagation();
            chartRef.current?.dismissTooltip(true);
            onOpen(point.key, 'popover');
          });
      },
    };
  }, [locale, s, state, x, y, xLabel, yLabel, clip, onOpen]);

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
            isActive: !hidden.has(key),
            onClick: toggle,
          }
        : {
            name: key,
            hw: key,
            label: `${hardwareLabel(key)} · ${s.noMatchedRun}`,
            color: 'var(--muted-foreground)',
            isActive: false,
            blockedReason: s.noMatchedRunHelp,
            onClick: () => {},
          },
    );
  const single = series.length > 0 && series.every((item) => item.measured <= 1);

  return (
    <D3Chart<PlotPoint>
      ref={chartRef}
      chartId={VIDEO_RESULTS_CHART_ID}
      testId="video-results-chart"
      data={plotted}
      height={440}
      margin={{ top: 24, right: 28, bottom: 64, left: 80 }}
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
      noDataOverlay={
        plotted.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground" role="status">
              {s.noData}
            </p>
          </div>
        ) : undefined
      }
      footer={
        single ? (
          <p
            className="mt-2 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
            data-testid="video-results-single-note"
          >
            {s.singleDeployment}
          </p>
        ) : undefined
      }
      legendElement={
        <ChartLegend
          variant="sidebar"
          legendItems={legendItems}
          isLegendExpanded={legendExpanded}
          onExpandedChange={(expanded) => {
            setLegendExpanded(expanded);
            track('video_results_legend_expanded', { enabled: expanded });
          }}
          actions={
            state.hidden.length > 0
              ? [
                  {
                    id: 'video-results-legend-reset',
                    label: s.resetFilter,
                    onClick: () => {
                      onUpdate({ hidden: [] });
                      track('video_results_legend_reset');
                    },
                  },
                ]
              : undefined
          }
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
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              {state.unofficialRun && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="inline-block size-3 shrink-0 rounded-full"
                    style={{ background: overlayRunColor(0) }}
                  />
                  {s.unofficial} #{state.unofficialRun}
                </p>
              )}
            </div>
          }
        />
      }
    />
  );
}

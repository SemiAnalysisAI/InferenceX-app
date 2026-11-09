'use client';

import { curveLinear, type ScaleContinuousNumeric } from 'd3';
import { useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import ChartLegend, { type CommonLegendItemProps } from '@/components/ui/chart-legend';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { EmptyState } from '@/components/ui/empty-state';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig, TooltipConfig } from '@/lib/d3-chart/D3Chart/types';
import { axisLabelUnit, chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { ShapeKey } from '@/lib/charts/chart-rendering';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { logDomain, zeroAnchoredDomain } from './chart-domain';
import { serverSplit } from './deployment';
import { engineLabel, engineShape, engineSort } from './engines';
import { isLossy, runtimeLabel } from './optimizations';
import { hardwareLabel, hardwareSort } from './hardware';
import type { ResultCell, ResultsState } from './results';
import {
  RESULTS_X_METRIC_KEYS,
  RESULTS_X_METRICS,
  RESULTS_Y_METRIC_KEYS,
  RESULTS_Y_METRICS,
  comparesEngines,
  plottedXMetric,
  resultsChartSeries,
  resultsClip,
  resultsHistorySeries,
  resultsMetricLabel,
  resultsSelection,
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
    replicasUnknown: 'replicas not recorded',
    attention: (backend: string) => `${backend} attention`,
    concurrency: 'Concurrency',
    perVideo: 'Cost per video',
    energy: 'Energy per clip',
    power: 'Avg board power',
    valid: 'Valid clips',
    completedFailed: 'Completed / failed',
    meets: (seconds: string) => `Meets ${seconds} s deadline`,
    videoSecondsPerHour: 'Video-seconds per hour',
    powerLimit: 'Enforced power limit',
    runtime: 'Runtime',
    runLink: 'GitHub Actions run',
    viewTelemetry: 'View telemetry',
    engines: 'Engines',
    engineNotRecorded: 'Engine not recorded',
    lossy: 'Lossy optimizations',
    lossyHelp:
      'Adds dashed lines for runs that skip or approximate computation, such as cross-step caching or sparse attention. They never compete for a GPU’s default line. Quality scores against the same engine’s lossless output are not published yet.',
    lossySeries: 'Lossy optimization lines',
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
    replicasUnknown: '未记录副本数',
    attention: (backend: string) => `${backend} 注意力`,
    concurrency: '并发数',
    perVideo: '每条视频成本',
    energy: '每条视频能耗',
    power: '板卡平均功率',
    valid: '有效视频',
    completedFailed: '完成 / 失败',
    meets: (seconds: string) => `${seconds} s 内完成`,
    videoSecondsPerHour: '每小时视频秒数',
    powerLimit: '强制功率上限',
    runtime: 'Runtime',
    runLink: 'GitHub Actions 运行记录',
    viewTelemetry: '查看遥测',
    engines: '引擎',
    engineNotRecorded: '未记录引擎',
    lossy: '有损优化',
    lossyHelp:
      '以虚线加入跳过或近似部分计算的运行，例如跨步 cache 或稀疏注意力。它们不参与每张 GPU 默认线的评选。与同一引擎无损输出对比的质量分尚未发布。',
    lossySeries: '有损优化线',
  },
};

interface PlotPoint extends ResultsChartPoint {
  /** Required by the shared scatter layer; the engine, not a precision, sets the shape. */
  precision: '';
  hardwareKey: string;
  engine: string | null;
  overlay: boolean;
  color: string;
}

const LOSSY_DASH = '6 4';

const SWATCH_SHAPES: Record<ShapeKey, ReactNode> = {
  circle: <circle cx="12" cy="6" r="3.5" />,
  square: <rect x="8.5" y="2.5" width="7" height="7" />,
  diamond: <path d="M12 1.5 L16.5 6 L12 10.5 L7.5 6 Z" />,
  triangle: <path d="M12 2 L16 10 L8 10 Z" />,
};

/** A series' point shape on its frontier line, dashed for a lossy series, as the chart draws them. */
function SeriesSwatch({ shape, dashed }: { shape: ShapeKey; dashed: boolean }) {
  return (
    <svg
      width="24"
      height="12"
      viewBox="0 0 24 12"
      aria-hidden="true"
      className="shrink-0 fill-current stroke-current"
    >
      <line
        x1="1"
        y1="6"
        x2="23"
        y2="6"
        strokeWidth="1.5"
        strokeDasharray={dashed ? LOSSY_DASH : undefined}
      />
      <g stroke="none">{SWATCH_SHAPES[shape]}</g>
    </svg>
  );
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
  const xKey = plottedXMetric(state.xMetric, history !== null);
  const x = RESULTS_X_METRICS[xKey],
    y = RESULTS_Y_METRICS[state.yMetric];
  const labelsRepeatX = xKey === 'gpus';
  const clip = useMemo(() => resultsClip(history ?? cells), [history, cells]);
  const xLabel = resultsMetricLabel(x, locale, clip),
    yLabel = resultsMetricLabel(y, locale);
  // Hidden hardware is dropped after ranking, so its legend entry still names its engine.
  const ranked = useMemo(
    () =>
      (history ? resultsHistorySeries : resultsChartSeries)(history ?? cells, {
        ...resultsSelection(state),
        x: xKey,
        hidden: [],
      }),
    [history, cells, state, xKey],
  );
  const series = useMemo(
    () => ranked.filter((item) => !state.hidden.includes(item.hardwareKey)),
    [ranked, state.hidden],
  );
  // Engine shapes appear only once two engines share a GPU, which the dashboard confirms first.
  const byEngine = comparesEngines(series);
  const plotted = useMemo<PlotPoint[]>(
    () =>
      series.flatMap((item) =>
        item.points.map((point) => ({
          ...point,
          precision: '',
          hardwareKey: item.hardwareKey,
          engine: item.engine,
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
  const lineDashes = useMemo(
    () => new Map(series.map((item) => [item.key, item.lossy ? LOSSY_DASH : 'none'])),
    [series],
  );
  const layers = useMemo<LayerConfig<PlotPoint>[]>(
    () => [
      {
        type: 'line',
        key: 'video-results-frontiers',
        lines,
        config: {
          getColor: (key) => lineColors.get(key) ?? 'var(--foreground)',
          getStrokeDasharray: (key) => lineDashes.get(key) ?? 'none',
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
          getShapeKey: (point) => (byEngine ? engineShape(point.engine) : 'circle'),
          getOpacity: (point) => (point.optimal ? 1 : 0.35),
          getLabelText: (point) =>
            history ? (point.cell.metadata.date ?? '') : s.gpus(point.cell.point.participating),
          foreground: 'var(--foreground)',
          hideLabels: !labels || labelsRepeatX,
          dataAttrs: {
            hardware: (point) => point.hardwareKey,
            engine: (point) => point.engine ?? 'na',
            overlay: (point) => String(point.overlay),
            point: (point) => point.key,
            optimal: (point) => String(point.optimal),
          },
        },
      },
    ],
    [lines, lineColors, lineDashes, plotted, labels, s, history, byEngine, labelsRepeatX],
  );
  const tooltip = useMemo<TooltipConfig<PlotPoint>>(() => {
    const latencies = RESULTS_X_METRIC_KEYS.filter(
      (key) => key !== xKey && !RESULTS_X_METRICS[key].rankOn,
    ).map((key) => RESULTS_X_METRICS[key]);
    const hoverLatency = RESULTS_X_METRICS[x.rankOn ?? xKey];
    const selection = { basis: state.costBasis, tier: state.costTier };
    const describe = ({ cell, overlay, x: xValue, y: yValue }: PlotPoint) => {
      const { point } = cell;
      return {
        title: hardwareLabel(point.hardwareKey ?? ''),
        subtitle: runtimeLabel(cell.metadata.engine, cell.metadata.optimizations) ?? undefined,
        date: point.observedAt?.slice(0, 10) ?? '—',
        strategy: serverSplit(point),
        replicas: point.replicas === null ? null : s.replicas(point.replicas),
        warning: overlay ? `✕ #${point.runId}` : undefined,
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
            {
              value: n(hoverLatency.value(plot.cell, selection), hoverLatency.digits),
              label:
                hoverLatency.hoverLabel?.[locale] ??
                axisLabelUnit(resultsMetricLabel(hoverLatency, locale, clip)),
            },
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
              {
                label: s.completedFailed,
                value: `${n(point.completed, 0)} / ${n(point.failed, 0)}`,
              },
              {
                label: s.deployment,
                value: [
                  `TP${point.server?.tp ?? '?'} × Ulysses ${point.server?.ulysses ?? '?'}`,
                  d.replicas ?? s.replicasUnknown,
                  s.attention(point.server?.attention ?? '?'),
                ].join(' · '),
                wide: true,
              },
              ...latencies.map((latency) => ({
                label: resultsMetricLabel(latency, locale, clip),
                value: n(latency.value(cell, selection), latency.digits),
              })),
              {
                label: s.meets(n(state.deadlineSeconds)),
                value:
                  cell.deadlineAttainment === null
                    ? '—'
                    : `${n(cell.deadlineAttainment * 100, 0)}%`,
              },
              { label: s.videoSecondsPerHour, value: n(point.videoSecondsPerHour, 0) },
              ...RESULTS_Y_METRIC_KEYS.filter(
                (key) => key !== state.yMetric && key !== 'kjPerClip',
              ).map((key) => ({
                label: resultsMetricLabel(RESULTS_Y_METRICS[key], locale),
                value: n(
                  RESULTS_Y_METRICS[key].value(cell, selection),
                  RESULTS_Y_METRICS[key].digits,
                ),
              })),
              { label: s.perVideo, value: cost ? `$${n(cost.perVideo, 4)}` : '—' },
              {
                label: s.energy,
                value: cell.joulesPerClip === null ? '—' : `${n(cell.joulesPerClip / 1000, 1)} kJ`,
              },
              {
                label: s.power,
                value: point.avgPowerW === null ? '—' : `${n(point.avgPowerW, 0)} W`,
              },
              {
                label: s.powerLimit,
                value: point.enforcedLimitW === null ? '—' : `${n(point.enforcedLimitW, 0)} W`,
              },
              ...(point.runtime ? [{ label: s.runtime, value: point.runtime, wide: true }] : []),
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
  }, [locale, s, state, x, xKey, y, xLabel, yLabel, clip, history, onOpen]);

  const hidden = new Set(state.hidden);
  const measured = new Set(cells.map((cell) => cell.point.hardwareKey));
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onUpdate({ hidden: [...next] });
    track('video_results_hardware_toggled', { gpu: key, enabled: !next.has(key) });
  };
  /** "H100 (NVIDIA Sol Engine)": the engines of the GPU's lossless lines. */
  const legendLabel = (key: string) => {
    const engines = [
      ...new Set(
        ranked.flatMap((item) =>
          item.hardwareKey === key && !item.lossy && item.engine ? [engineLabel(item.engine)] : [],
        ),
      ),
    ];
    return engines.length > 0
      ? `${hardwareLabel(key)} (${engines.join(', ')})`
      : hardwareLabel(key);
  };
  const lossySeries = series.filter((item) => item.lossy);
  const legendItems: CommonLegendItemProps[] = roster
    .toSorted((a, b) => hardwareSort(a) - hardwareSort(b))
    .map((key) =>
      measured.has(key)
        ? {
            name: key,
            hw: key,
            label: legendLabel(key),
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
  const engines = byEngine
    ? [...new Set(series.map((item) => item.engine))].toSorted(
        (a, b) => engineSort(a) - engineSort(b),
      )
    : [];

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
      xScale={
        x.scale === 'log'
          ? {
              type: 'log',
              domain: logDomain(
                plotted.map((point) => point.x),
                1.25,
              ),
              nice: false,
            }
          : {
              type: 'linear',
              domain: zeroAnchoredDomain(
                plotted.map((point) => point.x),
                1.12,
              ),
              nice: true,
            }
      }
      yScale={{
        type: 'linear',
        domain: zeroAnchoredDomain(
          plotted.map((point) => point.y),
          1.15,
        ),
        nice: true,
      }}
      xAxis={
        x.scale === 'log'
          ? {
              label: xLabel,
              tickValues: (scale) => {
                const [lo, hi] = (scale as ScaleContinuousNumeric<number, number>).domain();
                return [...new Set(plotted.map((point) => point.x))]
                  .filter((value) => value >= lo && value <= hi)
                  .toSorted((a, b) => a - b);
              },
              tickFormat: (value) => n(Number(value), x.digits),
            }
          : { label: xLabel, tickCount: 6 }
      }
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
            ...(state.lossy || (!history && cells.some((cell) => isLossy(cell.point)))
              ? [
                  {
                    id: 'video-results-lossy',
                    label: s.lossy,
                    checked: state.lossy,
                    infoTooltip: s.lossyHelp,
                    onCheckedChange: (lossy: boolean) => {
                      onUpdate({ lossy });
                      track('video_results_lossy_toggled', { enabled: lossy });
                    },
                  },
                ]
              : []),
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
            engines.length > 1 || lossySeries.length > 0 || state.unofficialRun ? (
              <>
                {engines.length > 1 && (
                  <ul
                    className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground"
                    aria-label={s.engines}
                    data-testid="results-engine-key"
                  >
                    {engines.map((engine) => (
                      <li
                        key={engine ?? 'na'}
                        className="flex items-center gap-2"
                        data-engine={engine ?? 'na'}
                      >
                        <SeriesSwatch shape={engineShape(engine)} dashed={false} />
                        {engine === null ? s.engineNotRecorded : engineLabel(engine)}
                      </li>
                    ))}
                  </ul>
                )}
                {lossySeries.length > 0 && (
                  <ul
                    className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground"
                    aria-label={s.lossySeries}
                    data-testid="results-lossy-key"
                  >
                    {lossySeries.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-center gap-2"
                        data-series={item.key}
                        style={{
                          color: item.overlay ? overlayRunColor(0) : colorFor(item.hardwareKey),
                        }}
                      >
                        <SeriesSwatch
                          shape={byEngine ? engineShape(item.engine) : 'circle'}
                          dashed
                        />
                        <span className="text-muted-foreground">
                          {`${hardwareLabel(item.hardwareKey)} (${runtimeLabel(item.engine, item.optimizations)})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {state.unofficialRun && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="inline-block size-3 shrink-0 rounded-full"
                      style={{ background: overlayRunColor(0) }}
                    />
                    {s.unofficial} #{state.unofficialRun}
                  </p>
                )}
              </>
            ) : undefined
          }
        />
      }
    />
  );
}

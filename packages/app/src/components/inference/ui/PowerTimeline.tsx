'use client';

/**
 * PowerX "Timeline" display: the per-second GPU power behind each measured
 * average, drawn over the whole benchmark job.
 *
 * ChartDisplay renders this instead of ScatterGraph when the Measured Power
 * Display control is `timeline` (`y_measuredPowerTimeline`). The point set is
 * the same as the Measured Avg Power axis; each point's `power_audit.source`
 * names its `gpu_metrics_*` artifact, which `/api/gpu-metrics?series=power`
 * returns as one-second per-GPU buckets (`components/gpu-power/power-series.ts`).
 *
 * One trace per config, coloured by hardware (official) or by run (unofficial
 * overlay). The validated measurement window is emphasized; the rest of the
 * job (server start, warmup) is drawn faint. Rated TDP is a dashed reference
 * per hardware; the all-in provisioned line is opt-in because it would halve
 * the vertical resolution of the traces.
 */
import * as d3 from 'd3';
import { useQueries } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  bucketTimeMs,
  meanPowerAt,
  type GpuPowerSeriesResponse,
} from '@/components/gpu-power/power-series';
import ChartLegend from '@/components/ui/chart-legend';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { matchesQuickFilters } from '@/components/inference/utils/quickFilters';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { getModelSortIndex } from '@/lib/constants';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig, RenderContext, ZoomContext } from '@/lib/d3-chart/D3Chart/types';
import { lttbDownsample } from '@/lib/d3-chart/downsample';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { overlayRunColor, overlayRunIndex } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '../InferenceContext';
import type { InferenceData, OverlayData } from '../types';
import {
  joinPowerTimeline,
  planPowerTimelineRequests,
  traceConfigLabel,
  windowPhase,
  type MissingTrace,
  type MissingTraceReason,
  type PowerTimelineRequest,
  type PowerTimelineTrace,
  type WindowPhase,
} from '../utils/powerTimeline';

/** Distinct workflow runs fetched per chart; each is one GitHub artifact sweep. */
export const POWER_TIMELINE_MAX_RUNS = 4;
/** Hover targets per trace after LTTB; paths keep every bucket. */
const HIT_POINTS_PER_TRACE = 200;
/** Above this many visible traces the `c<conc>` end labels would only overlap. */
const MAX_LABELED_TRACES = 40;
/** Up to this many undrawn configs are named individually; beyond, per hardware. */
const MAX_LISTED_MISSING = 8;
const CHART_HEIGHT = 600;
const MARGIN = { top: 24, right: 84, bottom: 60, left: 64 };

const STRINGS = {
  en: {
    timeAxis: 'Time axis',
    wall: 'Wall clock (UTC)',
    elapsed: 'Since start',
    xWall: 'Time (UTC)',
    xElapsed: 'Time since telemetry start (m:ss)',
    perGpu: 'One line per GPU',
    perGpuHelp: 'Draw every GPU of a config instead of the mean across its GPUs.',
    utilityLines: 'All-in provisioned lines',
    utilityHelp:
      'Dashed reference at the all-in provisioned utility power per GPU from the hardware registry (SemiAnalysis Datacenter Industry Model). Off by default because it compresses the traces.',
    loading: (runs: number) =>
      `Loading GPU telemetry for ${runs} run${runs === 1 ? '' : 's'}… (GitHub artifacts, may take a minute)`,
    loadError: (runId: string, message: string) => `Run ${runId}: ${message}`,
    missing: (missing: number, total: number) =>
      `${missing} of ${total} measured configs have no telemetry trace and are not drawn.`,
    missingReason: {
      'no-source': (count: number) =>
        `${count} predate per-config telemetry provenance in the benchmark row`,
      'no-run': (count: number) => `${count} carry no workflow run`,
      'run-not-fetched': (count: number) => `${count} come from runs that were not loaded`,
      'not-in-run': (count: number) =>
        `${count} have no gpu_metrics artifact in their run (another collector, or expired)`,
    } satisfies Record<MissingTraceReason, (count: number) => string>,
    missingUndrawn: 'Not drawn',
    noTraces:
      'No telemetry traces for the visible hardware. Enable a series in the legend or choose another date.',
    noArtifacts:
      'These points predate per-config telemetry artifacts, so no timeline is available for them.',
    droppedRuns: (runs: number) =>
      `Telemetry from ${runs} more run${runs === 1 ? '' : 's'} was not loaded (limit ${POWER_TIMELINE_MAX_RUNS} runs per chart).`,
    telemetry: 'Telemetry',
    method:
      'One-second means of per-GPU board power (nvidia-smi / amd-smi) over the whole benchmark job; the emphasized segment is the validated window behind the measured average. Dashed lines: rated TDP per hardware from the hardware registry.',
    instructions:
      'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    dismiss: 'Click elsewhere to dismiss',
    phase: {
      before: 'Before window (startup / warmup)',
      window: 'Measurement window',
      after: 'After window',
      unknown: 'Window not recorded',
    } satisfies Record<WindowPhase, string>,
    meanPerGpu: 'Mean per GPU',
    gpus: (count: number) => `${count} GPU${count === 1 ? '' : 's'}`,
    min: 'min',
    max: 'max',
    validated: 'Validated average',
    sinceStart: 'since start',
    tdp: 'TDP',
    allIn: 'all-in',
    unofficialRun: 'Unofficial run',
    branch: 'Branch',
    viewWorkflow: 'View workflow run',
  },
  zh: {
    timeAxis: '时间轴',
    wall: '实际时刻（UTC）',
    elapsed: '相对起点',
    xWall: '时间（UTC）',
    xElapsed: '距遥测开始的时间（分:秒）',
    perGpu: '每个 GPU 一条线',
    perGpuHelp: '绘制配置中每个 GPU 的曲线，而不是各 GPU 的平均值。',
    utilityLines: '全电源配置参考线',
    utilityHelp:
      '按硬件注册表中每 GPU 的全电源配置（all-in）市电功率绘制虚线参考（SemiAnalysis 数据中心行业模型）。默认关闭，因为它会压缩曲线的纵向分辨率。',
    loading: (runs: number) =>
      `正在加载 ${runs} 个运行的 GPU 遥测数据……（GitHub 产物，可能需要约一分钟）`,
    loadError: (runId: string, message: string) => `运行 ${runId}：${message}`,
    missing: (missing: number, total: number) =>
      `${total} 个有实测值的配置中有 ${missing} 个没有遥测曲线，未绘制。`,
    missingReason: {
      'no-source': (count: number) => `${count} 个的基准测试行早于按配置记录的遥测来源`,
      'no-run': (count: number) => `${count} 个没有工作流运行信息`,
      'run-not-fetched': (count: number) => `${count} 个来自未加载的运行`,
      'not-in-run': (count: number) =>
        `${count} 个在其运行中没有 gpu_metrics 产物（使用其他采集器，或产物已过期）`,
    } satisfies Record<MissingTraceReason, (count: number) => string>,
    missingUndrawn: '未绘制',
    noTraces: '当前可见硬件没有遥测曲线。请在图例中启用一个系列或选择其他日期。',
    noArtifacts: '这些数据点早于按配置上传的遥测产物，因此没有可用的时间线。',
    droppedRuns: (runs: number) =>
      `另有 ${runs} 个运行的遥测数据未加载（每张图表最多 ${POWER_TIMELINE_MAX_RUNS} 个运行）。`,
    telemetry: '遥测来源',
    method:
      '整个基准测试任务期间每个 GPU 板卡功耗（nvidia-smi / amd-smi）的一秒平均值；加粗段为实测平均值所依据的有效测量窗口。虚线：硬件注册表中各硬件的额定 TDP。',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    dismiss: '点击其他区域关闭',
    phase: {
      before: '测量窗口之前（启动 / warmup）',
      window: '测量窗口内',
      after: '测量窗口之后',
      unknown: '未记录测量窗口',
    } satisfies Record<WindowPhase, string>,
    meanPerGpu: '每 GPU 平均',
    gpus: (count: number) => `${count} 个 GPU`,
    min: '最小',
    max: '最大',
    validated: '有效平均值',
    sinceStart: '距起点',
    tdp: 'TDP',
    allIn: 'all-in',
    unofficialRun: '非官方运行',
    branch: '分支',
    viewWorkflow: '查看工作流运行',
  },
} as const;

type XMode = 'wall' | 'elapsed';
type LineMode = 'mean' | 'gpu';

interface TimelineSample {
  trace: PowerTimelineTrace;
  color: string;
  overlayIndex: number | null;
  column: number;
  timeMs: number;
  /** Data-space x for the active mode: epoch ms (wall) or seconds (elapsed). */
  x: number;
  /** Mean watts across the GPUs sampled in the bucket. */
  y: number;
  min: number;
  max: number;
  gpuCount: number;
  phase: WindowPhase;
}

interface TracePoint {
  x: number;
  y: number | null;
}

interface TracePath {
  id: string;
  traceKey: string;
  hwKey: string;
  overlayIndex: number | null;
  color: string;
  segment: 'full' | 'window';
  width: number;
  opacity: number;
  points: TracePoint[];
}

interface ReferenceLine {
  id: string;
  watts: number;
  label: string;
  color: string;
  kind: 'tdp' | 'utility';
}

interface DrawModel {
  paths: TracePath[];
  labels: { traceKey: string; hwKey: string; color: string; text: string; x: number; y: number }[];
}

export interface PowerTimelineProps {
  chartId: string;
  /** Official points of the chart (display-limit clipped points restored). */
  data: InferenceData[];
  overlayData?: OverlayData;
  yLabel: string;
  caption?: React.ReactNode;
}

async function fetchPowerSeries(
  request: PowerTimelineRequest,
  signal: AbortSignal,
): Promise<GpuPowerSeriesResponse> {
  const params = new URLSearchParams({ runId: request.runId, series: 'power' });
  if (request.prefix) params.set('prefix', request.prefix);
  const response = await fetch(`/api/gpu-metrics?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  const body = (await response.json()) as GpuPowerSeriesResponse | { error: string };
  if (!response.ok) {
    throw new Error('error' in body ? body.error : `HTTP ${response.status}`);
  }
  return body as GpuPowerSeriesResponse;
}

function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

const formatUtcClock = d3.utcFormat('%H:%M:%S');
const formatUtcDate = d3.utcFormat('%Y-%m-%d');

function baseHardware(hwKey: string): string {
  return hwKey.split('_')[0];
}

/** Builds the mean or per-GPU polylines plus the window emphasis for one trace. */
function tracePaths(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
  lineMode: LineMode,
): TracePath[] {
  const { series } = trace;
  const xOf = (column: number) =>
    xMode === 'wall' ? bucketTimeMs(series, column) : series.t[column] - series.t[0];
  const rows: { id: string; values: (number | null)[] }[] =
    lineMode === 'gpu'
      ? series.gpus.map((gpu, row) => ({ id: `gpu${gpu}`, values: series.power[row] }))
      : [{ id: 'mean', values: series.t.map((_, column) => meanPowerAt(series, column)) }];
  const faint = lineMode === 'gpu' ? 0.22 : 0.32;
  const strong = lineMode === 'gpu' ? 0.85 : 1;
  const widths = lineMode === 'gpu' ? [1, 1.5] : [1.25, 2.25];
  const paths: TracePath[] = [];
  for (const row of rows) {
    const full: TracePoint[] = [];
    const window: TracePoint[] = [];
    row.values.forEach((value, column) => {
      const point = { x: xOf(column), y: value };
      full.push(point);
      if (windowPhase(trace, bucketTimeMs(series, column)) === 'window') window.push(point);
    });
    paths.push({
      id: `${trace.key}:${row.id}:full`,
      traceKey: trace.key,
      hwKey: trace.point.hwKey,
      overlayIndex,
      color,
      segment: 'full',
      width: widths[0],
      opacity: faint,
      points: full,
    });
    if (window.length > 1) {
      paths.push({
        id: `${trace.key}:${row.id}:window`,
        traceKey: trace.key,
        hwKey: trace.point.hwKey,
        overlayIndex,
        color,
        segment: 'window',
        width: widths[1],
        opacity: strong,
        points: window,
      });
    }
  }
  return paths;
}

function traceSamples(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
): TimelineSample[] {
  const { series } = trace;
  const samples: TimelineSample[] = [];
  for (let column = 0; column < series.t.length; column++) {
    let sum = 0;
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of series.power) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      sum += value;
      count += 1;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (count === 0) continue;
    const timeMs = bucketTimeMs(series, column);
    samples.push({
      trace,
      color,
      overlayIndex,
      column,
      timeMs,
      x: xMode === 'wall' ? timeMs : series.t[column] - series.t[0],
      y: sum / count,
      min,
      max,
      gpuCount: count,
      phase: windowPhase(trace, timeMs),
    });
  }
  return lttbDownsample(
    samples,
    HIT_POINTS_PER_TRACE,
    (sample) => sample.x,
    (sample) => sample.y,
  );
}

type AnyContinuousScale = d3.ScaleLinear<number, number>;

function drawTraces(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: AnyContinuousScale,
  yScale: AnyContinuousScale,
  model: DrawModel,
  highlight: string | null,
): void {
  const line = d3
    .line<TracePoint>()
    .defined((point) => point.y !== null)
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.y ?? 0))
    .curve(d3.curveLinear);
  const selection = group
    .selectAll<SVGPathElement, TracePath>('path.power-trace')
    .data(model.paths, (path) => path.id);
  selection.exit().remove();
  selection
    .enter()
    .append('path')
    .attr('class', 'power-trace')
    .attr('fill', 'none')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round')
    .merge(selection)
    .attr('data-trace-key', (path) => path.traceKey)
    .attr('data-hw', (path) => path.hwKey)
    .attr('data-segment', (path) => path.segment)
    .attr('data-run-index', (path) => (path.overlayIndex === null ? null : path.overlayIndex))
    .attr('stroke', (path) => path.color)
    .attr('stroke-width', (path) => path.width)
    .attr('opacity', (path) => traceOpacity(path, highlight))
    .attr('d', (path) => line(path.points));
}

function traceOpacity(path: TracePath, highlight: string | null): number {
  if (highlight === null) return path.opacity;
  return highlight === path.hwKey || highlight === path.traceKey
    ? Math.min(1, path.opacity + 0.15)
    : path.opacity * 0.15;
}

function drawLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: AnyContinuousScale,
  yScale: AnyContinuousScale,
  model: DrawModel,
  plotWidth: number,
  highlight: string | null,
): void {
  const selection = group
    .selectAll<SVGTextElement, DrawModel['labels'][number]>('text.power-trace-label')
    .data(model.labels, (label) => label.traceKey);
  selection.exit().remove();
  selection
    .enter()
    .append('text')
    .attr('class', 'power-trace-label')
    .attr('font-family', CHART_FONT_SANS)
    .attr('font-size', px(CHART_TYPE.dataLabel))
    .attr('font-weight', '600')
    .attr('dominant-baseline', 'middle')
    .attr('pointer-events', 'none')
    .merge(selection)
    .attr('data-hw', (label) => label.hwKey)
    .attr('fill', (label) => label.color)
    .attr('opacity', (label) =>
      highlight === null || highlight === label.hwKey || highlight === label.traceKey ? 1 : 0.2,
    )
    .text((label) => label.text)
    .each(function (label) {
      const x = xScale(label.x);
      const y = yScale(label.y);
      // Sit just past the last sample; flip inside the plot near the right edge.
      const overflow = x + 6 + label.text.length * 6.5 > plotWidth;
      d3.select(this)
        .attr('text-anchor', overflow ? 'end' : 'start')
        .attr('x', overflow ? x - 6 : x + 6)
        .attr('y', y);
    });
}

function drawReferenceLines(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: AnyContinuousScale,
  width: number,
  lines: ReferenceLine[],
): void {
  group.selectAll('.power-reference').remove();
  for (const line of lines) {
    const y = yScale(line.watts);
    const g = group
      .append('g')
      .attr('class', 'power-reference')
      .attr('data-reference', line.kind)
      .attr('data-watts', line.watts);
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y)
      .attr('y2', y)
      .attr('stroke', line.color)
      .attr('stroke-width', 1.25)
      .attr('stroke-dasharray', line.kind === 'tdp' ? '6,4' : '2,4')
      .attr('opacity', 0.9);
    g.append('text')
      .attr('x', width - 4)
      .attr('y', y - 5)
      .attr('text-anchor', 'end')
      .attr('fill', line.color)
      .attr('font-family', CHART_FONT_SANS)
      .attr('font-size', px(CHART_TYPE.annotation))
      .attr('font-weight', '600')
      .text(line.label);
  }
}

/** Reasons, then the undrawn configs (named when few, counted per hardware when many). */
function describeMissing(
  missing: readonly MissingTrace[],
  t: (typeof STRINGS)[keyof typeof STRINGS],
  hardwareLabel: (point: InferenceData) => string,
): string {
  const reasons = new Map<MissingTraceReason, number>();
  for (const { reason } of missing) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  const reasonText = [...reasons.entries()]
    .map(([reason, count]) => t.missingReason[reason](count))
    .join('; ');
  let list: string;
  if (missing.length <= MAX_LISTED_MISSING) {
    list = missing
      .map(({ point }) => `${hardwareLabel(point)} ${traceConfigLabel(point)}`)
      .join(' · ');
  } else {
    const perHardware = new Map<string, number>();
    for (const { point } of missing) {
      const label = hardwareLabel(point);
      perHardware.set(label, (perHardware.get(label) ?? 0) + 1);
    }
    list = [...perHardware.entries()].map(([label, count]) => `${label} ×${count}`).join(' · ');
  }
  return `${reasonText}. ${t.missingUndrawn}: ${list}`;
}

export default function PowerTimeline({
  chartId,
  data,
  overlayData,
  yLabel,
  caption,
}: PowerTimelineProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { hardwareConfig, hwTypesWithData } = useInferenceData();
  const { activeHwTypes, selectedPrecisions, quickFilters } = useInferenceFilters();
  const { isLegendExpanded, highContrast } = useInferenceDisplay();
  const { toggleHwType, setIsLegendExpanded } = useInferenceActions();
  const { unofficialRunInfos, runIndexByUrl, activeOverlayHwTypes, localOfficialOverride } =
    useUnofficialRun();

  const [xModeChoice, setXModeChoice] = useState<XMode | null>(null);
  const [lineMode, setLineMode] = useState<LineMode>('mean');
  const [showUtility, setShowUtility] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  // The chart's point list still carries every precision, quick-filtered rows
  // and rows without a validated average (ScatterGraph applies those gates at
  // draw time); only rows that plot on the measured-average axis for the
  // current selection have a trace to look up.
  const plotsHere = useCallback(
    (point: InferenceData) =>
      point.measuredPowerTimeline !== undefined &&
      selectedPrecisions.includes(point.precision) &&
      matchesQuickFilters(point, quickFilters),
    [selectedPrecisions, quickFilters],
  );
  const measuredData = useMemo(() => data.filter(plotsHere), [data, plotsHere]);
  const overlayPoints = useMemo(
    () => (overlayData?.data ?? []).filter(plotsHere),
    [overlayData, plotsHere],
  );
  const overlayPointSet = useMemo(() => new Set<InferenceData>(overlayPoints), [overlayPoints]);
  const allPoints = useMemo(
    () => [...measuredData, ...overlayPoints],
    [measuredData, overlayPoints],
  );

  const hwKeysInData = useMemo(
    () =>
      [...new Set(measuredData.map((point) => point.hwKey))].toSorted(
        (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
      ),
    [measuredData],
  );
  const stableHcKeys = useMemo(() => [...hwTypesWithData], [hwTypesWithData]);
  const activeOfficialKeys = useMemo(() => [...activeHwTypes], [activeHwTypes]);
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: hwKeysInData,
    activeKeys: activeOfficialKeys,
    hcKeys: stableHcKeys,
  });

  // ── Telemetry fetch: one request per workflow run ──────────────────────────
  const requests = useMemo(() => planPowerTimelineRequests(allPoints), [allPoints]);
  const fetchedRequests = useMemo(() => requests.slice(0, POWER_TIMELINE_MAX_RUNS), [requests]);
  const droppedRuns = requests.length - fetchedRequests.length;
  const queries = useQueries({
    queries: fetchedRequests.map((request) => ({
      queryKey: ['power-timeline', request.runId, request.prefix] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPowerSeries(request, signal),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });
  const loadingRuns = queries.filter((query) => query.isPending).length;
  const errors = fetchedRequests
    .map((request, index) => ({ request, error: queries[index].error }))
    .filter(
      (entry): entry is { request: PowerTimelineRequest; error: Error } =>
        entry.error instanceof Error,
    );
  const responses = useMemo(() => {
    const map = new Map<string, GpuPowerSeriesResponse>();
    fetchedRequests.forEach((request, index) => {
      const response = queries[index].data;
      if (response) map.set(request.runId, response);
    });
    return map;
    // Query data objects are stable per fetch; deriving from them keeps the map memoised.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedRequests, ...queries.map((query) => query.data)]);

  const { traces, missing } = useMemo(
    () => joinPowerTimeline(allPoints, responses),
    [allPoints, responses],
  );
  const hasAnyArtifact = requests.length > 0;

  useEffect(() => {
    if (loadingRuns > 0 || responses.size === 0) return;
    track('inference_power_timeline_loaded', {
      traces: traces.length,
      missing: missing.length,
      runs: responses.size,
    });
  }, [loadingRuns, responses.size, traces.length, missing.length]);

  // ── Visible traces and their colours ────────────────────────────────────────
  const colorForTrace = useCallback(
    (trace: PowerTimelineTrace): { color: string; overlayIndex: number | null } => {
      if (overlayPointSet.has(trace.point)) {
        const index = overlayRunIndex(trace.point.run_url ?? null, runIndexByUrl);
        return { color: overlayRunColor(index), overlayIndex: index };
      }
      return { color: getCssColor(resolveColor(trace.point.hwKey)), overlayIndex: null };
    },
    [overlayPointSet, runIndexByUrl, getCssColor, resolveColor],
  );
  // Same visibility source as ScatterGraph: an overlay session may hold a
  // local official selection that has not been written back to the filters.
  const officialHwTypes = localOfficialOverride ?? activeHwTypes;
  const visibleTraces = useMemo(
    () =>
      traces.filter((trace) =>
        overlayPointSet.has(trace.point)
          ? activeOverlayHwTypes.has(trace.point.hwKey)
          : officialHwTypes.has(trace.point.hwKey),
      ),
    [traces, overlayPointSet, activeOverlayHwTypes, officialHwTypes],
  );
  const visibleRunCount = useMemo(
    () => new Set(visibleTraces.map((trace) => trace.runId)).size,
    [visibleTraces],
  );
  const xMode: XMode = xModeChoice ?? (visibleRunCount <= 1 ? 'wall' : 'elapsed');

  const model = useMemo<DrawModel>(() => {
    const paths: TracePath[] = [];
    const labels: DrawModel['labels'] = [];
    for (const trace of visibleTraces) {
      const { color, overlayIndex } = colorForTrace(trace);
      const tracePathSet = tracePaths(trace, color, overlayIndex, xMode, lineMode);
      paths.push(...tracePathSet);
      if (visibleTraces.length <= MAX_LABELED_TRACES) {
        const anchor =
          tracePathSet.find((path) => path.segment === 'window') ??
          tracePathSet.find((path) => path.segment === 'full');
        const last = anchor?.points.filter((point) => point.y !== null).at(-1);
        if (last && last.y !== null) {
          labels.push({
            traceKey: trace.key,
            hwKey: trace.point.hwKey,
            color,
            text: `c${trace.point.conc}`,
            x: last.x,
            y: last.y,
          });
        }
      }
    }
    return { paths, labels };
  }, [visibleTraces, colorForTrace, xMode, lineMode]);

  const samples = useMemo(
    () =>
      visibleTraces.flatMap((trace) => {
        const { color, overlayIndex } = colorForTrace(trace);
        return traceSamples(trace, color, overlayIndex, xMode);
      }),
    [visibleTraces, colorForTrace, xMode],
  );

  const referenceLines = useMemo<ReferenceLine[]>(() => {
    const seen = new Map<string, string>();
    for (const trace of visibleTraces) {
      const base = baseHardware(trace.point.hwKey);
      if (!seen.has(base)) seen.set(base, colorForTrace(trace).color);
    }
    const lines: ReferenceLine[] = [];
    for (const [base, color] of seen) {
      const specs = HW_REGISTRY[base];
      if (!specs) continue;
      const label = specs.label ?? base.toUpperCase();
      if (specs.tdp > 0) {
        lines.push({
          id: `tdp:${base}`,
          watts: specs.tdp,
          label: `${label} ${t.tdp} ${specs.tdp} W`,
          color,
          kind: 'tdp',
        });
      }
      if (showUtility && specs.power > 0) {
        lines.push({
          id: `utility:${base}`,
          watts: specs.power * 1000,
          label: `${label} ${t.allIn} ${Math.round(specs.power * 1000)} W`,
          color,
          kind: 'utility',
        });
      }
    }
    return lines;
  }, [visibleTraces, colorForTrace, showUtility, t]);

  // ── Scales ─────────────────────────────────────────────────────────────────
  const xDomain = useMemo<[number, number]>(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const path of model.paths) {
      if (path.segment !== 'full') continue;
      for (const point of path.points) {
        if (point.x < min) min = point.x;
        if (point.x > max) max = point.x;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return xMode === 'wall' ? [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1, 0, 10)] : [0, 600];
    }
    return min === max ? [min, max + (xMode === 'wall' ? 60_000 : 60)] : [min, max];
  }, [model.paths, xMode]);
  const yDomain = useMemo<[number, number]>(() => {
    let max = 0;
    for (const path of model.paths) {
      for (const point of path.points) if (point.y !== null && point.y > max) max = point.y;
    }
    for (const line of referenceLines) if (line.watts > max) max = line.watts;
    return [0, max > 0 ? max * 1.06 : 100];
  }, [model.paths, referenceLines]);

  const xTickFormat = useMemo(() => {
    if (xMode === 'elapsed') return (value: d3.AxisDomain) => formatElapsed(Number(value));
    const span = xDomain[1] - xDomain[0];
    const format = d3.utcFormat(span < 3 * 60_000 ? '%H:%M:%S' : '%H:%M');
    return (value: d3.AxisDomain) =>
      format(value instanceof Date ? value : new Date(Number(value)));
  }, [xMode, xDomain]);

  // ── Layers ─────────────────────────────────────────────────────────────────
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const layers = useMemo<LayerConfig<TimelineSample>[]>(
    () => [
      {
        type: 'custom',
        key: 'power-reference-lines',
        render: (group, ctx) => {
          drawReferenceLines(group, ctx.yScale as AnyContinuousScale, ctx.width, referenceLines);
        },
      },
      {
        type: 'custom',
        key: 'power-traces',
        render: (group, ctx: RenderContext) => {
          drawTraces(
            group,
            ctx.xScale as AnyContinuousScale,
            ctx.yScale as AnyContinuousScale,
            model,
            highlightRef.current,
          );
        },
        onZoom: (group, ctx: ZoomContext) => {
          drawTraces(
            group,
            ctx.newXScale as AnyContinuousScale,
            ctx.newYScale as AnyContinuousScale,
            model,
            highlightRef.current,
          );
        },
      },
      {
        type: 'point',
        key: 'power-hit-points',
        data: samples,
        config: {
          getCx: () => 0,
          getCy: () => 0,
          getX: (sample) => sample.x,
          getY: (sample) => sample.y,
          getColor: (sample) => sample.color,
          getRadius: () => 2,
          keyFn: (sample) => `${sample.trace.key}:${sample.column}`,
          maxPoints: Number.POSITIVE_INFINITY,
        },
      },
      {
        type: 'custom',
        key: 'power-trace-labels',
        render: (group, ctx: RenderContext) => {
          drawLabels(
            group,
            ctx.xScale as AnyContinuousScale,
            ctx.yScale as AnyContinuousScale,
            model,
            ctx.width,
            highlightRef.current,
          );
        },
        onZoom: (group, ctx: ZoomContext) => {
          drawLabels(
            group,
            ctx.newXScale as AnyContinuousScale,
            ctx.newYScale as AnyContinuousScale,
            model,
            ctx.width,
            highlightRef.current,
          );
        },
      },
    ],
    [referenceLines, model, samples],
  );

  const onDisplayUpdate = useCallback(
    (ctx: RenderContext) => {
      const root = d3.select(ctx.layout.svg.node() as SVGSVGElement);
      root
        .selectAll<SVGPathElement, TracePath>('path.power-trace')
        .attr('opacity', (path) => traceOpacity(path, highlight));
      root
        .selectAll<SVGTextElement, DrawModel['labels'][number]>('text.power-trace-label')
        .attr('opacity', (label) =>
          highlight === null || highlight === label.hwKey || highlight === label.traceKey ? 1 : 0.2,
        );
    },
    [highlight],
  );

  const hardwareLabel = useCallback(
    (point: InferenceData): string => {
      const config = overlayPointSet.has(point)
        ? overlayData?.hardwareConfig[point.hwKey]
        : hardwareConfig[point.hwKey];
      return config ? getDisplayLabel(config) : point.hwKey;
    },
    [overlayPointSet, overlayData, hardwareConfig],
  );

  const tooltipContent = useCallback(
    (sample: TimelineSample, isPinned: boolean) => {
      const { trace } = sample;
      const point = trace.point;
      const overlayInfo =
        sample.overlayIndex === null ? null : unofficialRunInfos[sample.overlayIndex];
      const tdp = HW_REGISTRY[baseHardware(point.hwKey)]?.tdp ?? 0;
      const elapsed = formatElapsed((sample.timeMs - trace.series.startMs) / 1000);
      const clock = `${formatUtcClock(new Date(sample.timeMs))} UTC`;
      const time =
        xMode === 'wall' ? `${clock} · +${elapsed} ${t.sinceStart}` : `+${elapsed} · ${clock}`;
      const colon = locale === 'zh' ? '：' : ':';
      const validated = point.measuredAvgPower?.y;
      return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 210px; user-select: ${isPinned ? 'text' : 'none'}">
        ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
        <div class="font-semibold mb-1" style="color: ${sample.color}">${hardwareLabel(point)} · ${traceConfigLabel(point)}${
          overlayInfo ? ` · ✕ ${overlayInfo.branch || `run ${overlayInfo.id}`}` : ''
        }</div>
        <div class="text-muted-foreground">${time}</div>
        <div class="mt-1 font-medium">${t.meanPerGpu}${colon} ${sample.y.toFixed(1)} W${
          tdp > 0
            ? ` <span class="text-muted-foreground">(${((sample.y / tdp) * 100).toFixed(0)}% ${t.tdp})</span>`
            : ''
        }</div>
        <div class="text-muted-foreground">${t.gpus(sample.gpuCount)} · ${t.min} ${sample.min.toFixed(1)} W · ${t.max} ${sample.max.toFixed(1)} W</div>
        <div class="text-muted-foreground">${t.phase[sample.phase]}</div>
        ${
          typeof validated === 'number'
            ? `<div class="text-muted-foreground">${t.validated}${colon} ${validated.toFixed(1)} W</div>`
            : ''
        }
      </div>`;
    },
    [unofficialRunInfos, xMode, t, locale, hardwareLabel],
  );

  // ── Legend ─────────────────────────────────────────────────────────────────
  const legendItems = useMemo(() => {
    const overlayItems =
      overlayData && unofficialRunInfos.length > 0
        ? unofficialRunInfos
            .map((info, index) => {
              const hasPoints = overlayPoints.some(
                (point) => overlayRunIndex(point.run_url ?? null, runIndexByUrl) === index,
              );
              if (!hasPoints) return null;
              const branch = info.branch || `run ${info.id}`;
              return {
                name: `✕ unofficial-run-${info.id}`,
                label: `✕ ${branch}`,
                color: overlayRunColor(index),
                title: `${t.unofficialRun}: ${branch}`,
                isHighlighted: true,
                hw: `overlay-run-${info.id}`,
                isActive: true,
                isRemovable: false,
                onClick: () => {},
                tooltip: (
                  <div className="font-normal text-xs">
                    <div className="text-red-500 font-semibold">{t.unofficialRun}</div>
                    <div>
                      {t.branch}: {branch}
                    </div>
                    {info.url && (
                      <a
                        href={info.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {t.viewWorkflow}
                      </a>
                    )}
                  </div>
                ),
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : [];
    const officialItems = hwKeysInData
      .filter((key) => hwTypesWithData.has(key) && hardwareConfig[key])
      .map((key) => {
        const config = hardwareConfig[key];
        return {
          name: config.name,
          label: getDisplayLabel(config),
          color: resolveColor(key),
          title: config.gpu,
          hw: key,
          isActive: officialHwTypes.has(key),
          onClick: () => {
            toggleHwType(key);
            track('latency_hw_type_toggled', { hw: key });
          },
          tooltip: null,
        };
      });
    return [...overlayItems, ...officialItems];
  }, [
    overlayData,
    unofficialRunInfos,
    overlayPoints,
    runIndexByUrl,
    hwKeysInData,
    hwTypesWithData,
    hardwareConfig,
    resolveColor,
    officialHwTypes,
    toggleHwType,
    t,
  ]);

  const legendElement = (
    <ChartLegend
      variant="sidebar"
      legendItems={legendItems}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={(expanded) => {
        setIsLegendExpanded(expanded);
        track('latency_legend_expanded', { expanded });
      }}
      onItemHover={(id) => setHighlight(id)}
      onItemHoverEnd={() => setHighlight(null)}
      hideAtomFootnote
      switches={[
        {
          id: 'power-timeline-per-gpu',
          label: t.perGpu,
          checked: lineMode === 'gpu',
          onCheckedChange: (checked) => {
            const next: LineMode = checked ? 'gpu' : 'mean';
            setLineMode(next);
            track('inference_power_timeline_lines_changed', { lines: next });
          },
          infoTooltip: t.perGpuHelp,
        },
        {
          id: 'power-timeline-utility',
          label: t.utilityLines,
          checked: showUtility,
          onCheckedChange: (checked) => {
            setShowUtility(checked);
            track('inference_power_timeline_utility_toggled', { enabled: checked });
          },
          infoTooltip: t.utilityHelp,
        },
      ]}
    />
  );

  const runInfos = useMemo(
    () =>
      fetchedRequests
        .map((request) => responses.get(request.runId)?.runInfo)
        .filter((info): info is NonNullable<typeof info> => Boolean(info)),
    [fetchedRequests, responses],
  );

  const toolbar = (
    <div
      className="flex flex-wrap items-center justify-end gap-2 pb-1"
      data-testid="power-timeline-toolbar"
    >
      <span className="text-xs text-muted-foreground">{t.timeAxis}</span>
      <SegmentedToggle<XMode>
        value={xMode}
        ariaLabel={t.timeAxis}
        role="group"
        options={[
          { value: 'wall', label: t.wall, testId: 'power-timeline-axis-wall' },
          { value: 'elapsed', label: t.elapsed, testId: 'power-timeline-axis-elapsed' },
        ]}
        onValueChange={(mode) => {
          setXModeChoice(mode);
          track('inference_power_timeline_axis_changed', { mode });
        }}
      />
    </div>
  );

  let emptyMessage: string | null = null;
  if (loadingRuns > 0) emptyMessage = t.loading(loadingRuns);
  else if (!hasAnyArtifact) emptyMessage = t.noArtifacts;
  else if (visibleTraces.length === 0) emptyMessage = t.noTraces;

  return (
    <div className="relative flex flex-col gap-2" data-testid="power-timeline">
      <D3Chart<TimelineSample>
        key={`${chartId}-${xMode}-${lineMode}`}
        chartId={chartId}
        data={samples}
        height={CHART_HEIGHT}
        margin={MARGIN}
        watermark={overlayData && overlayPoints.length > 0 ? 'unofficial' : 'logo'}
        testId="power-timeline-chart-svg"
        grabCursor
        instructions={t.instructions}
        xScale={
          xMode === 'wall'
            ? { type: 'time', domain: [new Date(xDomain[0]), new Date(xDomain[1])] }
            : { type: 'linear', domain: xDomain }
        }
        yScale={{ type: 'linear', domain: yDomain, nice: true }}
        xAxis={{
          label: xMode === 'wall' ? t.xWall : t.xElapsed,
          tickCount: 10,
          tickFormat: xTickFormat,
        }}
        yAxis={{ label: yLabel, tickCount: 8 }}
        layers={layers}
        displayIdentity={highlight ?? ''}
        onDisplayUpdate={onDisplayUpdate}
        zoom={{
          enabled: true,
          axes: 'x',
          scaleExtent: [1, 60],
          resetEventName: `power_timeline_zoom_reset_${chartId}`,
        }}
        tooltip={{
          rulerType: 'crosshair',
          content: tooltipContent,
          getRulerX: (sample, xScale) => (xScale as AnyContinuousScale)(sample.x),
          getRulerY: (sample, yScale) => yScale(sample.y),
          onHoverStart: (selection) => {
            selection.attr('r', 5).attr('stroke', 'white').attr('stroke-width', 1);
          },
          onHoverEnd: (selection) => {
            selection.attr('r', 2).attr('stroke', 'none');
          },
          attachToLayer: 2,
        }}
        legendElement={legendElement}
        caption={
          <>
            {caption}
            {toolbar}
          </>
        }
        noDataOverlay={
          emptyMessage ? (
            <div
              className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground"
              data-testid="power-timeline-empty"
              aria-live="polite"
            >
              {emptyMessage}
            </div>
          ) : undefined
        }
      />
      <div
        className="flex flex-col gap-1 px-1 text-xs text-muted-foreground"
        data-testid="power-timeline-status"
      >
        {errors.map(({ request, error }) => (
          <p key={request.runId} className="text-destructive" role="alert">
            {t.loadError(request.runId, error.message)}
          </p>
        ))}
        {droppedRuns > 0 && <p>{t.droppedRuns(droppedRuns)}</p>}
        {loadingRuns === 0 && missing.length > 0 && traces.length > 0 && (
          <p data-testid="power-timeline-missing">
            {t.missing(missing.length, traces.length + missing.length)}{' '}
            {describeMissing(missing, t, hardwareLabel)}
          </p>
        )}
        {runInfos.length > 0 && (
          <p data-testid="power-timeline-source">
            {t.telemetry}:{' '}
            {runInfos.map((info, index) => (
              <React.Fragment key={info.id}>
                {index > 0 && ' · '}
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted"
                >
                  {`run ${info.id}`}
                </a>
                {info.createdAt ? ` (${formatUtcDate(new Date(info.createdAt))})` : ''}
              </React.Fragment>
            ))}
          </p>
        )}
        <p>{t.method}</p>
      </div>
    </div>
  );
}

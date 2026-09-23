'use client';

/**
 * PowerX "Timeline" display: the per-second GPU power behind each measured
 * average, drawn over the whole benchmark job.
 *
 * ChartDisplay renders this instead of ScatterGraph when the Measured Power
 * Display control is `timeline` (`y_measuredPowerTimeline`). The point set is
 * the same as the Measured Avg Power axis; each point's `power_audit.source`
 * names its `gpu_metrics_*` artifact — or, for disaggregated Slurm / Dynamo
 * rows, its validation file inside a `power_audit_*` bundle — which
 * `/api/gpu-metrics?series=power` returns as one-second per-GPU buckets
 * (`components/gpu-power/power-series.ts`).
 *
 * One trace per config, coloured by hardware (official) or by run (unofficial
 * overlay). The validated measurement window is emphasized; the rest of the
 * job (server start, warmup) is drawn faint. Rated TDP is a dashed reference
 * per hardware; the all-in provisioned line is opt-in because it would halve
 * the vertical resolution of the traces.
 *
 * Pool mode (bundle series carry worker roles) sums each prefill / decode pool
 * instead, against pool-sized TDP references, so a disaggregated deployment
 * reads as two lines on a watts axis. A pinned scatter tooltip can deep-link
 * here focused on one config (`requestPowerTraceFocus`).
 */
import * as d3 from 'd3';
import { useQueries } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  bucketTimeMs,
  meanPowerAt,
  sumPowerAt,
  type GpuPowerSeries,
  type GpuPowerSeriesResponse,
} from '@/components/gpu-power/power-series';
import ChartLegend, { type LegendSwitchConfig } from '@/components/ui/chart-legend';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { matchesQuickFilters } from '@/components/inference/utils/quickFilters';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { computeToggle } from '@/lib/toggle-set';
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
import { powerVariantDash } from '../utils/power-compare';
import {
  allGpuPool,
  consumePowerTraceFocus,
  groupPoolsBySize,
  hasPowerTimelineWindow,
  parsePowerTimelineParams,
  powerTimelineSampleX,
  joinPowerTimeline,
  planPowerTimelineRequests,
  prioritizeRun,
  prioritizeRuns,
  referenceLabelSlots,
  runIdFromUrl,
  traceConfigLabel,
  traceKeyRunId,
  tracePools,
  windowPhase,
  type MissingTrace,
  type MissingTraceReason,
  type PoolSizeGroup,
  type PowerPool,
  type PowerPoolRole,
  type PowerTimelineAxis,
  type PowerTimelineLines,
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
    elapsed: 'Since telemetry start',
    serving: 'Since serving start',
    xServing: 'Time since serving-window start (s)',
    windowOnly: 'Validated window only',
    windowOnlyHelp:
      'Show only retained samples inside each recorded validated serving window. Traces without valid window bounds are omitted.',
    missingWindow: (count: number) =>
      `${count} trace${count === 1 ? '' : 's'} omitted: no valid serving-window bounds.`,
    missingFocus:
      'The selected trace is unavailable for these filters or has no retained telemetry.',
    methodWindow:
      'One-second means of GPU-board power inside each recorded validated serving window; window boundaries are not interpolated. Dashed lines: rated TDP from the hardware registry.',
    xWall: 'Time (UTC)',
    xElapsed: 'Time since telemetry start (m:ss)',
    perGpu: 'One line per GPU',
    perGpuHelp: 'Draw every GPU of a config instead of the mean across its GPUs.',
    pools: 'Prefill / decode pools',
    poolsHelp:
      'One line per worker-role pool: the summed board power of the prefill GPUs and of the decode GPUs of a config. Dashed references are pool size × rated TDP.',
    utilityLines: 'All-in provisioned lines',
    utilityHelp:
      'Dashed reference at the all-in provisioned utility power per GPU from the hardware registry (SemiAnalysis Datacenter Industry Model). Off by default because it compresses the traces.',
    loading: (runs: number) =>
      `Loading GPU telemetry for ${runs} run${runs === 1 ? '' : 's'}… (may take a minute)`,
    loadError: (runId: string, message: string) => `Run ${runId}: ${message}`,
    missing: (missing: number, total: number) =>
      `${missing} of ${total} measured configs have no telemetry trace and are not drawn.`,
    missingReason: {
      'no-source': (count: number) =>
        `${count} predate per-config telemetry provenance in the benchmark row`,
      'no-run': (count: number) => `${count} carry no workflow run`,
      'run-not-fetched': (count: number) => `${count} come from runs that were not loaded`,
      'not-in-run': (count: number) =>
        `${count} have no gpu_metrics artifact or power-audit bundle in their run (expired, or another collector)`,
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
      'One-second means of per-GPU board power (nvidia-smi / amd-smi, or DCGM on Slurm / Dynamo runs) over the whole benchmark job; the emphasized segment is the validated window behind the measured average. Dashed lines: rated TDP per hardware from the hardware registry.',
    methodPools:
      'In pool mode each line is the summed power of one worker-role pool (prefill or decode GPUs) and the dashed references are pool size × rated TDP.',
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
    poolShort: { prefill: 'prefill', decode: 'decode', all: 'all GPUs' } satisfies Record<
      PowerPoolRole,
      string
    >,
    yPool: 'GPU pool power (W)',
    pool: 'Pool',
    poolPower: 'Pool power',
    poolTdp: 'pool TDP',
    focused: (label: string) => `Focused on ${label}`,
    showAll: 'Show all',
    unofficialRun: 'Unofficial run',
    branch: 'Branch',
    viewWorkflow: 'View workflow run',
  },
  zh: {
    timeAxis: '时间轴',
    wall: '实际时刻（UTC）',
    elapsed: '距遥测起点',
    serving: '距服务窗口起点',
    xServing: '距服务窗口开始的时间（秒）',
    windowOnly: '仅显示有效测量窗口',
    windowOnlyHelp: '仅显示已记录的有效服务窗口内保留的采样点；缺少有效窗口边界的曲线不绘制。',
    missingWindow: (count: number) => `${count} 条曲线缺少有效服务窗口边界，未绘制。`,
    missingFocus: '所选曲线不符合当前筛选条件，或没有保留的遥测数据。',
    methodWindow:
      '显示各有效服务窗口内的 GPU 板卡功耗一秒平均值，窗口边界不作插值。虚线为硬件注册表中的额定 TDP。',
    xWall: '时间（UTC）',
    xElapsed: '距遥测开始的时间（分:秒）',
    perGpu: '每个 GPU 一条线',
    perGpuHelp: '绘制配置中每个 GPU 的曲线，而不是各 GPU 的平均值。',
    pools: '预填充 / 解码 GPU 池',
    poolsHelp:
      '按 worker 角色分池绘制：每条线是同一配置中预填充 GPU 或解码 GPU 的板卡功耗之和。虚线参考为池内 GPU 数量 × 额定 TDP。',
    utilityLines: '全电源配置参考线',
    utilityHelp:
      '按硬件注册表中每 GPU 的全电源配置（all-in）市电功率绘制虚线参考（SemiAnalysis 数据中心行业模型）。默认关闭，因为它会压缩曲线的纵向分辨率。',
    loading: (runs: number) => `正在加载 ${runs} 个运行的 GPU 遥测数据……（可能需要约一分钟）`,
    loadError: (runId: string, message: string) => `运行 ${runId}：${message}`,
    missing: (missing: number, total: number) =>
      `${total} 个有实测值的配置中有 ${missing} 个没有遥测曲线，未绘制。`,
    missingReason: {
      'no-source': (count: number) => `${count} 个的基准测试行早于按配置记录的遥测来源`,
      'no-run': (count: number) => `${count} 个没有工作流运行信息`,
      'run-not-fetched': (count: number) => `${count} 个来自未加载的运行`,
      'not-in-run': (count: number) =>
        `${count} 个在其运行中没有 gpu_metrics 产物或 power-audit 数据包（产物已过期，或使用其他采集器）`,
    } satisfies Record<MissingTraceReason, (count: number) => string>,
    missingUndrawn: '未绘制',
    noTraces: '当前可见硬件没有遥测曲线。请在图例中启用一个系列或选择其他日期。',
    noArtifacts: '这些数据点早于按配置上传的遥测产物，因此没有可用的时间线。',
    droppedRuns: (runs: number) =>
      `另有 ${runs} 个运行的遥测数据未加载（每张图表最多 ${POWER_TIMELINE_MAX_RUNS} 个运行）。`,
    telemetry: '遥测来源',
    method:
      '整个基准测试任务期间每个 GPU 板卡功耗（nvidia-smi / amd-smi，Slurm / Dynamo 运行为 DCGM）的一秒平均值；加粗段为实测平均值所依据的有效测量窗口。虚线：硬件注册表中各硬件的额定 TDP。',
    methodPools:
      '在 GPU 池模式下，每条线是一个 worker 角色池（预填充或解码 GPU）的功耗总和，虚线参考为池内 GPU 数量 × 额定 TDP。',
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
    poolShort: { prefill: '预填充', decode: '解码', all: '全部 GPU' } satisfies Record<
      PowerPoolRole,
      string
    >,
    yPool: 'GPU 池功耗（W）',
    pool: 'GPU 池',
    poolPower: '池功耗',
    poolTdp: '池 TDP',
    focused: (label: string) => `聚焦：${label}`,
    showAll: '显示全部',
    unofficialRun: '非官方运行',
    branch: '分支',
    viewWorkflow: '查看工作流运行',
  },
} as const;

type XMode = PowerTimelineAxis;
type LineMode = PowerTimelineLines;

interface TimelineSample {
  trace: PowerTimelineTrace;
  color: string;
  overlayIndex: number | null;
  column: number;
  timeMs: number;
  /** Data-space x for the active mode: epoch ms (wall) or seconds (elapsed). */
  x: number;
  /** Mean watts across the GPUs sampled in the bucket; the pool's summed watts in pool mode. */
  y: number;
  min: number;
  max: number;
  /** GPUs with a sample in the bucket (inside the pool, in pool mode). */
  gpuCount: number;
  phase: WindowPhase;
  /** The pool this sample sums and its device count, in pool mode. */
  pool?: { role: PowerPoolRole; gpuCount: number };
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
  /** Worker-role pool the line sums, in pool mode. */
  pool?: PowerPoolRole;
}

interface ReferenceLine {
  id: string;
  watts: number;
  label: string;
  color: string;
  kind: 'tdp' | 'utility';
  /** Pools the line is sized for, in pool mode (roles sharing one GPU count). */
  pools?: PowerPoolRole[];
}

/** Vertical distance between stacked reference labels that share a watts value. */
const REFERENCE_LABEL_ROW = 13;

interface TraceLabel {
  /** Join key: the trace key, plus the pool role in pool mode. */
  id: string;
  traceKey: string;
  hwKey: string;
  pool?: PowerPoolRole;
  color: string;
  text: string;
  x: number;
  y: number;
}

interface DrawModel {
  paths: TracePath[];
  labels: TraceLabel[];
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources: request.sources }),
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
/** Pool sums run to thousands of watts; group the digits. */
const formatWatts = d3.format(',.0f');

function baseHardware(hwKey: string): string {
  return hwKey.split('_')[0];
}

/**
 * The pools a trace draws in pool mode: its worker-role pools, or every GPU as
 * one pool when the collector assigned no roles (a single-node trace then shows
 * its deployment total on the same axis).
 */
function drawnPools(series: GpuPowerSeries): PowerPool[] {
  const pools = tracePools(series);
  return pools.length > 0 ? pools : [allGpuPool(series)];
}

/** SVG dash of a pool line: per role from the comparison palette; `all` stays solid. */
function poolDash(pool: PowerPoolRole): string | null {
  const dash = powerVariantDash({ kind: 'role', id: pool });
  return dash === '' ? null : dash;
}

interface TraceRow {
  id: string;
  pool?: PowerPoolRole;
  values: (number | null)[];
}

/** One polyline's values per line mode: the GPU mean, each GPU, or each pool's sum. */
function traceRows(series: GpuPowerSeries, lineMode: LineMode): TraceRow[] {
  if (lineMode === 'gpu') {
    return series.gpus.map((gpu, row) => ({ id: `gpu${gpu}`, values: series.power[row] }));
  }
  if (lineMode === 'pool') {
    return drawnPools(series).map((pool) => ({
      id: `pool:${pool.role}`,
      pool: pool.role,
      values: series.t.map((_, column) => sumPowerAt(series, pool.rows, column)),
    }));
  }
  return [{ id: 'mean', values: series.t.map((_, column) => meanPowerAt(series, column)) }];
}

/** Builds the mean, per-GPU or per-pool polylines plus the window emphasis for one trace. */
function tracePaths(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
  lineMode: LineMode,
  windowOnly: boolean,
): TracePath[] {
  const { series } = trace;
  const rows = traceRows(series, lineMode);
  const faint = lineMode === 'gpu' ? 0.22 : 0.32;
  const strong = lineMode === 'gpu' ? 0.85 : 1;
  const widths = lineMode === 'gpu' ? [1, 1.5] : [1.25, 2.25];
  const paths: TracePath[] = [];
  for (const row of rows) {
    const full: TracePoint[] = [];
    const window: TracePoint[] = [];
    row.values.forEach((value, column) => {
      const x = powerTimelineSampleX(trace, column, xMode, windowOnly);
      if (x === null) return;
      const point = { x, y: value };
      full.push(point);
      if (windowPhase(trace, bucketTimeMs(series, column)) === 'window') window.push(point);
    });
    if (!windowOnly && full.length > 1)
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
        pool: row.pool,
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
        pool: row.pool,
      });
    }
  }
  return paths;
}

/**
 * Hover targets of one trace: one stream over all its GPUs (mean watts), or in
 * pool mode one stream per pool (summed watts) so the tooltip can name the pool.
 */
function traceSamples(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
  lineMode: LineMode,
  windowOnly: boolean,
): TimelineSample[] {
  const { series } = trace;
  if (lineMode !== 'pool') {
    const rows = series.power.map((_, row) => row);
    return sampleRows(trace, color, overlayIndex, xMode, windowOnly, rows, undefined);
  }
  return drawnPools(series).flatMap((pool) =>
    sampleRows(trace, color, overlayIndex, xMode, windowOnly, pool.rows, {
      role: pool.role,
      gpuCount: pool.rows.length,
    }),
  );
}

function sampleRows(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
  windowOnly: boolean,
  rows: readonly number[],
  pool: TimelineSample['pool'],
): TimelineSample[] {
  const { series } = trace;
  const samples: TimelineSample[] = [];
  for (let column = 0; column < series.t.length; column++) {
    const x = powerTimelineSampleX(trace, column, xMode, windowOnly);
    if (x === null) continue;
    let sum = 0;
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const value = series.power[row]?.[column];
      if (value === null || value === undefined) continue;
      sum += value;
      count += 1;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    // A pool bucket missing a device is a gap, as in `sumPowerAt`, not a dip.
    if (count === 0 || (pool && count < rows.length)) continue;
    const timeMs = bucketTimeMs(series, column);
    samples.push({
      trace,
      color,
      overlayIndex,
      column,
      timeMs,
      x,
      y: pool ? sum : sum / count,
      min,
      max,
      gpuCount: count,
      phase: windowPhase(trace, timeMs),
      pool,
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
    .attr('data-pool', (path) => path.pool ?? null)
    .attr('stroke-dasharray', (path) => (path.pool ? poolDash(path.pool) : null))
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
    .selectAll<SVGTextElement, TraceLabel>('text.power-trace-label')
    .data(model.labels, (label) => label.id);
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
    .attr('data-pool', (label) => label.pool ?? null)
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
  const slots = referenceLabelSlots(lines);
  lines.forEach((line, index) => {
    const y = yScale(line.watts);
    const g = group
      .append('g')
      .attr('class', 'power-reference')
      .attr('data-reference', line.kind)
      .attr('data-pool', line.pools?.join(' ') ?? null)
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
      .attr('y', y - 5 - slots[index] * REFERENCE_LABEL_ROW)
      .attr('text-anchor', 'end')
      .attr('fill', line.color)
      .attr('font-family', CHART_FONT_SANS)
      .attr('font-size', px(CHART_TYPE.annotation))
      .attr('font-weight', '600')
      .text(line.label);
  });
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
  const { setBestPerSku, toggleHwType, setIsLegendExpanded } = useInferenceActions();
  const {
    unofficialRunInfos,
    runIndexByUrl,
    activeOverlayHwTypes,
    localOfficialOverride,
    setUnifiedOverlaySelection,
  } = useUnofficialRun();

  const { getUrlParam, setUrlParams } = useUrlState();
  const [initialView] = useState(() =>
    parsePowerTimelineParams({
      i_ptaxis: getUrlParam('i_ptaxis'),
      i_ptlines: getUrlParam('i_ptlines'),
      i_ptwindow: getUrlParam('i_ptwindow'),
      i_ptfocus: getUrlParam('i_ptfocus'),
      i_ptutility: getUrlParam('i_ptutility'),
    }),
  );
  const [xModeChoice, setXModeChoice] = useState<XMode | null>(initialView.axis);
  const [lineMode, setLineMode] = useState<LineMode>(initialView.lines);
  const [windowOnly, setWindowOnly] = useState(initialView.windowOnly);
  const [showUtility, setShowUtility] = useState(initialView.utility);
  const [highlight, setHighlight] = useState<string | null>(null);
  /** Trace a "View power trace" deep link asked for, once the join has produced it. */
  const [focusKey, setFocusKey] = useState<string | null>(initialView.focus);
  /** The deep-link request, read once on mount; `undefined` until read, `null` once honoured. */
  const requestedFocusRef = useRef<string | null | undefined>(undefined);

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
  // The deep-link request is read once, before planning, so its run is fetched
  // even when the chart spans more runs than the cap.
  if (requestedFocusRef.current === undefined) {
    requestedFocusRef.current = consumePowerTraceFocus();
  }
  const focusRun = traceKeyRunId(requestedFocusRef.current ?? focusKey);
  // Overlay runs were requested explicitly (`?unofficialrun=`), so they take
  // the cap's slots before official runs; the deep-linked run still goes first.
  const overlayRunIds = useMemo(
    () =>
      new Set(
        overlayPoints
          .map((point) => runIdFromUrl(point.run_url))
          .filter((runId): runId is string => runId !== null),
      ),
    [overlayPoints],
  );
  const fetchedRequests = useMemo(
    () =>
      prioritizeRun(prioritizeRuns(requests, overlayRunIds), focusRun).slice(
        0,
        POWER_TIMELINE_MAX_RUNS,
      ),
    [requests, overlayRunIds, focusRun],
  );
  const droppedRuns = requests.length - fetchedRequests.length;
  const queries = useQueries({
    queries: fetchedRequests.map((request) => ({
      queryKey: ['power-timeline', request.runId, request.prefix, request.sources] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPowerSeries(request, signal),
      staleTime: 0,
      refetchOnWindowFocus: true,
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

  // Honour the deep link once its trace exists; a disaggregated trace opens in
  // pool mode because its prefill / decode split is what the reader came for.
  useEffect(() => {
    const requested = requestedFocusRef.current;
    if (!requested) return;
    const trace = traces.find((entry) => entry.key === requested);
    if (!trace) return;
    requestedFocusRef.current = null;
    setFocusKey(trace.key);
    if (tracePools(trace.series).length > 0) setLineMode('pool');
  }, [traces]);

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
  // With an overlay loaded the chart reads localOfficialOverride, so a legend
  // click must write the unified selection the way ScatterGraph does; the
  // context's toggleHwType would change activeHwTypes with no visible effect.
  const handleToggleHwType = useCallback(
    (key: string) => {
      if (!overlayData) {
        toggleHwType(key);
        return;
      }
      setBestPerSku(false, { applySelection: false });
      const official = new Set([...officialHwTypes].filter((hw) => hwTypesWithData.has(hw)));
      setUnifiedOverlaySelection(
        computeToggle(official, key, hwTypesWithData),
        activeOverlayHwTypes,
      );
    },
    [
      overlayData,
      toggleHwType,
      setBestPerSku,
      officialHwTypes,
      hwTypesWithData,
      setUnifiedOverlaySelection,
      activeOverlayHwTypes,
    ],
  );
  const visibleTraces = useMemo(
    () =>
      traces.filter((trace) =>
        overlayPointSet.has(trace.point)
          ? activeOverlayHwTypes.has(trace.point.hwKey)
          : officialHwTypes.has(trace.point.hwKey),
      ),
    [traces, overlayPointSet, activeOverlayHwTypes, officialHwTypes],
  );
  // Focus follows visibility: hiding the focused hardware in the legend lifts
  // the dimming and the chip instead of dimming everything with nothing lit.
  const focusedTrace = useMemo(
    () => visibleTraces.find((trace) => trace.key === focusKey) ?? null,
    [visibleTraces, focusKey],
  );
  /** Legend hover wins over the deep-link focus while it lasts. */
  const activeHighlight = highlight ?? focusedTrace?.key ?? null;
  const visibleRunCount = useMemo(
    () => new Set(visibleTraces.map((trace) => trace.runId)).size,
    [visibleTraces],
  );
  const xMode: XMode = xModeChoice ?? (visibleRunCount <= 1 ? 'wall' : 'elapsed');

  // Retain a shared pool choice while data loads; keep its switch available even
  // if the current selection has no role-tagged trace, so it can be turned off.
  const hasPools = useMemo(
    () => visibleTraces.some((trace) => tracePools(trace.series).length > 0),
    [visibleTraces],
  );
  useEffect(() => {
    setUrlParams({
      i_ptaxis: xModeChoice ?? '',
      i_ptlines: lineMode === 'mean' ? '' : lineMode,
      i_ptwindow: windowOnly ? 'window' : '',
      i_ptfocus: focusKey ?? '',
      i_ptutility: showUtility ? '1' : '',
    });
  }, [xModeChoice, lineMode, windowOnly, focusKey, showUtility, setUrlParams]);

  const missingWindows =
    windowOnly || xMode === 'serving'
      ? visibleTraces.filter((trace) => !hasPowerTimelineWindow(trace)).length
      : 0;

  const model = useMemo<DrawModel>(() => {
    const paths: TracePath[] = [];
    const labels: TraceLabel[] = [];
    for (const trace of visibleTraces) {
      const { color, overlayIndex } = colorForTrace(trace);
      const tracePathSet = tracePaths(trace, color, overlayIndex, xMode, lineMode, windowOnly);
      paths.push(...tracePathSet);
      if (visibleTraces.length > MAX_LABELED_TRACES) continue;
      // One end label per trace; per pool in pool mode, so the role reads off the line.
      const groups: { pool?: PowerPoolRole; paths: TracePath[] }[] =
        lineMode === 'pool'
          ? drawnPools(trace.series).map((pool) => ({
              pool: pool.role,
              paths: tracePathSet.filter((path) => path.pool === pool.role),
            }))
          : [{ paths: tracePathSet }];
      for (const group of groups) {
        const anchor =
          group.paths.find((path) => path.segment === 'window') ??
          group.paths.find((path) => path.segment === 'full');
        const last = anchor?.points.filter((point) => point.y !== null).at(-1);
        if (!last || last.y === null) continue;
        labels.push({
          id: group.pool ? `${trace.key}:${group.pool}` : trace.key,
          traceKey: trace.key,
          hwKey: trace.point.hwKey,
          pool: group.pool,
          color,
          text: group.pool
            ? `c${trace.point.conc} · ${t.poolShort[group.pool]}`
            : `c${trace.point.conc}`,
          x: last.x,
          y: last.y,
        });
      }
    }
    return { paths, labels };
  }, [visibleTraces, colorForTrace, xMode, lineMode, windowOnly, t]);

  const samples = useMemo(
    () =>
      visibleTraces.flatMap((trace) => {
        const { color, overlayIndex } = colorForTrace(trace);
        return traceSamples(trace, color, overlayIndex, xMode, lineMode, windowOnly);
      }),
    [visibleTraces, colorForTrace, xMode, lineMode, windowOnly],
  );

  // Rated references: per hardware in mean / per-GPU modes; per (hardware,
  // pool size) in pool mode, scaled to the pool so the summed line and its
  // ceiling share the axis. Roles of one hardware that hold the same number
  // of GPUs share a ceiling and draw as one line (`prefill / decode ×16`).
  const referenceLines = useMemo<ReferenceLine[]>(() => {
    const lines: ReferenceLine[] = [];
    const pushLines = (base: string, color: string, pool?: PoolSizeGroup) => {
      const specs = HW_REGISTRY[base];
      if (!specs) return;
      const label = specs.label ?? base.toUpperCase();
      const size = pool?.size ?? 1;
      const id = pool ? `${base}:${pool.roles.join('+')}:${pool.size}` : base;
      const name = pool
        ? `${label} ${pool.roles.map((role) => t.poolShort[role]).join(' / ')} ×${pool.size}`
        : label;
      if (specs.tdp > 0) {
        lines.push({
          id: `tdp:${id}`,
          watts: specs.tdp * size,
          label: `${name} ${t.tdp} ${specs.tdp * size} W`,
          color,
          kind: 'tdp',
          pools: pool?.roles,
        });
      }
      if (showUtility && specs.power > 0) {
        const watts = pool ? Math.round(specs.power * 1000) * size : specs.power * 1000;
        lines.push({
          id: `utility:${id}`,
          watts,
          label: `${name} ${t.allIn} ${Math.round(watts)} W`,
          color,
          kind: 'utility',
          pools: pool?.roles,
        });
      }
    };
    // First trace of a hardware sets the reference colour, as before.
    const perBase = new Map<string, { color: string; pools: PowerPool[] }>();
    for (const trace of visibleTraces) {
      const base = baseHardware(trace.point.hwKey);
      if (!perBase.has(base)) perBase.set(base, { color: colorForTrace(trace).color, pools: [] });
      if (lineMode === 'pool') perBase.get(base)!.pools.push(...drawnPools(trace.series));
    }
    for (const [base, { color, pools }] of perBase) {
      if (lineMode !== 'pool') {
        pushLines(base, color);
        continue;
      }
      for (const group of groupPoolsBySize(pools)) pushLines(base, color, group);
    }
    return lines;
  }, [visibleTraces, colorForTrace, showUtility, lineMode, t]);

  // ── Scales ─────────────────────────────────────────────────────────────────
  const xDomain = useMemo<[number, number]>(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const path of model.paths) {
      for (const point of path.points) {
        if (point.x < min) min = point.x;
        if (point.x > max) max = point.x;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return xMode === 'wall' ? [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1, 0, 10)] : [0, 600];
    }
    if (xMode === 'serving' && windowOnly) min = Math.min(0, min);
    return min === max ? [min, max + (xMode === 'wall' ? 60_000 : 60)] : [min, max];
  }, [model.paths, xMode, windowOnly]);
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
    if (xMode === 'serving') return (value: d3.AxisDomain) => d3.format('~g')(Number(value));
    const span = xDomain[1] - xDomain[0];
    const crossesDate = formatUtcDate(new Date(xDomain[0])) !== formatUtcDate(new Date(xDomain[1]));
    const format = d3.utcFormat(
      crossesDate ? '%m/%d %H:%M' : span < 3 * 60_000 ? '%H:%M:%S' : '%H:%M',
    );
    return (value: d3.AxisDomain) =>
      format(value instanceof Date ? value : new Date(Number(value)));
  }, [xMode, xDomain]);

  // ── Layers ─────────────────────────────────────────────────────────────────
  const highlightRef = useRef(activeHighlight);
  highlightRef.current = activeHighlight;
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
          // Pool streams of one trace share columns; the role keeps their keys apart.
          keyFn: (sample) =>
            sample.pool
              ? `${sample.trace.key}:${sample.pool.role}:${sample.column}`
              : `${sample.trace.key}:${sample.column}`,
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
        .attr('opacity', (path) => traceOpacity(path, activeHighlight));
      root
        .selectAll<SVGTextElement, TraceLabel>('text.power-trace-label')
        .attr('opacity', (label) =>
          activeHighlight === null ||
          activeHighlight === label.hwKey ||
          activeHighlight === label.traceKey
            ? 1
            : 0.2,
        );
    },
    [activeHighlight],
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
        xMode === 'serving'
          ? `${sample.x.toFixed(1)} s · ${t.serving} · ${clock}`
          : xMode === 'wall'
            ? `${clock} · +${elapsed} ${t.sinceStart}`
            : `+${elapsed} · ${clock}`;
      const colon = locale === 'zh' ? '：' : ':';
      const validated = point.measuredAvgPower?.y;
      const { pool } = sample;
      const readings = pool
        ? `<div class="mt-1 text-muted-foreground">${t.pool}${colon} ${t.poolShort[pool.role]} · ${t.gpus(pool.gpuCount)}</div>
        <div class="font-medium">${t.poolPower}${colon} ${formatWatts(sample.y)} W${
          tdp > 0
            ? ` <span class="text-muted-foreground">(${((sample.y / (tdp * pool.gpuCount)) * 100).toFixed(0)}% ${t.poolTdp})</span>`
            : ''
        }</div>
        <div class="text-muted-foreground">${t.meanPerGpu}${colon} ${(sample.y / sample.gpuCount).toFixed(1)} W · ${t.min} ${sample.min.toFixed(1)} W · ${t.max} ${sample.max.toFixed(1)} W</div>`
        : `<div class="mt-1 font-medium">${t.meanPerGpu}${colon} ${sample.y.toFixed(1)} W${
            tdp > 0
              ? ` <span class="text-muted-foreground">(${((sample.y / tdp) * 100).toFixed(0)}% ${t.tdp})</span>`
              : ''
          }</div>
        <div class="text-muted-foreground">${t.gpus(sample.gpuCount)} · ${t.min} ${sample.min.toFixed(1)} W · ${t.max} ${sample.max.toFixed(1)} W</div>`;
      return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 210px; user-select: ${isPinned ? 'text' : 'none'}">
        ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
        <div class="font-semibold mb-1" style="color: ${sample.color}">${hardwareLabel(point)} · ${traceConfigLabel(point)}${
          overlayInfo ? ` · ✕ ${overlayInfo.branch || `run ${overlayInfo.id}`}` : ''
        }</div>
        <div class="text-muted-foreground">${time}</div>
        ${readings}
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
            handleToggleHwType(key);
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
    handleToggleHwType,
    t,
  ]);

  // Per-GPU and pools are two views of the same lines, so either switch turns
  // the other off; both fall back to the mean.
  const chooseLineMode = (next: LineMode) => {
    setLineMode(next);
    track('inference_power_timeline_lines_changed', { lines: next });
  };
  const switches: LegendSwitchConfig[] = [
    {
      id: 'power-timeline-per-gpu',
      label: t.perGpu,
      checked: lineMode === 'gpu',
      onCheckedChange: (checked) => chooseLineMode(checked ? 'gpu' : 'mean'),
      infoTooltip: t.perGpuHelp,
    },
  ];
  if (hasPools || lineMode === 'pool') {
    switches.push({
      id: 'power-timeline-pools',
      label: t.pools,
      checked: lineMode === 'pool',
      onCheckedChange: (checked) => chooseLineMode(checked ? 'pool' : 'mean'),
      infoTooltip: t.poolsHelp,
    });
  }
  switches.push(
    {
      id: 'power-timeline-window-only',
      label: t.windowOnly,
      checked: windowOnly,
      onCheckedChange: (checked) => {
        setWindowOnly(checked);
        track('inference_power_timeline_window_changed', { windowOnly: checked });
      },
      infoTooltip: t.windowOnlyHelp,
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
  );

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
      switches={switches}
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
          { value: 'serving', label: t.serving, testId: 'power-timeline-axis-serving' },
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
  else if (missingWindows === visibleTraces.length) emptyMessage = t.missingWindow(missingWindows);

  return (
    <div className="relative flex flex-col gap-2" data-testid="power-timeline">
      <D3Chart<TimelineSample>
        key={`${chartId}-${xMode}-${lineMode}-${windowOnly}`}
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
          label: xMode === 'wall' ? t.xWall : xMode === 'serving' ? t.xServing : t.xElapsed,
          tickValues: (scale) => {
            const timeScale = scale as
              | d3.ScaleTime<number, number>
              | d3.ScaleLinear<number, number>;
            const [left, right] = timeScale.range();
            return timeScale.ticks(Math.max(2, Math.min(10, Math.floor((right - left) / 80))));
          },
          tickFormat: xTickFormat,
        }}
        yAxis={{ label: lineMode === 'pool' ? t.yPool : yLabel, tickCount: 8 }}
        layers={layers}
        displayIdentity={activeHighlight ?? ''}
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
        {focusedTrace && (
          <p
            className="inline-flex items-center gap-2 self-start rounded-full border px-2 py-0.5"
            data-testid="power-timeline-focus"
          >
            <span>
              {t.focused(
                `${hardwareLabel(focusedTrace.point)} · ${traceConfigLabel(focusedTrace.point)}`,
              )}
            </span>
            <button
              type="button"
              className="underline decoration-dotted hover:text-foreground"
              data-testid="power-timeline-focus-clear"
              onClick={() => {
                setFocusKey(null);
                track('inference_power_timeline_focus_cleared');
              }}
            >
              {t.showAll}
            </button>
          </p>
        )}
        {focusKey && !focusedTrace && loadingRuns === 0 && (
          <p data-testid="power-timeline-focus-missing">{t.missingFocus}</p>
        )}
        {missingWindows > 0 && (
          <p data-testid="power-timeline-window-missing">{t.missingWindow(missingWindows)}</p>
        )}
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
        <p>{windowOnly ? t.methodWindow : t.method}</p>
        {hasPools && <p>{t.methodPools}</p>}
      </div>
    </div>
  );
}

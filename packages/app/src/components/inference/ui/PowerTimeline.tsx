'use client';

import * as d3 from 'd3';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { ChartNoAxesCombined, ChevronDown, Loader2, TriangleAlert } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  bucketTimeMs,
  meanPowerAt,
  sumPowerAt,
  type GpuPowerSeries,
  type GpuPowerSeriesResponse,
} from '@/components/gpu-power/power-series';
import { useComparisonSeries } from '@/components/inference/hooks/useComparisonSeries';
import { useRequestedPowerTraceFocus } from '@/components/inference/hooks/useRequestedPowerTraceFocus';
import {
  comparisonEntryDate,
  comparisonEntryLabel,
} from '@/components/inference/utils/comparisonEntry';
import ChartLegend, { type LegendSwitchConfig } from '@/components/ui/chart-legend';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { CONTROL_HEIGHT, SELECT_TRIGGER_STYLE } from '@/components/ui/control-styles';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { matchesQuickFilters } from '@/components/inference/utils/quickFilters';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { usePowerXCompareTarget, usePowerXSurface } from '@/components/inference/ui/powerx-surface';
import { Switch } from '@/components/ui/switch';
import { NVL72_GPUS_PER_RACK } from '@/lib/power/load-swing-stats';
import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import { ApiRequestError } from '@/lib/api/api-request-error';
import { computeToggle } from '@/lib/shared/toggle-set';
import { getModelSortIndex } from '@/lib/catalog/constants';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig, RenderContext, ZoomContext } from '@/lib/d3-chart/D3Chart/types';
import { lttbDownsample } from '@/lib/d3-chart/downsample';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { overlayRunColor, overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn, getDisplayLabel, updateRepoUrl } from '@/lib/shared/utils';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '../InferenceContext';
import type { InferenceData, OverlayData } from '../types';
import type { PowerXRole } from '../powerx/powerx-role';
import { powerVariantDash } from '../utils/power-compare';
import { powerBreakdownInteractivity } from '../utils/power-breakdown';
import { PowerLoadSwings, PowerLoadSwingsCaveat } from '../powerx/PowerLoadSwings';
import { formatLoadSwingWatts, loadSwingRows } from '../powerx/load-swing-rows';
import { POWERX_COMPARE_AT_DEFAULT } from '../powerx/powerx-compare-at';
import { powerXFrameworkName } from '../powerx/powerx-ranking';
import {
  POWERX_QUIET_BUTTON,
  PowerXChartFrame,
  PowerXMore,
  PowerXMoreGroup,
  PowerXSeg,
  PowerXToolbarOption,
} from '../powerx/PowerXShell';
import { PowerXSwingRanking, type PowerXSwingRankingRowView } from '../powerx/PowerXSwingRanking';
import { powerXSwingRanking } from '../powerx/swing-ranking';
import PowerTimelineSummary from './PowerTimelineSummary';
import {
  allGpuPool,
  groupPoolsBySize,
  hasPowerTimelineWindow,
  parsePowerTimelineParams,
  powerXTimelineSmoothChoice,
  powerXTimelineSmoothDefault,
  powerXTimelineSmoothParam,
  resolvePowerXTimelineSmooth,
  powerTimelineSampleX,
  joinPowerTimeline,
  planPowerTimelineRequests,
  prioritizeRun,
  prioritizeRuns,
  POWER_TIMELINE_SMOOTH_SECONDS,
  POWERX_TIMELINE_SMOOTH_SECONDS,
  nearestTracePoints,
  powerTimelineStatus,
  rollingMean,
  spreadLabelYs,
  runIdFromUrl,
  traceConfigLabel,
  traceKeyRunId,
  traceLanes,
  tracePools,
  windowPhase,
  type PoolSizeGroup,
  type PowerLaneKind,
  type PowerTraceLane,
  type PowerPool,
  type PowerPoolRole,
  type PowerTimelineAxis,
  type PowerTimelineLines,
  type PowerTimelineRequest,
  type PowerTimelineStatus,
  type PowerTimelineTrace,
  type WindowPhase,
  mostCoveredConcurrency,
} from '../utils/powerTimeline';

export const POWER_TIMELINE_MAX_RUNS = 4;
const HIT_POINTS_PER_TRACE = 200;
const MAX_LABELED_TRACES = 40;
const CHART_HEIGHT = 600;
const MARGIN = { top: 24, right: 24, bottom: 60, left: 64 };
const GUTTER_GAP = 10;
const DENSE_TRACES = 8;
const MAX_GUTTER = 168;
// Room for half of the last x tick label, which the label gutter used to provide.
const PHONE_MARGIN_RIGHT = 20;
/** Minimum pixels per x tick, tighter on phones so a narrow plot still gets three or four. */
const X_TICK_SPACING = { phone: 48, desktop: 80 };

const STRINGS = {
  en: {
    timeAxis: 'Time axis',
    concurrency: 'Concurrency',
    allConcurrencies: 'All',
    highlight: 'Highlight',
    highlightNone: 'All lines',
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
    xWall: 'Time (UTC)',
    xElapsed: 'Time since telemetry start (m:ss)',
    perGpu: 'One line per GPU',
    perGpuHelp: 'Draw every GPU of a config instead of the mean across its GPUs.',
    raw: 'Raw 1-s samples',
    rawHelp: `Draw the one-second buckets as recorded. Off by default: lines show a centered ${POWER_TIMELINE_SMOOTH_SECONDS}-second rolling mean so overlapping configs stay readable. Tooltips and the summary table always use recorded values.`,
    pools: 'Prefill / decode pools',
    poolsHelp:
      'One line per worker-role pool: the summed board power of the prefill GPUs and of the decode GPUs of a config. Dashed references are pool size × rated TDP.',
    utilityLines: 'All-in provisioned lines',
    utilityHelp:
      'Dashed reference at the all-in provisioned utility power per GPU from the hardware registry (SemiAnalysis Datacenter Industry Model). Off by default because it compresses the traces.',
    loadingTitle: 'Loading GPU telemetry',
    loadingDetail: (runs: number) =>
      `${runs} run${runs === 1 ? '' : 's'} · this can take up to a minute`,
    loadingMore: (runs: number) => `Loading ${runs} more run${runs === 1 ? '' : 's'}…`,
    errorTitle: 'GPU telemetry failed to load',
    errorDetail: 'The run errors are listed below the chart',
    emptyTitle: 'No telemetry to show',
    loadError: (runId: string, message: string) => `Run ${runId}: ${message}`,
    noTraces:
      'No telemetry traces for the visible hardware. Enable a series in the legend or choose another date.',
    noArtifacts:
      'These points predate per-config telemetry artifacts, so no timeline is available for them.',
    droppedRuns: (runs: number) =>
      `Telemetry from ${runs} more run${runs === 1 ? '' : 's'} was not loaded (limit ${POWER_TIMELINE_MAX_RUNS} runs per chart).`,
    telemetry: 'Telemetry',
    instructions: 'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset',
    phase: {
      before: 'Before window (startup / warmup)',
      window: 'Measurement window',
      after: 'After window',
      unknown: 'Window not recorded',
    } satisfies Record<WindowPhase, string>,
    meanPerGpu: 'Mean per GPU',
    gpus: (count: number) => `${count} GPU${count === 1 ? '' : 's'}`,
    validated: 'Validated average',
    range: 'Min / max',
    phaseLabel: 'Phase',
    gpuCount: 'GPUs',
    sinceStart: 'since start',
    tdp: 'TDP',
    allIn: 'all-in',
    poolShort: { prefill: 'prefill', decode: 'decode', all: 'all GPUs' } satisfies Record<
      PowerPoolRole,
      string
    >,
    traceKey: 'Trace colours',
    laneName: { prefill: 'Prefill workers', decode: 'Decode workers' } satisfies Record<
      'prefill' | 'decode',
      string
    >,
    laneShort: { prefill: 'Prefill', decode: 'Decode' } satisfies Record<
      'prefill' | 'decode',
      string
    >,
    laneAll: (count: number) => `All ${count} GPU${count === 1 ? '' : 's'}`,
    aggregated: 'aggregated',
    aggregatedNote: 'Aggregated runs stay dimmed: every GPU does both prefill and decode.',
    lane: 'Lane',
    yMean: 'Mean power per GPU (W)',
    yGpu: 'Power per GPU (W)',
    yPool: 'GPU pool power (W)',
    pool: 'Pool',
    poolPower: 'Pool power',
    poolTdp: 'pool TDP',
    focused: (label: string) => `Focused on ${label}`,
    showAll: 'Show all',
    unofficialRun: 'Unofficial run',
    branch: 'Branch',
    precision: 'Precision',
    runDate: 'Run date',
    viewWorkflow: 'View workflow run',
    trace: 'Trace',
    traceNearest: (at: number) => `Each GPU · nearest ${at} tok/s/user`,
    traceNearestShort: (at: number) => `Nearest ${at}`,
    traceNamed: (name: string, conc: number, nearestAt: number | null) =>
      `${name} · c${conc}${nearestAt === null ? '' : ` (nearest ${nearestAt} tok/s/user)`}`,
    traceNamedShort: (name: string, conc: number, nearest: boolean) =>
      `${name} · c${conc}${nearest ? ' · nearest' : ''}`,
    traceEvery: (conc: number) => `Every GPU · c${conc}`,
    traceAll: 'Every concurrency',
    traceGroupAt: 'Compare at',
    traceGroupConc: 'Every GPU at one concurrency',
    traceGroupOne: 'Highlight one trace',
    rack: `×${NVL72_GPUS_PER_RACK} per NVL72 rack`,
    rackShort: `×${NVL72_GPUS_PER_RACK}`,
    rackHelp: `Multiplies the per-GPU figures by ${NVL72_GPUS_PER_RACK} and shows kW per NVL72 rack. Assumes all ${NVL72_GPUS_PER_RACK} GPUs swing together, so it is an upper bound on rack-level swings.`,
    rackPoolNote: 'Pool lines stay in W: a pool is not a per-GPU figure.',
    lines: 'Lines',
    smooth: `${POWERX_TIMELINE_SMOOTH_SECONDS} s smoothing`,
    smoothHelp: `Draw a centred ${POWERX_TIMELINE_SMOOTH_SECONDS}-second rolling mean instead of the recorded 1 s samples. On by default on phones, off on larger screens. Tooltips, the ranking and the load-swings table always use recorded values.`,
    axisShort: {
      wall: 'UTC',
      elapsed: 'Since telemetry',
      serving: 'Since serving start',
    } satisfies Record<PowerTimelineAxis, string>,
    swingUnit: (unit: string) => `Max 5 s swing (${unit})`,
    swingUnitSplit: (unit: string) => `Max 5 s swing (${unit}), prefill / decode`,
    unitGpu: 'W per GPU',
    unitRack: 'kW per NVL72 rack',
    perRack: (value: string) => `${value} per rack`,
    perGpuValue: (value: string) => `${value} per GPU`,
    swingsNote: (at: number) => `One trace per GPU nearest ${at} tok/s/user`,
    yMeanRack: `Mean power per NVL72 rack (kW, ×${NVL72_GPUS_PER_RACK})`,
    yGpuRack: `Power per GPU × ${NVL72_GPUS_PER_RACK} (kW)`,
  },
  zh: {
    timeAxis: '时间轴',
    concurrency: '并发数',
    allConcurrencies: '全部',
    highlight: '突出显示',
    highlightNone: '全部曲线',
    wall: '实际时刻（UTC）',
    elapsed: '距遥测起点',
    serving: '距服务窗口起点',
    xServing: '距服务窗口开始的时间（秒）',
    windowOnly: '仅显示有效测量窗口',
    windowOnlyHelp: '仅显示已记录的有效服务窗口内保留的采样点；缺少有效窗口边界的曲线不绘制。',
    missingWindow: (count: number) => `${count} 条曲线缺少有效服务窗口边界，未绘制。`,
    missingFocus: '所选曲线不符合当前筛选条件，或没有保留的遥测数据。',
    xWall: '时间（UTC）',
    xElapsed: '距遥测开始的时间（分:秒）',
    perGpu: '每个 GPU 一条线',
    perGpuHelp: '绘制配置中每个 GPU 的曲线，而不是各 GPU 的平均值。',
    raw: '原始 1 秒采样',
    rawHelp: `按记录值绘制 1 秒采样桶。默认关闭：曲线显示以每点为中心的 ${POWER_TIMELINE_SMOOTH_SECONDS} 秒滚动平均，以便多条配置重叠时仍可辨认。提示框和汇总表始终使用记录值。`,
    pools: '预填充 / 解码 GPU 池',
    poolsHelp:
      '按 worker 角色分池绘制：每条线是同一配置中预填充 GPU 或解码 GPU 的板卡功耗之和。虚线参考为池内 GPU 数量 × 额定 TDP。',
    utilityLines: '整体预配功耗参考线',
    utilityHelp:
      '以虚线标出硬件注册表中每 GPU 的整体预配功耗，即市电侧的 all-in 功率（SemiAnalysis 数据中心行业模型）。默认关闭，因为它会压缩曲线的纵向分辨率。',
    loadingTitle: '正在加载 GPU 遥测数据',
    loadingDetail: (runs: number) => `${runs} 个运行 · 可能需要约一分钟`,
    loadingMore: (runs: number) => `正在加载另外 ${runs} 个运行……`,
    errorTitle: 'GPU 遥测数据加载失败',
    errorDetail: '各运行的错误信息列在图表下方',
    emptyTitle: '暂无可显示的遥测数据',
    loadError: (runId: string, message: string) => `运行 ${runId}：${message}`,
    noTraces: '当前可见硬件没有遥测曲线。请在图例中启用一个系列或选择其他日期。',
    noArtifacts: '这些数据点早于按配置上传的遥测产物，因此没有可用的时间线。',
    droppedRuns: (runs: number) =>
      `另有 ${runs} 个运行的遥测数据未加载（每张图表最多 ${POWER_TIMELINE_MAX_RUNS} 个运行）。`,
    telemetry: '遥测来源',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置',
    phase: {
      before: '测量窗口之前（启动 / warmup）',
      window: '测量窗口内',
      after: '测量窗口之后',
      unknown: '未记录测量窗口',
    } satisfies Record<WindowPhase, string>,
    meanPerGpu: '每 GPU 平均',
    gpus: (count: number) => `${count} 个 GPU`,
    validated: '有效平均值',
    range: '最小 / 最大',
    phaseLabel: '阶段',
    gpuCount: 'GPU 数',
    sinceStart: '距起点',
    tdp: 'TDP',
    allIn: 'all-in',
    poolShort: { prefill: '预填充', decode: '解码', all: '全部 GPU' } satisfies Record<
      PowerPoolRole,
      string
    >,
    traceKey: '曲线颜色',
    laneName: { prefill: '预填充 worker', decode: '解码 worker' } satisfies Record<
      'prefill' | 'decode',
      string
    >,
    laneShort: { prefill: '预填充', decode: '解码' } satisfies Record<'prefill' | 'decode', string>,
    laneAll: (count: number) => `全部 ${count} 个 GPU`,
    aggregated: '聚合',
    aggregatedNote: '聚合运行以淡色显示：每个 GPU 同时承担预填充和解码。',
    lane: '分组',
    yMean: '每 GPU 平均功耗（W）',
    yGpu: '单 GPU 功耗（W）',
    yPool: 'GPU 池功耗（W）',
    pool: 'GPU 池',
    poolPower: '池功耗',
    poolTdp: '池 TDP',
    focused: (label: string) => `聚焦：${label}`,
    showAll: '显示全部',
    unofficialRun: '非官方运行',
    branch: '分支',
    precision: '精度',
    runDate: '运行日期',
    viewWorkflow: '查看工作流运行',
    trace: '曲线',
    traceNearest: (at: number) => `每个 GPU · 最接近 ${at} tok/s/user`,
    traceNearestShort: (at: number) => `最接近 ${at}`,
    traceNamed: (name: string, conc: number, nearestAt: number | null) =>
      `${name} · c${conc}${nearestAt === null ? '' : `（最接近 ${nearestAt} tok/s/user）`}`,
    traceNamedShort: (name: string, conc: number, nearest: boolean) =>
      `${name} · c${conc}${nearest ? ' · 最接近' : ''}`,
    traceEvery: (conc: number) => `每个 GPU · c${conc}`,
    traceAll: '全部并发',
    traceGroupAt: '对比点',
    traceGroupConc: '所有 GPU 取同一并发',
    traceGroupOne: '突出显示一条曲线',
    rack: `×${NVL72_GPUS_PER_RACK}（每 NVL72 机架）`,
    rackShort: `×${NVL72_GPUS_PER_RACK}`,
    rackHelp: `将每 GPU 数值乘以 ${NVL72_GPUS_PER_RACK}，以每 NVL72 机架 kW 显示。假设全部 ${NVL72_GPUS_PER_RACK} 颗 GPU 同步波动，因此是机架级波动的上限。`,
    rackPoolNote: 'GPU 池曲线仍以 W 显示：池功耗不是每 GPU 数值。',
    lines: '曲线',
    smooth: `${POWERX_TIMELINE_SMOOTH_SECONDS} 秒平滑`,
    smoothHelp: `以每点为中心的 ${POWERX_TIMELINE_SMOOTH_SECONDS} 秒滚动平均代替记录的 1 秒采样绘制曲线。手机上默认开启，较大屏幕上默认关闭。提示框、排名和负载波动表始终使用记录值。`,
    axisShort: {
      wall: 'UTC',
      elapsed: '距遥测起点',
      serving: '距服务窗口起点',
    } satisfies Record<PowerTimelineAxis, string>,
    swingUnit: (unit: string) => `最大 5 秒波动（${unit}）`,
    swingUnitSplit: (unit: string) => `最大 5 秒波动（${unit}），预填充 / 解码`,
    unitGpu: '每 GPU W',
    unitRack: '每 NVL72 机架 kW',
    perRack: (value: string) => `每机架 ${value}`,
    perGpuValue: (value: string) => `每 GPU ${value}`,
    swingsNote: (at: number) => `每个 GPU 取最接近 ${at} tok/s/user 的一条曲线`,
    yMeanRack: `每 NVL72 机架平均功耗（kW，×${NVL72_GPUS_PER_RACK}）`,
    yGpuRack: `单 GPU 功耗 × ${NVL72_GPUS_PER_RACK}（kW）`,
  },
} as const;

type XMode = PowerTimelineAxis;
type LineMode = PowerTimelineLines;
/** What is drawn: the URL line choice, or per-GPU mean lanes per pool under a GPU role. */
type DrawMode = LineMode | 'lane';

function drawModeFor(lineMode: LineMode, role: PowerXRole): DrawMode {
  if (role === 'all') return lineMode;
  return lineMode === 'gpu' ? 'gpu' : 'lane';
}

interface LaneInfo {
  role: PowerPoolRole;
  kind: PowerLaneKind;
  gpuCount: number;
}

interface TimelineSample {
  trace: PowerTimelineTrace;
  color: string;
  overlayIndex: number | null;
  column: number;
  timeMs: number;
  x: number;
  y: number;
  min: number;
  max: number;
  gpuCount: number;
  phase: WindowPhase;
  pool?: { role: PowerPoolRole; gpuCount: number };
  /** Under a GPU role: the lane this per-GPU mean sample belongs to. */
  lane?: LaneInfo;
  /** Y of the drawn (smoothed) line at this sample, so the hover dot sits on the line. */
  drawnY?: number;
}

interface TracePoint {
  x: number;
  y: number | null;
}

interface TracePath {
  id: string;
  traceKey: string;
  hwKey: string;
  series?: string;
  overlayIndex: number | null;
  color: string;
  segment: 'full' | 'window';
  width: number;
  opacity: number;
  points: TracePoint[];
  pool?: PowerPoolRole;
  lane?: PowerLaneKind;
}

interface ReferenceLine {
  id: string;
  watts: number;
  label: string;
  color: string;
  kind: 'tdp' | 'utility';
  pools?: PowerPoolRole[];
}

const REFERENCE_LABEL_ROW = 13;

interface TraceLabel {
  id: string;
  traceKey: string;
  hwKey: string;
  series?: string;
  pool?: PowerPoolRole;
  lane?: PowerLaneKind;
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
  data: InferenceData[];
  overlayData?: OverlayData;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  comparison?: boolean;
  runNumbering?: Map<string, number>;
  /** PowerX GPU role: per-GPU mean lanes per worker pool instead of the all-GPU mean. */
  role?: PowerXRole;
  /**
   * PowerX layout: builds the chart header (toolbar and y-title row) from the timeline's own
   * options. The timeline then reads one trace per GPU nearest Compare at by default, ranks
   * the GPUs by their 5 s swing beside the plot and puts the load-swings table below it.
   */
  powerXHeader?: (parts: PowerTimelineHeaderParts) => React.ReactNode;
  /** Chart height in px (the PowerX plot heights); 600 by default. */
  height?: number;
  /** The chart's x field: which interactivity (tok/s/user) the trace nearest Compare at reads. */
  xField?: string;
}

export interface PowerTimelineHeaderParts {
  /** Toolbar options: Trace and the ×72 rack switch. */
  options: React.ReactNode;
  more: React.ReactNode;
  /** The y title over the plot. */
  title: string;
}

/** Trace: one per GPU nearest Compare at (PowerX layout), every load, or one concurrency. */
type TraceMode = 'nearest' | 'all' | number;

type TimelineStrings = (typeof STRINGS)[keyof typeof STRINGS];

/** A labelled toolbar control: label beside the control on desktop, a label column on phones. */
function ToolbarField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const labelClass = 'text-xs text-muted-foreground';
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 md:flex md:gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
    </div>
  );
}

/** Native select styled like the segmented toggle's phone variant, so all toolbar controls match. */
function ToolbarSelect({
  id,
  testId,
  value,
  onChange,
  className,
  children,
}: {
  id: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          SELECT_TRIGGER_STYLE,
          CONTROL_HEIGHT.sm,
          'w-full appearance-none truncate pr-9 text-foreground',
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/**
 * Loading, error and empty states. A blocking status is a centred panel over the hidden plot; a
 * non-blocking one (more runs still loading) is a small notice that leaves drawn lines visible.
 */
function PowerTimelineStatusPanel({
  status,
  t,
}: {
  status: PowerTimelineStatus;
  t: TimelineStrings;
}) {
  if (!status.blocking) {
    return (
      <div
        className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2"
        data-testid="power-timeline-empty"
        data-status={status.kind}
        role="status"
        aria-live="polite"
      >
        <p className="inline-flex items-center gap-2 rounded-md border border-border/30 bg-card px-3 py-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {t.loadingMore(status.runs)}
        </p>
      </div>
    );
  }
  const { icon, title, detail } =
    status.kind === 'loading'
      ? {
          icon: (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          ),
          title: t.loadingTitle,
          detail: t.loadingDetail(status.runs),
        }
      : status.kind === 'error'
        ? {
            icon: <TriangleAlert className="size-6 text-destructive" aria-hidden="true" />,
            title: t.errorTitle,
            detail: t.errorDetail,
          }
        : {
            icon: (
              <ChartNoAxesCombined className="size-6 text-muted-foreground" aria-hidden="true" />
            ),
            title: t.emptyTitle,
            detail:
              status.reason === 'missingWindow'
                ? t.missingWindow(status.missing)
                : t[status.reason],
          };
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-dashed border-border/70 p-4 lg:right-3"
      data-testid="power-timeline-empty"
      data-status={status.kind}
      role={status.kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={status.kind === 'loading'}
    >
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        {icon}
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

async function fetchPowerSeries(
  request: PowerTimelineRequest,
  signal: AbortSignal,
): Promise<GpuPowerSeriesResponse> {
  const params = new URLSearchParams({ runId: request.runId, series: 'power' });
  if (request.prefix) params.set('prefix', request.prefix);
  const url = `/api/gpu-metrics?${params.toString()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources: request.sources }),
    cache: 'no-store',
    signal,
  });
  const body = (await response.json()) as GpuPowerSeriesResponse | { error: string };
  if (!response.ok) {
    throw new ApiRequestError(
      'error' in body ? body.error : `HTTP ${response.status}`,
      response.status,
      url,
    );
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
const formatWatts = d3.format(',.0f');

const LABEL_CHAR_WIDTH = 6.5;

function baseHardware(hwKey: string): string {
  return hwKey.split('_')[0];
}

function runIdsOf(points: readonly InferenceData[]): Set<string> {
  return new Set(
    points
      .map((point) => runIdFromUrl(point.run_url))
      .filter((runId): runId is string => runId !== null),
  );
}

function drawnPools(series: GpuPowerSeries): PowerPool[] {
  const pools = tracePools(series);
  return pools.length > 0 ? pools : [allGpuPool(series)];
}

function poolDash(pool: PowerPoolRole): string | null {
  const dash = powerVariantDash({ kind: 'role', id: pool });
  return dash === '' ? null : dash;
}

function laneLabel(
  role: PowerPoolRole,
  kind: PowerLaneKind,
  gpuCount: number,
  t: TimelineStrings,
): string {
  if (kind === 'aggregated') return t.aggregated;
  return role === 'all' ? t.laneAll(gpuCount) : t.laneName[role];
}

/** The lane as a direct label: the GPU and concurrency already lead it, so the pool name is enough. */
function laneDirectLabel(
  role: PowerPoolRole,
  kind: PowerLaneKind,
  gpuCount: number,
  t: TimelineStrings,
): string {
  if (kind === 'aggregated' || role === 'all') return laneLabel(role, kind, gpuCount, t);
  return t.laneShort[role];
}

interface TraceRow {
  id: string;
  pool?: PowerPoolRole;
  lane?: PowerLaneKind;
  values: (number | null)[];
}

function meanPowerOfRows(
  series: GpuPowerSeries,
  rows: readonly number[],
  column: number,
): number | null {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const value = series.power[row]?.[column];
    if (value === null || value === undefined) continue;
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

function lanePool(lane: Pick<PowerTraceLane, 'role'>): PowerPoolRole | undefined {
  return lane.role === 'all' ? undefined : lane.role;
}

function traceRows(series: GpuPowerSeries, lineMode: DrawMode, role: PowerXRole): TraceRow[] {
  if (role !== 'all') {
    const lanes = traceLanes(series, role);
    if (lineMode === 'gpu') {
      // One line per GPU of the selected pools; the split's all-GPU context would repeat them.
      return lanes
        .filter((lane) => lane.kind !== 'context')
        .flatMap((lane) =>
          lane.rows.map((row) => ({
            id: `gpu${series.gpus[row]}`,
            pool: lanePool(lane),
            lane: lane.kind,
            values: series.power[row],
          })),
        );
    }
    return lanes.map((lane) => ({
      id: `lane:${lane.kind}:${lane.role}`,
      pool: lanePool(lane),
      lane: lane.kind,
      values: series.t.map((_, column) => meanPowerOfRows(series, lane.rows, column)),
    }));
  }
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

function tracePaths(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
  lineMode: DrawMode,
  windowOnly: boolean,
  smoothSeconds = POWER_TIMELINE_SMOOTH_SECONDS,
  dense = false,
  role: PowerXRole = 'all',
): TracePath[] {
  const { series } = trace;
  const span = smoothSpan(series, smoothSeconds);
  const rows = traceRows(series, lineMode, role).map((row) => ({
    ...row,
    values: rollingMean(row.values, span),
  }));
  // Many overlaid configs: thinner, slightly translucent lines so crossings stay readable.
  const faint = lineMode === 'gpu' ? 0.22 : dense ? 0.22 : 0.32;
  const strong = lineMode === 'gpu' ? 0.85 : dense ? 0.8 : 1;
  const widths = lineMode === 'gpu' ? [1, 1.5] : dense ? [1, 1.4] : [1.25, 2.25];
  const paths: TracePath[] = [];
  for (const row of rows) {
    // The split's all-GPU line sits faint behind the lanes; aggregated traces stay dimmed.
    const dim = row.lane === 'context' ? 0.35 : row.lane === 'aggregated' ? 0.45 : 1;
    const thin = row.lane === 'context' ? 0.75 : 1;
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
        width: widths[0] * thin,
        opacity: faint * dim,
        points: full,
        pool: row.pool,
        lane: row.lane,
      });
    if (window.length > 1) {
      paths.push({
        id: `${trace.key}:${row.id}:window`,
        traceKey: trace.key,
        hwKey: trace.point.hwKey,
        overlayIndex,
        color,
        segment: 'window',
        width: widths[1] * thin,
        opacity: strong * dim,
        points: window,
        pool: row.pool,
        lane: row.lane,
      });
    }
  }
  return paths;
}

/** Samples in a centred rolling mean of `seconds`; 1 (the recorded samples) for 0. */
function smoothSpan(series: Pick<GpuPowerSeries, 'bucketSeconds'>, seconds: number): number {
  const bucket = series.bucketSeconds > 0 ? series.bucketSeconds : 1;
  return Math.max(1, Math.round(seconds / bucket));
}

function traceSamples(
  trace: PowerTimelineTrace,
  color: string,
  overlayIndex: number | null,
  xMode: XMode,
  lineMode: DrawMode,
  windowOnly: boolean,
  smoothSeconds = POWER_TIMELINE_SMOOTH_SECONDS,
  role: PowerXRole = 'all',
): TimelineSample[] {
  const { series } = trace;
  if (role !== 'all') {
    // Hover reads each lane's per-GPU mean, also when every GPU of the pools is drawn.
    return traceLanes(series, role).flatMap((lane) =>
      sampleRows(
        trace,
        color,
        overlayIndex,
        xMode,
        windowOnly,
        lane.rows,
        undefined,
        lineMode === 'gpu' ? 0 : smoothSeconds,
        { role: lane.role, kind: lane.kind, gpuCount: lane.rows.length },
      ),
    );
  }
  if (lineMode !== 'pool') {
    const rows = series.power.map((_, row) => row);
    return sampleRows(
      trace,
      color,
      overlayIndex,
      xMode,
      windowOnly,
      rows,
      undefined,
      smoothSeconds,
    );
  }
  return drawnPools(series).flatMap((pool) =>
    sampleRows(
      trace,
      color,
      overlayIndex,
      xMode,
      windowOnly,
      pool.rows,
      { role: pool.role, gpuCount: pool.rows.length },
      smoothSeconds,
    ),
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
  smoothSeconds = 0,
  lane?: LaneInfo,
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
      lane,
    });
  }
  if (smoothSeconds > 0) {
    const smoothed = rollingMean(
      samples.map((sample) => sample.y),
      smoothSpan(series, smoothSeconds),
    );
    samples.forEach((sample, index) => {
      sample.drawnY = smoothed[index] ?? sample.y;
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
    .attr('data-run-index', (path) => path.overlayIndex)
    .attr('data-pool', (path) => path.pool ?? null)
    .attr('data-lane', (path) => path.lane ?? null)
    .attr('stroke-dasharray', (path) => (path.pool ? poolDash(path.pool) : null))
    .attr('stroke', (path) => path.color)
    .attr('stroke-width', (path) => path.width)
    .attr('opacity', (path) => traceOpacity(path, highlight))
    .attr('d', (path) => line(path.points));
}

function isHighlighted(mark: TracePath | TraceLabel, highlight: string): boolean {
  return highlight === mark.hwKey || highlight === mark.traceKey || highlight === mark.series;
}

function traceOpacity(path: TracePath, highlight: string | null): number {
  if (highlight === null) return path.opacity;
  return isHighlighted(path, highlight) ? Math.min(1, path.opacity + 0.15) : path.opacity * 0.15;
}

function labelOpacity(label: TraceLabel, highlight: string | null): number {
  const base = label.lane === 'context' || label.lane === 'aggregated' ? 0.6 : 1;
  return highlight === null || isHighlighted(label, highlight) ? base : 0.2 * base;
}

function labelWidth(text: string): number {
  return text.length * LABEL_CHAR_WIDTH;
}

/** Right-gutter width that fits the longest trace label, capped so the plot keeps its room. */
function powerTimelineGutter(labels: readonly { text: string }[]): number {
  if (labels.length === 0) return MARGIN.right;
  const widest = Math.max(...labels.map((label) => labelWidth(label.text)));
  return Math.min(MAX_GUTTER, Math.ceil(widest + GUTTER_GAP + 6));
}

/**
 * Trace names sit in the right gutter, outside the clipped plot, spread so none overlap. A faint
 * leader joins each name to the end of its line, so traces that stop early stay attributable.
 */
function drawLabels(
  plotGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: AnyContinuousScale,
  yScale: AnyContinuousScale,
  model: DrawModel,
  plotWidth: number,
  plotHeight: number,
  highlight: string | null,
  inGutter: boolean,
  gutterWidth: number,
): void {
  plotGroup.selectAll('text.power-trace-label').remove();
  if (!inGutter) {
    // Phones name the traces in the HTML colour key above the plot instead.
    chartGroup.select('g.power-trace-gutter').remove();
    return;
  }
  let gutter = chartGroup.select<SVGGElement>('g.power-trace-gutter');
  if (gutter.empty()) gutter = chartGroup.append('g').attr('class', 'power-trace-gutter');
  const rowHeight = CHART_TYPE.dataLabel + 3;
  const ys = spreadLabelYs(
    model.labels.map((label) => yScale(label.y)),
    rowHeight,
    rowHeight / 2,
    plotHeight - rowHeight / 2,
  );
  const labelX = plotWidth + GUTTER_GAP;
  const items = gutter
    .selectAll<SVGGElement, TraceLabel>('g.power-trace-label-item')
    .data(model.labels, (label) => label.id);
  items.exit().remove();
  const entered = items.enter().append('g').attr('class', 'power-trace-label-item');
  entered.append('path').attr('class', 'power-trace-leader').attr('fill', 'none');
  entered
    .append('text')
    .attr('class', 'power-trace-label')
    .attr('font-family', CHART_FONT_SANS)
    .attr('font-size', px(CHART_TYPE.dataLabel))
    .attr('font-weight', '600')
    .attr('dominant-baseline', 'middle')
    .attr('pointer-events', 'none');
  const merged = entered.merge(items);
  const byId = new Map(model.labels.map((label, index) => [label.id, index]));
  merged.each(function (label) {
    const y = ys[byId.get(label.id)!];
    const endX = xScale(label.x);
    const endY = yScale(label.y);
    const item = d3.select(this);
    const opacity = labelOpacity(label, highlight);
    item
      .select('path.power-trace-leader')
      .attr('stroke', label.color)
      .attr('stroke-width', 1)
      .attr('opacity', 0.45 * opacity)
      .attr(
        'd',
        endX >= 0 && endX <= plotWidth
          ? `M${endX},${endY}L${plotWidth + 2},${endY}L${labelX - 3},${y}`
          : `M${plotWidth + 2},${y}L${labelX - 3},${y}`,
      );
    item
      .select<SVGTextElement>('text.power-trace-label')
      .attr('data-hw', label.hwKey)
      .attr('data-pool', label.pool ?? null)
      .attr('data-lane', label.lane ?? null)
      .attr('fill', label.color)
      .attr('opacity', opacity)
      .attr('text-anchor', 'start')
      .attr('x', labelX)
      .attr('y', y)
      .attr('data-full-text', label.text)
      .text(label.text)
      .each(function () {
        fitLabelToGutter(this, label.text, gutterWidth - GUTTER_GAP - 2);
      });
  });
}

/** The gutter is capped, so a name longer than it ends in an ellipsis instead of leaving the SVG. */
function fitLabelToGutter(node: SVGTextElement, text: string, room: number): void {
  if (typeof node.getComputedTextLength !== 'function' || room <= 0) return;
  if (node.getComputedTextLength() <= room) return;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    node.textContent = `${text.slice(0, mid).trimEnd()}…`;
    if (node.getComputedTextLength() <= room) low = mid;
    else high = mid - 1;
  }
  node.textContent = `${text.slice(0, low).trimEnd()}…`;
}

function drawReferenceLines(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: AnyContinuousScale,
  width: number,
  lines: ReferenceLine[],
): void {
  group.selectAll('.power-reference').remove();
  // Labels sit at the left end, above their line, and are spread so stacked TDPs stay legible;
  // the right end belongs to the trace leaders.
  const labelYs = spreadLabelYs(
    lines.map((line) => yScale(line.watts) - 6),
    REFERENCE_LABEL_ROW,
    REFERENCE_LABEL_ROW / 2,
    Number.POSITIVE_INFINITY,
  );
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
      .attr('opacity', 0.8);
    g.append('text')
      .attr('x', 6)
      .attr('y', labelYs[index])
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('fill', line.color)
      .attr('font-family', CHART_FONT_SANS)
      .attr('font-size', px(CHART_TYPE.annotation))
      .attr('font-weight', '600')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 3)
      .text(line.label);
  });
}

function shortHardware(point: InferenceData): string {
  const base = baseHardware(point.hwKey);
  return HW_REGISTRY[base]?.label ?? base.toUpperCase();
}

/** W per GPU → kW per NVL72 rack (the ×72 per NVL72 rack option). */
function toRackKw(watts: number): number {
  return (watts * NVL72_GPUS_PER_RACK) / 1000;
}

export default function PowerTimeline({
  chartId,
  data,
  overlayData,
  caption,
  footer,
  comparison = false,
  runNumbering: providedRunNumbering,
  role = 'all',
  powerXHeader,
  xField,
  height = CHART_HEIGHT,
}: PowerTimelineProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const layout = powerXHeader !== undefined;
  const compareAt = usePowerXCompareTarget() ?? POWERX_COMPARE_AT_DEFAULT;
  const { hardwareConfig, hwTypesWithData } = useInferenceData();
  const { activeHwTypes, selectedPrecisions, quickFilters, activeDates } = useInferenceFilters();
  const { isLegendExpanded, highContrast } = useInferenceDisplay();
  const { setBestPerSku, toggleHwType, selectAllHwTypes, setIsLegendExpanded, toggleActiveDate } =
    useInferenceActions();
  const { allGraphs: comparisonSeries, runNumbering } = useComparisonSeries(providedRunNumbering);
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
      i_ptconc: getUrlParam('i_ptconc'),
      i_ptraw: getUrlParam('i_ptraw'),
      i_ptsmooth: getUrlParam('i_ptsmooth'),
    }),
  );
  const powerXSurface = usePowerXSurface();
  const isPhone = useIsMobileViewport();
  // On the PowerX tab, align runs at serving start unless the URL picks an axis.
  const [xModeChoice, setXModeChoice] = useState<XMode | null>(
    initialView.axis ?? (powerXSurface ? 'serving' : null),
  );
  const [lineMode, setLineMode] = useState<LineMode>(initialView.lines);
  const [windowOnly, setWindowOnly] = useState(initialView.windowOnly);
  const [showUtility, setShowUtility] = useState(initialView.utility);
  const [raw, setRaw] = useState(initialView.raw);
  // PowerX layout: 5 s smoothing per breakpoint unless the URL picks it; elsewhere 30 s unless raw.
  const [smoothChoice, setSmoothChoice] = useState(initialView.smooth);
  const smooth = resolvePowerXTimelineSmooth(smoothChoice, isPhone);
  const smoothSeconds = layout
    ? smooth
      ? POWERX_TIMELINE_SMOOTH_SECONDS
      : 0
    : raw
      ? 0
      : POWER_TIMELINE_SMOOTH_SECONDS;
  const [rack, setRack] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(initialView.focus);
  const requestedFocusRef = useRequestedPowerTraceFocus();
  // An explicit concurrency in the URL wins; a shared or requested focus keeps every load so
  // the focused trace stays drawn; otherwise the PowerX layout reads each GPU nearest Compare at.
  const [concurrency, setConcurrency] = useState<TraceMode>(() => {
    if (requestedFocusRef.current) return 'all';
    if (initialView.concurrency !== null) return initialView.concurrency;
    if (!layout || initialView.everyConcurrency || initialView.focus) return 'all';
    return 'nearest';
  });

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
  const concurrencyOptions = useMemo(
    () =>
      [...new Set([...measuredData, ...overlayPoints].map((point) => point.conc))]
        .filter((conc) => Number.isSafeInteger(conc) && conc > 0)
        .toSorted((a, b) => a - b),
    [measuredData, overlayPoints],
  );
  // PowerX tab (old surface): first view compares chips at one shared load rather than every
  // concurrency. A shared or requested focus keeps every load so the focused trace stays drawn.
  const autoConcurrencyRef = useRef(
    !powerXSurface ||
      layout ||
      initialView.concurrency !== null ||
      Boolean(initialView.focus) ||
      Boolean(requestedFocusRef.current),
  );
  useEffect(() => {
    if (autoConcurrencyRef.current || measuredData.length === 0) return;
    autoConcurrencyRef.current = true;
    setConcurrency(mostCoveredConcurrency(measuredData) ?? 'all');
  }, [measuredData]);
  const comparisonSeriesOf = useCallback(
    (point: InferenceData) =>
      comparison && !overlayPointSet.has(point) ? `${point.date}_${point.hwKey}` : undefined,
    [comparison, overlayPointSet],
  );
  /** The GPU series a point belongs to: one line colour, one ranking row. */
  const gpuSeriesOf = useCallback(
    (point: InferenceData) =>
      overlayPointSet.has(point)
        ? `${point.run_url ?? ''}|${point.hwKey}`
        : (comparisonSeriesOf(point) ?? point.hwKey),
    [overlayPointSet, comparisonSeriesOf],
  );
  // The same interactivity Breakdown reads, so Over time and Breakdown pick the same point.
  const interactivity = useMemo(() => powerBreakdownInteractivity(xField).value, [xField]);
  const nearestPoints = useMemo(
    () =>
      nearestTracePoints(
        [...measuredData, ...overlayPoints],
        compareAt,
        gpuSeriesOf,
        interactivity,
      ),
    [measuredData, overlayPoints, compareAt, gpuSeriesOf, interactivity],
  );
  const nearestPointSet = useMemo(() => new Set(nearestPoints), [nearestPoints]);
  const allPoints = useMemo(
    () =>
      concurrency === 'nearest'
        ? nearestPoints
        : [...measuredData, ...overlayPoints].filter(
            (point) => concurrency === 'all' || point.conc === concurrency,
          ),
    [measuredData, overlayPoints, concurrency, nearestPoints],
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

  const requests = useMemo(() => planPowerTimelineRequests(allPoints), [allPoints]);
  const focusRun = traceKeyRunId(requestedFocusRef.current ?? focusKey);
  const officialHwTypes = localOfficialOverride ?? activeHwTypes;
  const isShown = useCallback(
    (point: InferenceData) => {
      if (overlayPointSet.has(point)) return activeOverlayHwTypes.has(point.hwKey);
      const series = comparisonSeriesOf(point);
      return series ? activeDates.has(series) : officialHwTypes.has(point.hwKey);
    },
    [overlayPointSet, activeOverlayHwTypes, comparisonSeriesOf, activeDates, officialHwTypes],
  );
  const overlayRunIds = useMemo(() => runIdsOf(overlayPoints), [overlayPoints]);
  const shownRunIds = useMemo(() => runIdsOf(allPoints.filter(isShown)), [allPoints, isShown]);
  const fetchedRequests = useMemo(
    () =>
      prioritizeRun(
        prioritizeRuns(prioritizeRuns(requests, overlayRunIds), shownRunIds),
        focusRun,
      ).slice(0, POWER_TIMELINE_MAX_RUNS),
    [requests, overlayRunIds, shownRunIds, focusRun],
  );
  const droppedRuns = requests.length - fetchedRequests.length;
  const combineQueries = useCallback(
    (results: UseQueryResult<GpuPowerSeriesResponse, Error>[]) => ({
      loadingRuns: results.filter((query) => query.isPending).length,
      errors: fetchedRequests.flatMap((request, index) => {
        const error = results[index]?.error;
        return error instanceof Error ? [{ request, error }] : [];
      }),
      resolved: fetchedRequests.flatMap((request, index) => {
        const response = results[index]?.data;
        return response ? [[request.runId, response] as const] : [];
      }),
    }),
    [fetchedRequests],
  );
  const { loadingRuns, errors, resolved } = useQueries({
    queries: fetchedRequests.map((request) => ({
      queryKey: ['power-timeline', request.runId, request.prefix, request.sources] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPowerSeries(request, signal),
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: 1,
    })),
    combine: combineQueries,
  });
  const responses = useMemo(() => new Map<string, GpuPowerSeriesResponse>(resolved), [resolved]);

  const { traces, missing } = useMemo(
    () => joinPowerTimeline(allPoints, responses),
    [allPoints, responses],
  );
  const hasAnyArtifact = requests.length > 0;

  useEffect(() => {
    const requested = requestedFocusRef.current;
    if (!requested) return;
    const trace = traces.find((entry) => entry.key === requested);
    if (!trace) return;
    requestedFocusRef.current = null;
    setFocusKey(trace.key);
    // Under a GPU role the lanes already split the pools; keep the role's view.
    if (role === 'all' && tracePools(trace.series).length > 0) setLineMode('pool');
  }, [traces, role]);

  useEffect(() => {
    if (loadingRuns > 0 || responses.size === 0) return;
    trackOncePerPageview('inference_power_timeline_loaded', {
      traces: traces.length,
      missing: missing.length,
      runs: responses.size,
    });
  }, [loadingRuns, responses.size, traces.length, missing.length]);

  const comparisonColors = useMemo(
    () => new Map(comparisonSeries.map((series) => [series.id, series.color])),
    [comparisonSeries],
  );
  const colorForTrace = useCallback(
    (trace: PowerTimelineTrace): { color: string; overlayIndex: number | null } => {
      if (overlayPointSet.has(trace.point)) {
        const index = overlayRunIndex(trace.point.run_url ?? null, runIndexByUrl);
        return { color: overlayRunColor(index), overlayIndex: index };
      }
      const series = comparisonSeriesOf(trace.point);
      const color =
        (series && comparisonColors.get(series)) ?? getCssColor(resolveColor(trace.point.hwKey));
      return { color, overlayIndex: null };
    },
    [
      overlayPointSet,
      runIndexByUrl,
      comparisonSeriesOf,
      comparisonColors,
      getCssColor,
      resolveColor,
    ],
  );
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
    () => traces.filter((trace) => isShown(trace.point)),
    [traces, isShown],
  );
  const focusedTrace = useMemo(
    () => visibleTraces.find((trace) => trace.key === focusKey) ?? null,
    [visibleTraces, focusKey],
  );
  const activeHighlight = highlight ?? focusedTrace?.key ?? null;
  const visibleRunCount = useMemo(
    () => new Set(visibleTraces.map((trace) => trace.runId)).size,
    [visibleTraces],
  );
  const xMode: XMode = xModeChoice ?? (visibleRunCount <= 1 ? 'wall' : 'elapsed');
  const drawMode = drawModeFor(lineMode, role);
  const hasAggregatedLane = useMemo(
    () =>
      role !== 'all' &&
      visibleTraces.some((trace) => traceLanes(trace.series, role)[0]?.kind === 'aggregated'),
    [visibleTraces, role],
  );

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
      i_ptconc:
        typeof concurrency === 'number'
          ? String(concurrency)
          : concurrency === 'all' && layout
            ? 'all'
            : '',
      i_ptraw: raw && !layout ? '1' : '',
      i_ptsmooth: layout ? powerXTimelineSmoothParam(smoothChoice) : '',
    });
  }, [
    xModeChoice,
    lineMode,
    windowOnly,
    focusKey,
    showUtility,
    concurrency,
    raw,
    smoothChoice,
    layout,
    setUrlParams,
  ]);

  const missingWindows =
    windowOnly || xMode === 'serving'
      ? visibleTraces.filter((trace) => !hasPowerTimelineWindow(trace)).length
      : 0;

  const hardwareLabel = useCallback(
    (point: InferenceData): string => {
      const config = overlayPointSet.has(point)
        ? overlayData?.hardwareConfig[point.hwKey]
        : hardwareConfig[point.hwKey];
      return config ? getDisplayLabel(config) : point.hwKey;
    },
    [overlayPointSet, overlayData, hardwareConfig],
  );
  const entryLabel = useCallback(
    (point: InferenceData) => comparisonEntryLabel(String(point.date), runNumbering),
    [runNumbering],
  );
  const seriesLabel = useCallback(
    (point: InferenceData): string =>
      comparisonSeriesOf(point)
        ? `${hardwareLabel(point)} · ${entryLabel(point)}`
        : hardwareLabel(point),
    [comparisonSeriesOf, hardwareLabel, entryLabel],
  );

  const model = useMemo<DrawModel>(() => {
    const paths: TracePath[] = [];
    const labels: TraceLabel[] = [];
    const bases = new Set(visibleTraces.map((trace) => baseHardware(trace.point.hwKey)));
    const hardwarePrefix = (trace: PowerTimelineTrace) => {
      if (bases.size < 2) return '';
      const base = baseHardware(trace.point.hwKey);
      return `${HW_REGISTRY[base]?.label ?? base.toUpperCase()} `;
    };
    const entries = new Set(
      visibleTraces
        .filter((trace) => comparisonSeriesOf(trace.point))
        .map((trace) => trace.point.date),
    );
    const entryPrefix = (trace: PowerTimelineTrace) =>
      entries.size > 1 && comparisonSeriesOf(trace.point) ? `${entryLabel(trace.point)} ` : '';
    for (const trace of visibleTraces) {
      const { color, overlayIndex } = colorForTrace(trace);
      const series = comparisonSeriesOf(trace.point);
      const tracePathSet = tracePaths(
        trace,
        color,
        overlayIndex,
        xMode,
        drawMode,
        windowOnly,
        smoothSeconds,
        visibleTraces.length > DENSE_TRACES,
        role,
      ).map((path) => ({ ...path, series }));
      paths.push(...tracePathSet);
      if (visibleTraces.length > MAX_LABELED_TRACES) continue;
      const groups: {
        id?: string;
        pool?: PowerPoolRole;
        lane?: PowerTraceLane;
        paths: TracePath[];
      }[] =
        role === 'all'
          ? drawMode === 'pool'
            ? drawnPools(trace.series).map((pool) => ({
                id: pool.role,
                pool: pool.role,
                paths: tracePathSet.filter((path) => path.pool === pool.role),
              }))
            : [{ paths: tracePathSet }]
          : traceLanes(trace.series, role)
              .filter((lane) => drawMode !== 'gpu' || lane.kind !== 'context')
              .map((lane) => ({
                id: `${lane.kind}:${lane.role}`,
                pool: lanePool(lane),
                lane,
                paths: tracePathSet.filter(
                  (path) => path.lane === lane.kind && path.pool === lanePool(lane),
                ),
              }));
      for (const group of groups) {
        const anchor =
          group.paths.find((path) => path.segment === 'window') ??
          group.paths.find((path) => path.segment === 'full');
        const last = anchor?.points.filter((point) => point.y !== null).at(-1);
        if (!last || last.y === null) continue;
        const suffix = group.lane
          ? ` · ${laneDirectLabel(group.lane.role, group.lane.kind, group.lane.rows.length, t)}`
          : group.pool
            ? ` · ${t.poolShort[group.pool]}`
            : '';
        labels.push({
          id: group.id ? `${trace.key}:${group.id}` : trace.key,
          traceKey: trace.key,
          hwKey: trace.point.hwKey,
          series,
          pool: group.pool,
          lane: group.lane?.kind,
          color,
          text: `${entryPrefix(trace)}${hardwarePrefix(trace)}c${trace.point.conc}${suffix}`,
          x: last.x,
          y: last.y,
        });
      }
    }
    return { paths, labels };
  }, [
    visibleTraces,
    colorForTrace,
    comparisonSeriesOf,
    entryLabel,
    xMode,
    drawMode,
    role,
    windowOnly,
    smoothSeconds,
    t,
  ]);

  const margin = useMemo(
    () =>
      // A phone cannot spare a label gutter: the plot takes the card width and the colour key
      // above it names the traces.
      isPhone
        ? { ...MARGIN, right: PHONE_MARGIN_RIGHT }
        : { ...MARGIN, right: powerTimelineGutter(model.labels) },
    [model.labels, isPhone],
  );

  const samples = useMemo(
    () =>
      visibleTraces.flatMap((trace) => {
        const { color, overlayIndex } = colorForTrace(trace);
        return traceSamples(
          trace,
          color,
          overlayIndex,
          xMode,
          drawMode,
          windowOnly,
          smoothSeconds,
          role,
        );
      }),
    [visibleTraces, colorForTrace, xMode, drawMode, windowOnly, smoothSeconds, role],
  );

  const referenceLines = useMemo<ReferenceLine[]>(() => {
    const lines: ReferenceLine[] = [];
    const pushLines = (base: string, color: string, pool?: PoolSizeGroup) => {
      const specs = HW_REGISTRY[base];
      if (!specs) return;
      const label = specs.label ?? base.toUpperCase();
      const size = pool?.size ?? 1;
      const id = pool ? `${base}:${pool.roles.join('+')}:${pool.size}` : base;
      const name = pool
        ? `${label} ${pool.roles.map((poolRole) => t.poolShort[poolRole]).join(' / ')} ×${pool.size}`
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
    const perBase = new Map<string, { color: string; pools: PowerPool[] }>();
    for (const trace of visibleTraces) {
      const base = baseHardware(trace.point.hwKey);
      if (!perBase.has(base)) perBase.set(base, { color: colorForTrace(trace).color, pools: [] });
      if (drawMode === 'pool') perBase.get(base)!.pools.push(...drawnPools(trace.series));
    }
    for (const [base, { color, pools }] of perBase) {
      if (drawMode !== 'pool') {
        pushLines(base, color);
        continue;
      }
      for (const group of groupPoolsBySize(pools)) pushLines(base, color, group);
    }
    return lines;
  }, [visibleTraces, colorForTrace, showUtility, drawMode, t]);

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
          getY: (sample) => sample.drawnY ?? sample.y,
          getColor: (sample) => sample.color,
          getRadius: () => 2,
          keyFn: (sample) =>
            sample.lane
              ? `${sample.trace.key}:${sample.lane.kind}:${sample.lane.role}:${sample.column}`
              : sample.pool
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
            ctx.layout.g,
            ctx.xScale as AnyContinuousScale,
            ctx.yScale as AnyContinuousScale,
            model,
            ctx.width,
            ctx.height,
            highlightRef.current,
            !isPhone,
            margin.right,
          );
        },
        onZoom: (group, ctx: ZoomContext) => {
          drawLabels(
            group,
            ctx.layout.g,
            ctx.newXScale as AnyContinuousScale,
            ctx.newYScale as AnyContinuousScale,
            model,
            ctx.width,
            ctx.height,
            highlightRef.current,
            !isPhone,
            margin.right,
          );
        },
      },
    ],
    [referenceLines, model, samples, isPhone, margin.right],
  );

  const onDisplayUpdate = useCallback(
    (ctx: RenderContext) => {
      const root = d3.select(ctx.layout.svg.node() as SVGSVGElement);
      root
        .selectAll<SVGPathElement, TracePath>('path.power-trace')
        .attr('opacity', (path) => traceOpacity(path, activeHighlight));
      root
        .selectAll<SVGTextElement, TraceLabel>('text.power-trace-label')
        .attr('opacity', (label) => labelOpacity(label, activeHighlight));
    },
    [activeHighlight],
  );

  const describeSample = useCallback(
    (sample: TimelineSample) => {
      const { trace, pool, lane } = sample;
      const point = trace.point;
      const overlayInfo =
        sample.overlayIndex === null ? null : unofficialRunInfos[sample.overlayIndex];
      const tdp = HW_REGISTRY[baseHardware(point.hwKey)]?.tdp ?? 0;
      const elapsed = formatElapsed((sample.timeMs - trace.series.startMs) / 1000);
      const clock = `${formatUtcClock(new Date(sample.timeMs))} UTC`;
      const validated = point.measuredAvgPower?.y;
      const tdpShare = tdp > 0 ? (sample.y / (tdp * (pool ? pool.gpuCount : 1))) * 100 : null;
      return {
        title: seriesLabel(point),
        subtitle: traceConfigLabel(point),
        warning: overlayInfo ? `✕ ${overlayInfo.branch || `#${overlayInfo.id}`}` : undefined,
        time:
          xMode === 'serving'
            ? `${sample.x.toFixed(1)} s · ${t.serving} · ${clock}`
            : xMode === 'wall'
              ? `${clock} · +${elapsed} ${t.sinceStart}`
              : `+${elapsed} · ${clock}`,
        watts: pool ? formatWatts(sample.y) : sample.y.toFixed(1),
        wattsLabel: pool
          ? t.poolPower
          : lane
            ? `${laneLabel(lane.role, lane.kind, lane.gpuCount, t)} · ${t.meanPerGpu}`
            : t.meanPerGpu,
        tdp:
          tdpShare === null
            ? null
            : { value: `${tdpShare.toFixed(0)}%`, label: pool ? t.poolTdp : t.tdp },
        rows: [
          ...(pool
            ? [
                {
                  label: t.pool,
                  value: `${t.poolShort[pool.role]} · ${t.gpus(pool.gpuCount)}`,
                },
                { label: t.meanPerGpu, value: `${(sample.y / sample.gpuCount).toFixed(1)} W` },
              ]
            : lane
              ? [
                  {
                    label: t.lane,
                    value: `${laneLabel(lane.role, lane.kind, lane.gpuCount, t)} · ${t.gpus(lane.gpuCount)}`,
                  },
                ]
              : [{ label: t.gpuCount, value: String(sample.gpuCount) }]),
          {
            label: t.range,
            value: `${sample.min.toFixed(1)} W / ${sample.max.toFixed(1)} W`,
          },
          { label: t.phaseLabel, value: t.phase[sample.phase] },
          ...(typeof validated === 'number'
            ? [{ label: t.validated, value: `${validated.toFixed(1)} W` }]
            : []),
          { label: t.precision, value: point.precision.toUpperCase() },
          { label: t.runDate, value: point.actualDate ?? comparisonEntryDate(point.date) },
        ],
        runUrl: point.run_url ? updateRepoUrl(point.run_url) : undefined,
      };
    },
    [unofficialRunInfos, xMode, t, seriesLabel],
  );

  const tooltipContent = useCallback(
    (sample: TimelineSample) => {
      const info = describeSample(sample);
      return chartHoverCard(
        {
          title: info.title,
          subtitle: info.subtitle,
          color: sample.color,
          warning: info.warning,
          metrics: [{ value: info.watts, label: 'W' }, ...(info.tdp ? [info.tdp] : [])],
          summary: sample.lane
            ? `${laneLabel(sample.lane.role, sample.lane.kind, sample.lane.gpuCount, t)} · ${t.gpus(sample.lane.gpuCount)} · ${info.time} · ${t.phase[sample.phase]}`
            : `${info.time} · ${t.phase[sample.phase]}`,
        },
        { pinned: false },
      );
    },
    [describeSample, t],
  );

  const tooltipDetails = useCallback(
    (sample: TimelineSample, _isOverlay: boolean, close: () => void) => {
      const info = describeSample(sample);
      return (
        <ChartPointDetails
          title={info.title}
          subtitle={info.subtitle}
          color={sample.color}
          warning={info.warning}
          date={info.time}
          metrics={[
            { value: info.watts, label: `${info.wattsLabel} (W)` },
            ...(info.tdp ? [info.tdp] : []),
          ]}
          rows={info.rows}
          links={
            info.runUrl
              ? [{ action: 'run', label: t.viewWorkflow, href: info.runUrl, external: true }]
              : []
          }
          onClose={close}
        />
      );
    },
    [describeSample, t],
  );

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
                lineDasharray: 'none',
                title: comparison ? t.unofficialRun : `${t.unofficialRun}: ${branch}`,
                isHighlighted: true,
                hw: `overlay-run-${info.id}`,
                isActive: true,
                isRemovable: false,
                onClick: () => {},
                tooltip: (
                  <div className="font-normal text-xs">
                    <div className="font-medium text-destructive">{t.unofficialRun}</div>
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
    if (comparison) {
      const seriesWithData = new Set(measuredData.map((point) => `${point.date}_${point.hwKey}`));
      const comparisonItems = comparisonSeries
        .filter(({ id }) => seriesWithData.has(id))
        .map(({ date, hwKey, id, color }) => ({
          name: `${hwKey} ${comparisonEntryLabel(date, runNumbering)}`,
          label: comparisonEntryLabel(date, runNumbering),
          color,
          lineDasharray: 'none',
          title: hardwareConfig[hwKey] ? getDisplayLabel(hardwareConfig[hwKey]) : hwKey,
          hw: id,
          isActive: activeDates.has(id),
          onClick: () => {
            toggleActiveDate(id);
            track('interactivity_date_toggled', { date, gpu: hwKey, view: 'power_timeline' });
          },
          tooltip: null,
        }));
      return [...overlayItems, ...comparisonItems];
    }
    const officialItems = hwKeysInData
      .filter((key) => hwTypesWithData.has(key) && hardwareConfig[key])
      .map((key) => {
        const config = hardwareConfig[key];
        return {
          name: config.name,
          label: getDisplayLabel(config),
          color: resolveColor(key),
          lineDasharray: 'none',
          title: config.gpu,
          hw: key,
          isActive: officialHwTypes.has(key),
          onClick: () => {
            handleToggleHwType(key);
            track('latency_hw_type_toggled', { gpu: key });
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
    comparison,
    comparisonSeries,
    measuredData,
    runNumbering,
    activeDates,
    toggleActiveDate,
  ]);

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
  // Under a GPU role the per-pool lanes supersede the summed pool lines.
  if (role === 'all' && (hasPools || lineMode === 'pool')) {
    switches.push({
      id: 'power-timeline-pools',
      label: t.pools,
      checked: lineMode === 'pool',
      onCheckedChange: (checked) => chooseLineMode(checked ? 'pool' : 'mean'),
      infoTooltip: t.poolsHelp,
    });
  }
  switches.push(
    layout
      ? {
          id: 'power-timeline-smooth',
          label: t.smooth,
          checked: smooth,
          onCheckedChange: (checked) => {
            setSmoothChoice(powerXTimelineSmoothChoice(checked, isPhone));
            track('powerx_timeline_smoothing_toggled', { enabled: checked });
          },
          infoTooltip: t.smoothHelp,
        }
      : {
          id: 'power-timeline-raw',
          label: t.raw,
          checked: raw,
          onCheckedChange: (checked) => {
            setRaw(checked);
            track('inference_power_timeline_raw_toggled', { enabled: checked });
          },
          infoTooltip: t.rawHelp,
        },
    {
      id: 'power-timeline-window-only',
      label: t.windowOnly,
      checked: windowOnly,
      onCheckedChange: (checked) => {
        setWindowOnly(checked);
        track('inference_power_timeline_window_changed', { window_only: checked });
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

  const overlayHwInScope = new Set(overlayPoints.map((point) => String(point.hwKey)));
  const hwFiltered =
    !comparison &&
    (hwKeysInData.some(
      (key) => hwTypesWithData.has(key) && hardwareConfig[key] && !officialHwTypes.has(key),
    ) ||
      [...overlayHwInScope].some((key) => !activeOverlayHwTypes.has(key)));
  const resetHwFilter = () => {
    selectAllHwTypes();
    if (overlayData) {
      setUnifiedOverlaySelection(
        new Set(hwTypesWithData),
        new Set([...activeOverlayHwTypes, ...overlayHwInScope]),
      );
    }
    track('inference_power_timeline_filter_reset');
  };

  const legendElement = (
    <ChartLegend
      variant="sidebar"
      grouped={comparison}
      disableActiveSort={comparison}
      legendItems={legendItems}
      onItemRemove={(hw) => legendItems.find((item) => item.hw === hw)?.onClick()}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={(expanded) => {
        setIsLegendExpanded(expanded);
        track('latency_legend_expanded', { enabled: expanded });
      }}
      onItemHover={(id) => setHighlight(id)}
      onItemHoverEnd={() => setHighlight(null)}
      hideAtomFootnote
      switches={switches}
      reset={{ id: 'power-timeline-reset-filter', disabled: !hwFiltered, onClick: resetHwFilter }}
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
      className="flex flex-col gap-2 pb-1 md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-x-4"
      data-testid="power-timeline-toolbar"
    >
      <ToolbarField label={t.concurrency} htmlFor={`${chartId}-power-timeline-concurrency`}>
        <ToolbarSelect
          id={`${chartId}-power-timeline-concurrency`}
          testId="power-timeline-concurrency"
          value={typeof concurrency === 'number' ? String(concurrency) : ''}
          onChange={(selected) => {
            const value = selected === '' ? null : Number(selected);
            setConcurrency(value ?? 'all');
            track('inference_power_timeline_concurrency_changed', { concurrency: value });
          }}
        >
          <option value="">{t.allConcurrencies}</option>
          {typeof concurrency === 'number' && !concurrencyOptions.includes(concurrency) && (
            <option value={concurrency}>{`c${concurrency}`}</option>
          )}
          {concurrencyOptions.map((conc) => (
            <option key={conc} value={conc}>{`c${conc}`}</option>
          ))}
        </ToolbarSelect>
      </ToolbarField>
      {visibleTraces.length > 1 && (
        <ToolbarField label={t.highlight} htmlFor={`${chartId}-power-timeline-highlight`}>
          <ToolbarSelect
            id={`${chartId}-power-timeline-highlight`}
            testId="power-timeline-highlight"
            className="md:max-w-56"
            value={focusedTrace?.key ?? ''}
            onChange={(selected) => {
              const key = selected === '' ? null : selected;
              setFocusKey(key);
              track('inference_power_timeline_highlight_changed', { highlighted: key !== null });
            }}
          >
            <option value="">{t.highlightNone}</option>
            {visibleTraces.map((trace) => (
              <option key={trace.key} value={trace.key}>
                {`${seriesLabel(trace.point)} · ${traceConfigLabel(trace.point)}`}
              </option>
            ))}
          </ToolbarSelect>
        </ToolbarField>
      )}
      <ToolbarField label={t.timeAxis}>
        <SegmentedToggle<XMode>
          value={xMode}
          ariaLabel={t.timeAxis}
          role="group"
          // Three long segments cannot share a phone row; a native select keeps one tidy control.
          variant={isPhone ? 'select' : 'segments'}
          testId="power-timeline-axis"
          className={isPhone ? 'w-full' : 'flex-nowrap'}
          buttonClassName="whitespace-nowrap"
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
      </ToolbarField>
    </div>
  );

  // The load-swings table and the insight card read the same traces: the focused one, or all.
  const swingTraces = useMemo(
    () => (loadingRuns > 0 ? [] : focusedTrace ? [focusedTrace] : visibleTraces),
    [loadingRuns, focusedTrace, visibleTraces],
  );
  const loadSwings = powerXSurface && swingTraces.length > 0 && (
    <PowerLoadSwings
      traces={swingTraces}
      colorOf={(trace) => colorForTrace(trace).color}
      labelOf={seriesLabel}
      role={role}
      rack={layout ? rack : undefined}
      note={layout && concurrency === 'nearest' ? t.swingsNote(compareAt) : undefined}
    />
  );

  // PowerX layout: the Trace control names whose trace is drawn, e.g. "GB300 NVL72 · c180
  // (nearest 80 tok/s/user)"; one option per mode, then each drawn trace to highlight.
  const traceName = (trace: PowerTimelineTrace) => {
    const nearest = concurrency === 'nearest' || nearestPointSet.has(trace.point);
    return isPhone
      ? t.traceNamedShort(shortHardware(trace.point), trace.point.conc, nearest)
      : t.traceNamed(seriesLabel(trace.point), trace.point.conc, nearest ? compareAt : null);
  };
  const namedTrace = focusedTrace ?? (visibleTraces.length === 1 ? visibleTraces[0] : null);
  const traceValue = focusedTrace
    ? `trace:${focusedTrace.key}`
    : typeof concurrency === 'number'
      ? `c${concurrency}`
      : concurrency;
  const traceSelect = layout && (
    <PowerXToolbarOption label={isPhone ? undefined : t.trace}>
      <div className="relative min-w-0">
        <select
          aria-label={t.trace}
          data-testid="power-timeline-trace"
          value={traceValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value.startsWith('trace:')) {
              setFocusKey(value.slice('trace:'.length));
              track('powerx_timeline_trace_changed', { trace: 'one' });
              return;
            }
            const next: TraceMode =
              value === 'nearest' || value === 'all' ? value : Number(value.slice(1));
            setFocusKey(null);
            setConcurrency(next);
            track('powerx_timeline_trace_changed', {
              trace: typeof next === 'number' ? 'concurrency' : next,
              concurrency: typeof next === 'number' ? next : null,
            });
          }}
          className={cn(
            POWERX_QUIET_BUTTON,
            'max-w-[26rem] appearance-none truncate pr-7 font-medium max-md:h-11 max-md:w-[6.75rem] max-md:pr-5',
          )}
        >
          <optgroup label={t.traceGroupAt}>
            <option value="nearest">
              {concurrency === 'nearest' && namedTrace && !focusedTrace
                ? traceName(namedTrace)
                : isPhone
                  ? t.traceNearestShort(compareAt)
                  : t.traceNearest(compareAt)}
            </option>
          </optgroup>
          <optgroup label={t.traceGroupConc}>
            <option value="all">{t.traceAll}</option>
            {typeof concurrency === 'number' && !concurrencyOptions.includes(concurrency) && (
              <option value={`c${concurrency}`}>{t.traceEvery(concurrency)}</option>
            )}
            {concurrencyOptions.map((conc) => (
              <option key={conc} value={`c${conc}`}>
                {t.traceEvery(conc)}
              </option>
            ))}
          </optgroup>
          {(visibleTraces.length > 1 || focusedTrace) && (
            <optgroup label={t.traceGroupOne}>
              {visibleTraces.map((trace) => (
                <option key={trace.key} value={`trace:${trace.key}`}>
                  {traceName(trace)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 size-4 max-md:right-1 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </PowerXToolbarOption>
  );
  const rackSwitch = layout && (
    <PowerXToolbarOption>
      <label
        className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap max-md:min-h-11"
        title={drawMode === 'pool' ? `${t.rackHelp} ${t.rackPoolNote}` : t.rackHelp}
      >
        <Switch
          checked={rack}
          data-testid="power-timeline-rack"
          onCheckedChange={(checked) => {
            setRack(checked);
            track('powerx_timeline_rack_toggled', { enabled: checked });
          }}
        />
        <span className="max-md:hidden">{t.rack}</span>
        <span className="md:hidden">{t.rackShort}</span>
      </label>
    </PowerXToolbarOption>
  );
  const defaultAxis: XMode = 'serving';
  const moreChanged =
    (xMode === defaultAxis ? 0 : 1) +
    (lineMode === 'mean' ? 0 : 1) +
    (smooth === powerXTimelineSmoothDefault(isPhone) ? 0 : 1) +
    (windowOnly ? 1 : 0) +
    (showUtility ? 1 : 0);
  const more = layout && (
    <PowerXMore
      tab="time"
      changed={moreChanged}
      onReset={() => {
        setXModeChoice(defaultAxis);
        setLineMode('mean');
        setSmoothChoice(null);
        setWindowOnly(false);
        setShowUtility(false);
      }}
    >
      <PowerXMoreGroup label={t.timeAxis}>
        <PowerXSeg<XMode>
          value={xMode}
          ariaLabel={t.timeAxis}
          testId="power-timeline-axis"
          className="flex-wrap"
          options={(['serving', 'elapsed', 'wall'] as const).map((mode) => ({
            value: mode,
            label: t.axisShort[mode],
            title: t[mode],
            testId: `power-timeline-axis-${mode}`,
          }))}
          onValueChange={(mode) => {
            setXModeChoice(mode);
            track('inference_power_timeline_axis_changed', { mode });
          }}
        />
      </PowerXMoreGroup>
      <PowerXMoreGroup label={t.lines}>
        {switches.map((entry) => (
          <label key={entry.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{entry.label}</span>
              {entry.infoTooltip && (
                <span className="text-xs text-muted-foreground">{entry.infoTooltip}</span>
              )}
            </span>
            <Switch
              checked={entry.checked}
              data-testid={entry.id}
              onCheckedChange={entry.onCheckedChange}
            />
          </label>
        ))}
      </PowerXMoreGroup>
    </PowerXMore>
  );

  // The ranking beside the plot: each GPU's Max 5 s swing at its trace nearest Compare at,
  // read from the same rows as the load-swings table.
  const swingRanking = useMemo(
    () =>
      layout && loadingRuns === 0
        ? powerXSwingRanking(loadSwingRows(visibleTraces, role), role, {
            at: compareAt,
            seriesOf: gpuSeriesOf,
            interactivityOf: interactivity,
          })
        : [],
    [layout, loadingRuns, visibleTraces, role, compareAt, gpuSeriesOf, interactivity],
  );
  const rankingTraceKeys = new Map(swingRanking.map((row) => [row.key, row.trace.key]));
  // The ranking's name line is the GPU, the framework moves to the sub line: two GB300 NVL72
  // configs no longer both truncate to "GB300 NVL7…".
  const rankingNames = (point: InferenceData) => {
    const overlay = overlayPointSet.has(point);
    const config = overlay ? overlayData?.hardwareConfig[point.hwKey] : hardwareConfig[point.hwKey];
    const entry = comparisonSeriesOf(point) ? ` · ${entryLabel(point)}` : '';
    const mark = overlay ? '✕ ' : '';
    return {
      label: `${mark}${config?.label ?? point.hwKey}${entry}`,
      framework: config?.suffix ? powerXFrameworkName(config.suffix) : undefined,
      fullLabel: `${mark}${seriesLabel(point)}`,
    };
  };
  const rankingRows: PowerXSwingRankingRowView[] = swingRanking.map((row) => {
    const { point } = row.trace;
    const bare = (watts: number | null) => formatLoadSwingWatts(watts, rack).replace(/ k?W$/u, '');
    return {
      key: row.key,
      ...rankingNames(point),
      color: colorForTrace(row.trace).color,
      rank: row.rank,
      valueText: row.pools
        ? `${bare(row.pools.prefill)} / ${bare(row.pools.decode)}`
        : row.value === null
          ? null
          : formatLoadSwingWatts(row.value, rack),
      delta: row.delta,
      hidden: false,
      aggregated: row.aggregated,
      conc: point.conc,
      x: interactivity(point) ?? null,
      detail:
        row.value === null || row.pools
          ? undefined
          : rack
            ? t.perGpuValue(formatLoadSwingWatts(row.value, false))
            : t.perRack(formatLoadSwingWatts(row.value, true)),
      highlighted: namedTrace?.key === row.trace.key,
      locked: overlayPointSet.has(point),
    };
  });
  for (const item of legendItems) {
    if (item.hw.startsWith('overlay-run-') || rankingTraceKeys.has(item.hw)) continue;
    const config = comparison ? undefined : hardwareConfig[item.hw];
    rankingRows.push({
      key: item.hw,
      label: comparison ? `${item.title} · ${item.label}` : (config?.label ?? item.label),
      framework: config?.suffix ? powerXFrameworkName(config.suffix) : undefined,
      fullLabel: comparison ? undefined : item.label,
      color: comparison ? item.color : getCssColor(item.color),
      rank: null,
      valueText: null,
      delta: null,
      hidden: !item.isActive,
      aggregated: false,
      conc: null,
      x: null,
      loading: item.isActive && loadingRuns > 0,
    });
  }
  rankingRows.sort((a, b) => Number(a.hidden) - Number(b.hidden));
  const rankingElement = layout && (
    <PowerXSwingRanking
      at={compareAt}
      unit={
        role === 'split'
          ? t.swingUnitSplit(rack ? t.unitRack : t.unitGpu)
          : t.swingUnit(rack ? t.unitRack : t.unitGpu)
      }
      rows={rankingRows}
      onToggle={(key) => legendItems.find((item) => item.hw === key)?.onClick()}
      onHover={(key) => setHighlight(key === null ? null : (rankingTraceKeys.get(key) ?? key))}
    />
  );
  const rackAxis = layout && rack && drawMode !== 'pool';
  const yLabel = rackAxis
    ? drawMode === 'gpu'
      ? t.yGpuRack
      : t.yMeanRack
    : drawMode === 'pool'
      ? t.yPool
      : drawMode === 'gpu'
        ? t.yGpu
        : t.yMean;

  const status = powerTimelineStatus({
    loadingRuns,
    fetchedRuns: fetchedRequests.length,
    failedRuns: errors.length,
    hasAnyArtifact,
    visibleTraces: visibleTraces.length,
    missingWindows,
    drawable: model.paths.length > 0,
  });
  const blocked = status?.blocking === true;

  // PowerX layout: the ranking names the GPUs; phones still key the dashed pool lanes.
  const phoneKeyNeeded = drawMode === 'pool' || role === 'split';
  const chartElement = (
    <D3Chart<TimelineSample>
      key={`${chartId}-${xMode}-${drawMode}-${role}-${windowOnly}-${rackAxis}`}
      chartId={chartId}
      data={samples}
      height={height}
      margin={margin}
      watermark={overlayData && overlayPoints.length > 0 ? 'unofficial' : 'logo'}
      testId="power-timeline-chart-svg"
      grabCursor
      instructions={powerXSurface || blocked ? '' : t.instructions}
      xScale={
        xMode === 'wall'
          ? { type: 'time', domain: [new Date(xDomain[0]), new Date(xDomain[1])] }
          : { type: 'linear', domain: xDomain }
      }
      yScale={{ type: 'linear', domain: yDomain, nice: true }}
      xAxis={{
        label: xMode === 'wall' ? t.xWall : xMode === 'serving' ? t.xServing : t.xElapsed,
        tickValues: (scale) => {
          const timeScale = scale as d3.ScaleTime<number, number> | d3.ScaleLinear<number, number>;
          const [left, right] = timeScale.range();
          const spacing = isPhone ? X_TICK_SPACING.phone : X_TICK_SPACING.desktop;
          return timeScale.ticks(Math.max(2, Math.min(10, Math.floor((right - left) / spacing))));
        },
        tickFormat: xTickFormat,
      }}
      yAxis={{
        label: yLabel,
        tickCount: 8,
        // ×72 per NVL72 rack: the data stays in W per GPU; ticks fall on round kW.
        ...(rackAxis && {
          tickValues: (scale) => {
            const [low, high] = (scale as AnyContinuousScale).domain();
            return d3
              .ticks(toRackKw(low), toRackKw(high), 8)
              .map((kw) => (kw * 1000) / NVL72_GPUS_PER_RACK);
          },
          tickFormat: (value) => d3.format('~g')(Number(toRackKw(Number(value)).toPrecision(6))),
        }),
      }}
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
        details: tooltipDetails,
        getRulerX: (sample, xScale) => (xScale as AnyContinuousScale)(sample.x),
        getRulerY: (sample, yScale) => yScale(sample.drawnY ?? sample.y),
        onHoverStart: (selection) => {
          selection
            .attr('r', 5)
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .style('fill-opacity', 1);
        },
        onHoverEnd: (selection) => {
          selection.attr('r', 2).attr('stroke', 'none').style('fill-opacity', null);
        },
        attachToLayer: 2,
      }}
      legendElement={layout ? rankingElement : legendElement}
      footer={footer}
      caption={
        <>
          {layout
            ? powerXHeader({
                options: (
                  <>
                    {traceSelect}
                    {rackSwitch}
                  </>
                ),
                more,
                title: yLabel,
              })
            : caption}
          {!layout && toolbar}
          {!layout && !isPhone && loadSwings}
          {isPhone && model.labels.length > 0 && (!layout || phoneKeyNeeded) && (
            <ul
              className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs"
              aria-label={t.traceKey}
              data-testid="power-timeline-key"
            >
              {model.labels.map((label) => (
                <li
                  key={label.id}
                  className="flex items-center gap-1.5 font-medium whitespace-nowrap"
                  style={{ opacity: labelOpacity(label, activeHighlight) }}
                  data-hw={label.hwKey}
                >
                  <svg aria-hidden="true" width="14" height="6" className="shrink-0">
                    <line
                      x1="0"
                      x2="14"
                      y1="3"
                      y2="3"
                      stroke={label.color}
                      strokeWidth="3"
                      strokeDasharray={(label.pool && poolDash(label.pool)) || undefined}
                    />
                  </svg>
                  {label.text}
                </li>
              ))}
            </ul>
          )}
        </>
      }
      noDataOverlay={status ? <PowerTimelineStatusPanel status={status} t={t} /> : undefined}
    />
  );
  const statusElement = (
    <div
      className="flex flex-col gap-1 px-1 text-xs text-muted-foreground"
      data-testid="power-timeline-status"
    >
      {focusedTrace && (
        <p
          className="inline-flex items-center gap-2 self-start rounded-md border border-border/30 px-2 py-0.5"
          data-testid="power-timeline-focus"
        >
          <span>
            {t.focused(
              `${seriesLabel(focusedTrace.point)} · ${traceConfigLabel(focusedTrace.point)}`,
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
      {errors.map(({ request, error }) => (
        <p key={request.runId} className="text-destructive" role="alert">
          {t.loadError(request.runId, error.message)}
        </p>
      ))}
      {droppedRuns > 0 && <p>{t.droppedRuns(droppedRuns)}</p>}
      {hasAggregatedLane && <p data-testid="power-timeline-aggregated">{t.aggregatedNote}</p>}
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
    </div>
  );
  const summaryElement = loadingRuns === 0 && visibleTraces.length > 0 && (
    <PowerTimelineSummary
      traces={visibleTraces}
      responses={responses}
      colorOf={(trace) => colorForTrace(trace).color}
      hardwareLabel={seriesLabel}
      isOverlay={(point) => overlayPointSet.has(point)}
      role={role}
    />
  );

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 [&_circle.point]:[fill-opacity:0]',
        // Nothing to draw yet: hide the placeholder axes, grid and watermark so the status panel
        // is the only thing in the plot area instead of text over a fake 0–100 W scale.
        blocked && "[&_svg[data-testid='d3-chart-svg']]:invisible",
      )}
      data-testid="power-timeline"
      data-status={status?.kind ?? 'ready'}
    >
      {layout ? (
        <PowerXChartFrame
          toolbar={null}
          chart={chartElement}
          below={
            <div className="mt-2 flex flex-col gap-3">
              {statusElement}
              {loadSwings}
              <PowerLoadSwingsCaveat />
              {summaryElement}
            </div>
          }
        />
      ) : (
        <>
          {chartElement}
          {powerXSurface && <PowerLoadSwingsCaveat />}
          {/* On phones the per-trace stat cards follow the chart so the plot stays near the top. */}
          {isPhone && loadSwings}
          {statusElement}
          {summaryElement}
        </>
      )}
    </div>
  );
}

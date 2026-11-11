'use client';

import { curveLinear, select, timer, type ScaleContinuousNumeric, type Timer } from 'd3';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import ChartLegend, { type CommonLegendItemProps } from '@/components/ui/chart-legend';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { D3Chart, type D3ChartHandle } from '@/lib/d3-chart/D3Chart';
import type {
  LayerConfig,
  RenderContext,
  ScaleConfig,
  TooltipConfig,
} from '@/lib/d3-chart/D3Chart/types';
import { readableTextColor } from '@/lib/d3-chart/contrast-colors';
import { axisLabelUnit, chartHoverCard, chartHoverCardImage } from '@/lib/d3-chart/tooltip-shell';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { ShapeKey } from '@/lib/charts/chart-rendering';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { logDomain, zeroAnchoredDomain } from './chart-domain';
import {
  PILL_HEIGHT,
  boxesOverlap,
  clearOfLabels,
  labelShift,
  pillBox,
  spreadPills,
} from './chart-marks';
import { mayHaveClips } from './clip-stage';
import { serverSplit } from './deployment';
import { engineLabel, engineShape, engineSort } from './engines';
import { isLossy, lossyLabel, runtimeLabel } from './optimizations';
import { hardwareLabel, hardwareSort } from './hardware';
import type { ResultCell, ResultsState } from './results';
import {
  RESULTS_X_METRIC_KEYS,
  RESULTS_X_METRICS,
  RESULTS_Y_METRIC_KEYS,
  RESULTS_Y_METRICS,
  comparesEngines,
  plottedXMetric,
  resultsClip,
  resultsMetricLabel,
  resultsPlotSeries,
  type ResultsChartPoint,
  type ResultsChartSeries,
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
    unofficialPill: 'unofficial',
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
      'Adds dashed lines for runs that skip or approximate computation, such as cross-step caching or sparse attention. They never compete for a GPU’s default line, and each brings the lossless line of the same run, engine and layout to compare with. Scoring quality against the same engine’s lossless output is planned.',
    lossySeries: 'Lossy optimization lines',
    playing: 'Playing',
    baseline: 'Baseline',
    tipPlaying: 'Playing below',
    tipBaseline: 'Baseline below',
    tipClick: 'Click to compare below',
    tipHollow: 'Only filled points have clips',
    compareBelow: 'Compare below ↓',
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
    unofficialPill: '非官方',
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
      '以虚线加入跳过或近似部分计算的运行，例如跨步 cache 或稀疏注意力。它们不参与每张 GPU 默认线的评选，并会带上同一运行、引擎和布局下的无损对照线。以同一引擎无损输出为基准的质量评分仍在计划中。',
    lossySeries: '有损优化线',
    playing: '播放中',
    baseline: '基线',
    tipPlaying: '正在下方播放',
    tipBaseline: '在下方作为基线播放',
    tipClick: '点击即可在下方对比',
    tipHollow: '只有实心点有视频',
    compareBelow: '在下方对比 ↓',
  },
};

interface PlotPoint extends ResultsChartPoint {
  /** Required by the shared scatter layer; the engine, not a precision, sets the shape. */
  precision: '';
  hardwareKey: string;
  engine: string | null;
  overlay: boolean;
  color: string;
  /** A click loads it on the clip stage; without clips it draws hollow. */
  clips: boolean;
  /** Its series, so hovering one point brings its whole line into focus. */
  series: string;
}

/** The pill that names a drawn series at its line end. */
interface SeriesPill {
  key: string;
  text: string;
  color: string;
  lossy: boolean;
  overlay: boolean;
  /** The point it sits beside: the last frontier point, or the best point without a frontier. */
  end: string;
}

/** What the marks layer reads on every redraw; kept in a ref so it never rebuilds the plot. */
interface MarkInputs {
  link: ClipLink | undefined;
  /** The hovered point's series. */
  hover: string | null;
  pills: readonly SeriesPill[];
}

interface PlotSize {
  width: number;
  height: number;
}

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];

/** The chart side of the clip stage: the points its two sides play, and a click that loads one. */
export interface ClipLink {
  playing: string | null;
  baseline: string | null;
  /** First frames of the stage's prompt by point key, for the hover card; null once read without one. */
  posters: Readonly<Record<string, string | null>>;
  /** Playable points pulse until the reader first picks a clip. */
  pulse: boolean;
  onSelect: (pointKey: string) => void;
  /** The reader rests on a point whose first frame is unknown, so its clips can be read ahead. */
  onPeek: (pointKey: string) => void;
  /** Brings the stage into view. */
  onReveal: () => void;
}

const LOSSY_DASH = '6 4';
const BADGES = 'clip-badges';
const PULSE = 'video-clip-pulse';
/** How long the pointer rests on a point before its clips are read for the hover card, in ms. */
const PEEK_DELAY = 250;

/** Points without clips draw hollow; that depends on the data only, so it follows each plot render. */
function drawHollow(root: Element) {
  select(root)
    .selectAll<SVGGElement, PlotPoint>('.dot-group')
    .each(function (point) {
      const shape = this.querySelector<SVGElement>('.visible-shape');
      if (!shape) return;
      shape.style.fill = point.clips ? '' : 'var(--card)';
      shape.style.stroke = point.clips ? '' : point.color;
      shape.style.strokeWidth = point.clips ? '' : '1.5px';
    });
}

const PILLS = 'series-pills';
/** How long points and lines glide to new data, as on the inference scatter chart. */
const TRANSITION_MS = 300;
/** One display frame, so the marks' last redraw lands after the points' last step. */
const FRAME_MS = 20;
/** Plot width, in px, below which only focus overlay lines get a pill. */
const NARROW_PLOT = 480;

/** The plot position a point's group was moved to. */
function pointPosition(node: Element): { x: number; y: number } | null {
  const match = /translate\(\s*(?<x>[-\d.e]+)[\s,]+(?<y>[-\d.e]+)\s*\)/u.exec(
    node.getAttribute('transform') ?? '',
  );
  return match?.groups ? { x: Number(match.groups.x), y: Number(match.groups.y) } : null;
}

/** Rendered text width, with a character estimate where layout is unavailable. */
function textWidth(node: SVGTextElement, size: number): number {
  return node.getComputedTextLength() || [...(node.textContent ?? '')].length * size * 0.6;
}

/**
 * Rings and labels the two points the stage plays, names each series at its line end, and
 * shows point labels only on the focus series: the playing, baseline and hovered ones. Pills
 * and badges sit in groups after every point so no point or label covers them, and copy the
 * points' transforms, so this runs after every plot render, zoom frame, pick and hover,
 * never reordering the points themselves.
 */
function drawMarks(root: Element, size: PlotSize, inputs: MarkInputs, s: Strings) {
  root.querySelector(`.${BADGES}`)?.remove();
  root.querySelector(`.${PILLS}`)?.remove();
  const points = [...root.querySelectorAll<SVGGElement>('.dot-group')];
  const host = points[0]?.parentNode;
  if (!host) return;
  const { link, hover } = inputs;
  const nodes = new Map<string, SVGGElement>();
  const focus = new Set<string>(hover === null ? [] : [hover]);
  for (const node of points) {
    const point = select<SVGGElement, PlotPoint>(node).datum();
    nodes.set(point.key, node);
    if (link && (point.key === link.playing || point.key === link.baseline))
      focus.add(point.series);
  }

  // Point labels: focus series only, kept inside the plot and off each other.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const node of points) {
    const label = node.querySelector<SVGTextElement>('.point-label');
    if (!label) continue;
    const point = select<SVGGElement, PlotPoint>(node).datum();
    const badged = link && (point.key === link.playing || point.key === link.baseline);
    const at = pointPosition(node);
    let shown = !badged && focus.has(point.series) && at !== null;
    label.removeAttribute('transform');
    if (shown && at) {
      // Show before measuring: a hidden label has no layout, so it would measure 0.
      label.style.display = '';
      const width = textWidth(label, CHART_TYPE.dataLabel);
      const shift = labelShift(at.x, width, size.width);
      const box = {
        x0: at.x + shift - width / 2,
        x1: at.x + shift + width / 2,
        y0: at.y - 18,
        y1: at.y - 6,
      };
      shown = !placed.some((other) => boxesOverlap(other, box));
      if (shown) {
        placed.push(box);
        if (shift !== 0) label.setAttribute('transform', `translate(${shift},0)`);
      }
    }
    label.style.display = shown ? '' : 'none';
    node.toggleAttribute('data-labelled', shown);
  }

  // Series pills, beside each line's last point inside the plot, spread apart vertically.
  const pillLayer = select(host as SVGGElement)
    .append('g')
    .attr('class', PILLS)
    .attr('pointer-events', 'none');
  // Each shown label covers its point too, so a pill keeps clear of both.
  const covered = placed.map((label) => ({ ...label, y1: label.y1 + 11 }));
  const boxes = inputs.pills.flatMap((pill) => {
    // A narrow plot has no room to name every overlay line; it names the focus ones.
    if (pill.overlay && size.width < NARROW_PLOT && !focus.has(pill.key)) return [];
    const node = nodes.get(pill.end);
    const at = node && pointPosition(node);
    if (!at || at.x < 0 || at.x > size.width || at.y < 0 || at.y > size.height) return [];
    const group = pillLayer
      .append('g')
      .attr('data-series-pill', pill.key)
      .attr('data-lossy', String(pill.lossy));
    const rect = group
      .append('rect')
      .attr('height', PILL_HEIGHT)
      .attr('rx', 4)
      .attr('fill', pill.lossy ? 'var(--card)' : pill.color)
      .attr('stroke', pill.color)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', pill.lossy ? '3 2' : null);
    const text = group
      .append('text')
      .attr('x', 6)
      .attr('y', PILL_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('font-size', px(CHART_TYPE.annotation))
      .attr('font-weight', 600)
      .attr('fill', pill.lossy ? 'var(--foreground)' : readableTextColor(pill.color))
      .text(pill.text);
    const width = textWidth(text.node()!, CHART_TYPE.annotation) + 12;
    rect.attr('width', width);
    const box = pillBox(pill.key, at, width, size.width);
    clearOfLabels(box, at, covered, size.width);
    return [{ box, group }];
  });
  const spread = spreadPills(
    boxes.map(({ box }) => box),
    size.height,
    covered,
  );
  boxes.forEach(({ group }, index) =>
    group.attr('transform', `translate(${spread[index].x},${spread[index].y})`),
  );

  // Pulses live inside each point, so a redraw on hover or zoom does not restart them.
  for (const node of points) {
    const point = select<SVGGElement, PlotPoint>(node).datum();
    const on =
      link?.pulse && point.clips && point.key !== link.playing && point.key !== link.baseline;
    let ring = node.querySelector<SVGCircleElement>(`:scope > .${PULSE}`);
    if (!on) {
      ring?.remove();
      continue;
    }
    if (!ring) {
      ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.classList.add(PULSE);
      ring.setAttribute('r', '10');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('pointer-events', 'none');
      node.prepend(ring);
    }
    ring.setAttribute('stroke', point.color);
  }

  if (!link) return;
  const layer = select(host as SVGGElement)
    .append('g')
    .attr('class', BADGES)
    .attr('pointer-events', 'none');
  for (const node of points) {
    const point = select<SVGGElement, PlotPoint>(node).datum();
    const role =
      point.key === link.playing ? 'playing' : point.key === link.baseline ? 'baseline' : null;
    node.toggleAttribute('data-clip-role', role !== null);
    if (role) node.dataset.clipRole = role;
    if (!role) continue;
    const playing = role === 'playing';
    const badge = layer
      .append('g')
      .attr('data-clip-badge', role)
      .attr('data-point', point.key)
      .attr('transform', node.getAttribute('transform'));
    badge
      .append('circle')
      .attr('r', 8)
      .attr('fill', 'none')
      .attr('stroke', point.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', playing ? null : '3 2');
    const text = badge
      .append('text')
      .attr('y', -20)
      .attr('dominant-baseline', 'central')
      .attr('font-size', px(CHART_TYPE.annotationSub))
      .attr('font-weight', 600)
      .attr('fill', playing ? readableTextColor(point.color) : 'var(--foreground)')
      .text(playing ? s.playing : s.baseline);
    const label = text.node()!;
    const labelWidth =
      label.getComputedTextLength() || [...label.textContent!].length * CHART_TYPE.annotationSub;
    const icon = playing ? 8 : 0;
    const width = labelWidth + icon + 12;
    text.attr('x', -width / 2 + 6 + icon);
    badge
      .insert('rect', 'text')
      .attr('x', -width / 2)
      .attr('y', -28)
      .attr('width', width)
      .attr('height', 16)
      .attr('rx', 8)
      .attr('fill', playing ? point.color : 'var(--card)')
      .attr('stroke', playing ? 'none' : point.color)
      .attr('stroke-width', 1);
    if (playing)
      badge
        .append('path')
        .attr('d', `M${-width / 2 + 6} -23 l5 3 l-5 3 z`)
        .attr('fill', readableTextColor(point.color));
  }
}

/** "B200 (SGLang)" for a lossless line, "B200 · FirstBlockCache" for a lossy one, as the legend names them. */
function pillText(item: ResultsChartSeries, s: Strings, history: boolean): string {
  const hardware = hardwareLabel(item.hardwareKey);
  const lossy = item.lossy ? lossyLabel(item.optimizations) : null;
  const name = lossy
    ? `${hardware} · ${lossy}`
    : item.engine
      ? `${hardware} (${engineLabel(item.engine)})`
      : hardware;
  // A Chip config history line is one deployment, so its GPU count tells same-GPU lines apart.
  const gpus = history ? item.points[0]?.cell.point.participating : undefined;
  return [name, gpus === undefined ? null : s.gpus(gpus), item.overlay ? s.unofficialPill : null]
    .filter(Boolean)
    .join(' · ');
}

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
  clipLink,
  heading,
  footer,
  lossyNote,
  loading = false,
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
  clipLink?: ClipLink;
  /** Chart title; it sits in the chart caption so image exports carry it. */
  heading?: ReactNode;
  /** Result context under the chart. */
  footer?: ReactNode;
  /** Under the legend's lossy line key, shown while a lossy line is charted. */
  lossyNote?: ReactNode;
  /** The cohort is still loading: an empty plot shows a skeleton, not the no-data note. */
  loading?: boolean;
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
  const chart = useRef<D3ChartHandle>(null);
  // Kept out of `layers` and `tooltip`: a new one rebuilds the plot, which closes a pinned panel.
  const link = useRef(clipLink);
  link.current = clipLink;
  const hover = useRef<string | null>(null);
  /** The point under the pointer, whose hover card may still wait for its first frame. */
  const hovered = useRef<string | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  const size = useRef<PlotSize>({ width: 0, height: 0 });
  const [transition] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 0
      : TRANSITION_MS,
  );
  /** Redraws the marks while points glide, since the marks copy the points' transforms. */
  const follow = useRef<Timer | null>(null);
  useEffect(() => () => follow.current?.stop(), []);
  // Hidden hardware is dropped after ranking, so its legend entry still names its engine.
  const ranked = useMemo(() => resultsPlotSeries(cells, history, state), [cells, history, state]);
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
          clips: mayHaveClips(point.cell.point),
          series: item.key,
        })),
      ),
    [series, colorFor],
  );
  const better = y.better === 'higher' ? 1 : -1;
  const pills = useMemo<SeriesPill[]>(
    () =>
      series.flatMap((item) => {
        const end =
          item.frontier.at(-1) ??
          item.points.reduce<ResultsChartPoint | undefined>(
            (best, point) => (!best || better * (point.y - best.y) > 0 ? point : best),
            undefined,
          );
        return end
          ? [
              {
                key: item.key,
                text: pillText(item, s, history !== null),
                color: item.overlay ? overlayRunColor(0) : colorFor(item.hardwareKey),
                lossy: item.lossy,
                overlay: item.overlay,
                end: end.key,
              },
            ]
          : [];
      }),
    [series, s, history, colorFor, better],
  );
  const marks = useRef<MarkInputs>({ link: clipLink, hover: null, pills });
  marks.current = { link: clipLink, hover: hover.current, pills };
  const lines = useMemo(
    () =>
      Object.fromEntries(
        series
          .filter((item) => item.frontier.length > 1)
          .map((item) => [item.key, item.frontier.map((point) => ({ x: point.x, y: point.y }))]),
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
            clips: (point) => String(point.clips),
          },
        },
      },
      {
        type: 'custom',
        key: 'video-results-clip-marks',
        render: (group) => {
          const root = group.node();
          if (root && link.current) drawHollow(root);
        },
        onZoom: (group, { width, height }) => {
          const root = group.node();
          if (root) drawMarks(root, { width, height }, marks.current, s);
        },
      },
    ],
    [lines, lineColors, lineDashes, plotted, labels, s, history, byEngine, labelsRepeatX],
  );
  const playing = clipLink?.playing ?? null,
    baseline = clipLink?.baseline ?? null,
    pulse = clipLink?.pulse ?? false,
    posters = clipLink?.posters;
  const redraw = useCallback(() => {
    const svg = chart.current?.getSvgElement();
    if (svg) drawMarks(svg, size.current, marks.current, s);
  }, [s]);
  useLayoutEffect(redraw, [playing, baseline, pulse, pills, redraw]);
  // A first frame read after its card opened fills the box the card reserved for it.
  useEffect(() => {
    const key = hovered.current;
    const box = chart.current
      ?.getTooltipElement()
      ?.querySelector<HTMLElement>('[data-hover-image-pending]');
    if (!key || !box || !posters || !(key in posters)) return;
    const url = posters[key];
    if (url) box.outerHTML = chartHoverCardImage(url);
    else box.closest('[data-hover-media]')?.remove();
  }, [posters]);
  // Runs after the plot raises its points, so the badges stay in front, and on every frame
  // of the points' glide to new data, so the badges and pills move with them.
  const onRender = useCallback(
    ({ layout, width, height }: RenderContext) => {
      size.current = { width, height };
      const root = layout.zoomGroup.node();
      if (!root) return;
      drawMarks(root, size.current, marks.current, s);
      follow.current?.stop();
      if (transition === 0) return;
      follow.current = timer((elapsed) => {
        // After the frame's transition ticks, which run later in the same timer flush.
        queueMicrotask(() => drawMarks(root, size.current, marks.current, s));
        if (elapsed >= transition + FRAME_MS) follow.current?.stop();
      });
    },
    [s, transition],
  );
  // An image export renders a resized clone, so it must not overwrite the live plot size.
  const onExportRender = useCallback(
    ({ layout, width, height }: RenderContext) => {
      const root = layout.zoomGroup.node();
      if (!root) return;
      const { link: live } = marks.current;
      const still = { ...marks.current, hover: null, link: live && { ...live, pulse: false } };
      drawMarks(root, { width, height }, still, s);
    },
    [s],
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
        const pair = link.current;
        const hint =
          pair &&
          (plot.key === pair.playing
            ? s.tipPlaying
            : plot.key === pair.baseline
              ? s.tipBaseline
              : plot.clips
                ? s.tipClick
                : s.tipHollow);
        return chartHoverCard({
          image: pair?.posters[plot.key] ?? undefined,
          imagePending: Boolean(pair && plot.clips && !(plot.key in pair.posters)),
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
          body: hint
            ? `<div data-clip-hint style="font-size: ${px(CHART_TYPE.annotationSub)}; color: var(--muted-foreground);">${hint}</div>`
            : undefined,
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
            // Power and energy lead, so they show without scrolling the panel's default height.
            rows={[
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
              ...(point.runtime ? [{ label: s.runtime, value: point.runtime, wide: true }] : []),
            ]}
            // View telemetry sits in the panel's fixed action row, so it never scrolls away.
            links={[
              {
                action: 'run',
                label: s.runLink,
                href: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${encodeURIComponent(point.runId)}`,
                external: true,
              },
              { action: 'view-telemetry', label: `${s.viewTelemetry} →` },
            ]}
            onClose={close}
            onAction={(action, event) => {
              event.stopPropagation();
              if (action !== 'view-telemetry') return;
              close();
              onOpen(plot.key, 'popover');
            }}
          >
            {link.current && plot.clips && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-action="compare-below"
                className="mt-3 w-full"
                onClick={(event) => {
                  event.stopPropagation();
                  track('video_results_compare_revealed', { gpu: point.hardwareKey });
                  link.current?.onReveal();
                }}
              >
                {s.compareBelow}
              </Button>
            )}
          </ChartPointDetails>
        );
      },
      // The shared default dims the hovered point; a custom handler replaces it, so it keeps that.
      onHoverStart: (target, point) => {
        target.attr('opacity', 0.8);
        hover.current = point.series;
        hovered.current = point.key;
        clearTimeout(peekTimer.current);
        const pair = link.current;
        if (pair && point.clips && !(point.key in pair.posters))
          peekTimer.current = setTimeout(() => link.current?.onPeek(point.key), PEEK_DELAY);
        marks.current = { ...marks.current, hover: point.series };
        redraw();
      },
      onHoverEnd: (target) => {
        target.attr('opacity', 1);
        hover.current = null;
        hovered.current = null;
        clearTimeout(peekTimer.current);
        marks.current = { ...marks.current, hover: null };
        redraw();
      },
      onPointClick: (point) => {
        const pair = link.current;
        track('video_results_point_pinned', {
          gpu: point.hardwareKey,
          overlay: point.overlay,
          optimal: point.optimal,
          playable: point.clips,
        });
        if (!pair || !point.clips) return;
        track('video_results_clip_selected', {
          source: 'chart',
          gpu: point.hardwareKey,
          overlay: point.overlay,
          lossy: isLossy(point.cell.point),
          engine: point.engine,
        });
        pair.onSelect(point.key);
      },
    };
  }, [locale, s, state, x, xKey, y, xLabel, yLabel, clip, history, onOpen, redraw]);

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
  // New scale objects rebuild the plot, which closes a pinned panel, so they change only with the data.
  const xScale = useMemo<ScaleConfig>(
    () =>
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
          },
    [x.scale, plotted],
  );
  const yScale = useMemo<ScaleConfig>(
    () => ({
      type: 'linear',
      domain: zeroAnchoredDomain(
        plotted.map((point) => point.y),
        1.15,
      ),
      nice: true,
    }),
    [plotted],
  );
  const single = !history && series.length > 0 && series.every((item) => item.measured <= 1);
  const engines = byEngine
    ? [...new Set(series.map((item) => item.engine))].toSorted(
        (a, b) => engineSort(a) - engineSort(b),
      )
    : [];

  return (
    <D3Chart<PlotPoint>
      ref={chart}
      chartId={VIDEO_RESULTS_CHART_ID}
      testId="video-results-chart"
      data={plotted}
      height={440}
      // The x title centres on the plot, so a wide left margin pushes the zh title past the
      // right edge at 320 px in DM Sans.
      margin={{ top: 24, right: 28, bottom: 64, left: 72 }}
      watermark="logo"
      transitionDuration={transition}
      xScale={xScale}
      yScale={yScale}
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
      onRender={onRender}
      onExportRender={onExportRender}
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [1, 20],
        resetEventName: `video_results_zoom_reset_${VIDEO_RESULTS_CHART_ID}`,
      }}
      instructions={s.controls}
      noDataOverlay={
        plotted.length === 0 ? (
          loading ? (
            <Skeleton
              data-testid="video-results-chart-skeleton"
              className="pointer-events-none absolute inset-0"
            />
          ) : (
            <EmptyState bare role="status" className="pointer-events-none absolute inset-0 p-8">
              {s.noData}
            </EmptyState>
          )
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
                {lossySeries.length > 0 && lossyNote}
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

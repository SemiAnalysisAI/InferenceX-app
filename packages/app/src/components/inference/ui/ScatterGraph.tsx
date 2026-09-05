'use client';

import { track } from '@/lib/analytics';
import { EMBED_CHART_HEIGHT } from '@/lib/embed';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { useEphemeralUrlState } from '@/hooks/useUrlState';
import { rememberChartStateInUrl } from '@/lib/url-state';
import * as d3 from 'd3';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { SCATTER_RENDERED_EVENT } from '@/lib/nudges/agentic-point-coach-mark';
import { GRADIENT_NUDGE_EVENT } from '@/lib/nudges/registry';
import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { useTraceAvailability } from '@/hooks/api/use-trace-availability';
import { useLogAvailability } from '@/hooks/api/use-log-availability';
import { computeToggle } from '@/hooks/useTogglableSet';
import {
  avoidPointLabelCollisions,
  parallelismLabelBoxes,
  placeLineLabels,
  updateRenderedLineLabels,
  renderLineLabels,
  type LineLabelPlacement,
  type LineLabelSeries,
} from '@/components/inference/ui/line-label-layer';
import {
  labelOpacityForActiveState,
  labelOpacityForHover,
} from '@/components/inference/ui/line-label-visibility';
import ChartLegend from '@/components/ui/chart-legend';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { OFFICIAL_PREVIEW_SERIES } from '@/components/official-preview-notice';
import { getHardwareConfig, getModelSortIndex, hardwareKeyMatchesAnyBase } from '@/lib/constants';
import {
  getChartWatermark,
  getPrecisionLabel,
  getSequenceLabel,
  type Precision,
  Sequence,
} from '@/lib/data-mappings';
import { matchKnownConfigIssues, pointMatchesIssue } from '@/lib/known-issues';
import { useLocale } from '@/lib/use-locale';
import { getLineLabelVendorIcon } from '@/lib/vendor-logos';
import { formatNumber, getDisplayLabel, updateRepoUrl } from '@/lib/utils';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  LayerConfig,
  RenderContext,
  ZoomContext,
} from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { computeTooltipPosition, syncPointShape } from '@/lib/d3-chart/layers/scatter-points';
import {
  EMPTY_PERF_RULER_STATE,
  clampIsoX,
  clearPerfRulers,
  computeIsoXRulerGeometry,
  computePerfRulerLabelLayouts,
  deletePerfRuler,
  intersectPathAtX,
  isPerfRulerCurveVisible,
  movePerfRulerIsoX,
  nextPerfRulerState,
  pathXExtent,
  perfRulerCurveSet,
  prunePerfRulers,
  renderPerfRulers,
  type PerfRulerEndInput,
  type PerfRulerGeometry,
  type PerfRulerRenderEntry,
  type PerfRulerState,
} from '@/lib/d3-chart/layers/perf-ruler';
import {
  attachOverlayXMarkerHandlers,
  overlayMarkerPosition,
  xMarkerPath,
} from '@/lib/d3-chart/overlay-x-marker';
import { useStableValue } from '@/hooks/useStableValue';
import {
  overlayRooflineDasharray,
  overlayRunColor,
  overlayRunIndex,
} from '@/lib/overlay-run-style';
import {
  HIT_AREA_RADIUS,
  formatLargeNumber,
  logTickFormat,
  applyHoverState,
  applyNormalState,
  getShapeKeyForPrecision,
} from '@/lib/chart-rendering';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';
import { canonicalParetoIntersection } from '@/components/inference/utils/canonicalFrontier';
import type {
  ChartDefinition,
  ClippedInferenceData,
  InferenceData,
  ScatterGraphProps,
} from '@/components/inference/types';
import {
  generateOverlayTooltipContent,
  generateTooltipContent,
} from '@/components/inference/utils/tooltipUtils';
import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';
import { ScatterEmptyState } from '@/components/inference/ui/ScatterEmptyState';
import {
  scatterPointConfigId,
  scatterPointJoinId,
} from '@/components/inference/utils/point-identity';
import LegendPointsDialog from '@/components/inference/ui/LegendPointsDialog';
import { renderOffloadHalo } from '@/components/inference/utils/offload-halo';
import { renderLegacyPowerRing } from '@/components/inference/utils/legacy-power-marker';
import {
  countPowerTiers,
  MeasuredPowerSummary,
} from '@/components/inference/ui/MeasuredPowerSummary';
import {
  isMeasuredEnergyConfigKey,
  isRoleLocalMeasuredEnergyConfigKey,
} from '@/components/inference/metric-registry';
import { buildLegendPointsRows } from '@/components/inference/utils/legend-points-table';
import { resolveScatterXAxisScale } from '@/components/inference/utils/x-axis-scale';
import { pointLabelText } from './point-label';
import {
  type ParetoPointLabel,
  getParetoLabel,
  computeParetoPointLabels,
  computeGradientStops,
  PARETO_LABEL_COLORS,
  buildGradientColorMap,
} from '@/components/inference/utils/paretoLabels';
import {
  type KnownIssueAnnotation,
  createKnownIssueLayer,
} from '@/components/inference/utils/knownIssueAnnotations';
import { matchesQuickFilters } from '@/components/inference/utils/quickFilters';
import { bestSeriesPerSku } from '@/components/inference/utils/best-series-per-sku';
import { legendChangelogsByHardware } from '@/components/inference/utils/legend-changelog';
import {
  buildFrontierContinuations,
  fitContinuationLabelBaseline,
} from '@/components/inference/utils/overflowContinuations';

const FixedSequenceLogDialog = dynamic(
  () =>
    import('@/components/inference/log-viewer/fixed-sequence-log-dialog').then(
      (module) => module.FixedSequenceLogDialog,
    ),
  { ssr: false },
);

const formatChangelogDescription = (desc: string | string[]): React.JSX.Element => {
  if (typeof desc === 'string') {
    return (
      <div className="font-normal">
        {desc
          .split('- ')
          .filter((item) => item.trim() !== '')
          .map((item, index) => (
            <div key={index}>{item}</div>
          ))}
      </div>
    );
  }
  return (
    <div className="font-normal">
      {desc.map((item, index) => (
        <div key={index}>{item}</div>
      ))}
    </div>
  );
};

const CHART_MARGIN = { top: 24, right: 10, bottom: 60, left: 60 };

/**
 * Bucket points by their (requested) date. Comparison overlays put multiple
 * dates under one legend key, and rooflines / gradient paths must never span
 * dates — a May 15 point can't dominate a May 17 plot.
 */
function groupPointsByDate(points: InferenceData[]): Map<string, InferenceData[]> {
  const byDate = new Map<string, InferenceData[]>();
  for (const p of points) {
    let bucket = byDate.get(p.date);
    if (!bucket) {
      bucket = [];
      byDate.set(p.date, bucket);
    }
    bucket.push(p);
  }
  return byDate;
}

/** Identity key for "is this point on a roofline" lookups (scoped per date). */
const optimalPointKey = (d: InferenceData): string =>
  `${d.hwKey}_${d.precision}_${d.date}-${d.x}-${d.y}`;

// Referentially stable "no overlay data" result (see processedOverlayData).
const EMPTY_OVERLAY_DATA: InferenceData[] = [];
const EMPTY_CLIPPED_DATA: ClippedInferenceData[] = [];

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/** Which legend series' points table is open (per-series drill-down dialog). */
type LegendPointsTarget =
  | { kind: 'official'; hwKey: string }
  | { kind: 'overlay'; runIndex: number; runId: number; branch: string };

interface OverflowContinuationEntry {
  key: string;
  source: 'official' | 'overlay';
  hw: string;
  precision: string;
  runIndex?: number;
  from: InferenceData;
  toward: InferenceData;
  points: InferenceData[];
  reasons: ClippedInferenceData['reasons'];
  hiddenPointCount: number;
}

interface CurvedContinuationGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
}

/** Find a compact endpoint on an interpolated path, starting at its visible frontier point. */
function visibleContinuationEndpoint(
  path: SVGPathElement,
  anchorX: number,
  width: number,
  height: number,
  inset = 7,
  maxLength = 96,
): CurvedContinuationGeometry | null {
  const totalLength = path.getTotalLength();
  if (!Number.isFinite(totalLength) || totalLength === 0) return null;

  const pathStart = path.getPointAtLength(0);
  const pathEnd = path.getPointAtLength(totalLength);
  const ascending = pathEnd.x >= pathStart.x;
  let lowerLength = 0;
  let upperLength = totalLength;
  for (let iteration = 0; iteration < 24; iteration++) {
    const midpoint = (lowerLength + upperLength) / 2;
    const midpointX = path.getPointAtLength(midpoint).x;
    if (midpointX < anchorX === ascending) lowerLength = midpoint;
    else upperLength = midpoint;
  }

  const anchorLength = (lowerLength + upperLength) / 2;
  const start = path.getPointAtLength(anchorLength);
  if (start.x < 0 || start.x > width || start.y < 0 || start.y > height) return null;

  let endpointLength = Math.min(totalLength, anchorLength + maxLength);
  let length = Math.min(anchorLength + 2, endpointLength);
  while (length > anchorLength) {
    const point = path.getPointAtLength(length);
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
      endpointLength = Math.max(anchorLength, length - inset);
      break;
    }
    if (length === endpointLength) break;
    length = Math.min(length + 2, endpointLength);
  }

  const end = path.getPointAtLength(endpointLength);
  const tangentStart = path.getPointAtLength(Math.max(anchorLength, endpointLength - 2));
  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    angle: (Math.atan2(end.y - tangentStart.y, end.x - tangentStart.x) * 180) / Math.PI,
  };
}

// Scale configs are recomputed from visible points, but a legend or precision
// toggle often leaves the domain unchanged. Comparing by value preserves the
// previous config object and prevents a redundant metric-coordinate phase.
interface ScaleConfigValue {
  type: 'log' | 'linear';
  domain: [number, number];
  nice: boolean;
  _isLog?: boolean;
}
const isSameScaleConfig = (a: ScaleConfigValue, b: ScaleConfigValue): boolean =>
  a.type === b.type &&
  a.nice === b.nice &&
  a._isLog === b._isLog &&
  a.domain[0] === b.domain[0] &&
  a.domain[1] === b.domain[1];

// True when the node has a scheduled or running d3 transition with this name.
// Reads d3-transition's per-node schedule store (`__transition`) because
// d3.active() only reports transitions that already started, and the chart's
// entrance transitions are scheduled in the same commit but start on the next
// timer tick.
const hasNamedTransition = (node: Element, name: string): boolean => {
  const schedules = (node as Element & { __transition?: Record<string, { name?: string }> })
    .__transition;
  if (!schedules) return false;
  return Object.values(schedules).some((schedule) => schedule?.name === name);
};

const currentZoomRenderContext = (svg: SVGSVGElement, ctx: RenderContext): RenderContext => {
  const transform = d3.zoomTransform(svg);
  if (transform.k === 1 && transform.x === 0 && transform.y === 0) return ctx;
  return {
    ...ctx,
    xScale: transform.rescaleX(ctx.xScale as ContinuousScale),
    yScale: transform.rescaleY(ctx.yScale as ContinuousScale),
  };
};

// Derive a readable label from a hwKey using the HARDWARE_CONFIG source of truth.
// `model` (display name) enables per-model suffix overrides (e.g. M3 MTP → EAGLE).
const parseHwKeyToLabel = (hwKey: string, model?: string): { name: string; label: string } => {
  const config = getHardwareConfig(hwKey, model);
  return { name: config.label, label: getDisplayLabel(config) };
};

// Line-label text for a curve. When more than one precision is shown, each curve
// is its own line, so place the precision between the GPU and engine (e.g.
// "B200 FP8 (vLLM)") to keep the primary identifiers together.
const lineLabelText = (
  hwKey: string,
  precision: string,
  includePrecision: boolean,
  model?: string,
): string => {
  const config = getHardwareConfig(hwKey, model);
  if (config.alwaysShowPrecision) {
    return [getDisplayLabel(config), getPrecisionLabel(precision as Precision)].join(' ');
  }
  if (!includePrecision) return getDisplayLabel(config);
  return [config.label, getPrecisionLabel(precision as Precision), config.suffix]
    .filter(Boolean)
    .join(' ');
};

const pointCountEn = (count: number) => `${count} ${count === 1 ? 'point' : 'points'}`;

const SCATTER_STRINGS = {
  en: {
    logScale: 'Log Scale',
    optimalOnly: 'Optimal Only',
    optimalInfo: 'Optimal points form the Pareto frontier for the selected axes.',
    labels: 'Labels',
    highContrast: 'High Contrast',
    parallelismLabels: 'Parallelism Labels',
    concurrencyLabels: '# Concurrent Sessions',
    gradientLabels: 'Gradient Labels',
    lineLabels: 'Line Labels',
    perfRuler: 'Perf Ruler',
    perfRulerInfo:
      'Click two curves to place a vertical ruler, then drag it to measure the performance multiple between them at any x value. Repeat to add more rulers (up to 8); hover a ruler and click × to delete it. Turning the toggle off clears all rulers.',
    resetFilter: 'Reset filter',
    clearPerfRulers: (count: number) => `Clear rulers (${count})`,
    quickFilters: (count: number) => (count > 0 ? `Quick Filters (${count})` : 'Quick Filters'),
    overflowMixed: (count: number) => `${pointCountEn(count)} clipped`,
    overflowCost: (count: number, limit: number) => `${pointCountEn(count)} > $${limit}/Mtok`,
    overflowLatency: (count: number, limit: number) => `${pointCountEn(count)} > ${limit}s TTFT`,
    noData: 'No data available',
    noDataHint: 'Please change the model, sequence, precision, date range or chip selection.',
    noRoleEnergyDataHint:
      'This dataset does not report role-level prefill/decode energy. Choose a different model, scenario, precision, date, or measured-energy metric.',
    unofficialTitle: (branch: string) => `UNOFFICIAL: ${branch}`,
    unofficialRun: 'UNOFFICIAL RUN',
    branch: 'Branch',
    viewWorkflow: 'View workflow run',
  },
  zh: {
    logScale: '对数缩放',
    optimalOnly: '仅最优',
    optimalInfo: '最优点构成当前所选坐标轴的 Pareto 前沿。',
    labels: '标签',
    highContrast: '高对比度',
    parallelismLabels: '并行配置标签',
    concurrencyLabels: '并发会话数',
    gradientLabels: '渐变标签',
    lineLabels: '曲线标签',
    perfRuler: '性能标尺',
    perfRulerInfo:
      '先点击两条曲线放置垂直标尺，再拖动标尺，测量任意横坐标下两条曲线之间的性能倍数。重复操作可添加多把标尺（最多 8 把）；悬停标尺并点击 × 可删除该标尺。关闭开关将清除所有标尺。',
    resetFilter: '重置筛选',
    clearPerfRulers: (count: number) => `清除标尺（${count}）`,
    quickFilters: (count: number) => (count > 0 ? `快捷筛选（${count}）` : '快捷筛选'),
    overflowMixed: (count: number) => `${count} 个点已截断`,
    overflowCost: (count: number, limit: number) => `${count} 个点 > $${limit}/Mtok`,
    overflowLatency: (count: number, limit: number) => `${count} 个点 > ${limit}s TTFT`,
    noData: '暂无数据',
    noDataHint: '请调整模型、序列长度、精度、日期范围或芯片选项。',
    noRoleEnergyDataHint:
      '当前数据集未提供 Prefill/Decode 各角色的能耗数据。请选择其他模型、场景、精度、日期或实测能耗指标。',
    unofficialTitle: (branch: string) => `非官方：${branch}`,
    unofficialRun: '非官方运行',
    branch: '分支',
    viewWorkflow: '查看工作流运行记录',
  },
} as const;

const ScatterGraph = React.memo(
  ({
    chartId,
    modelLabel,
    data,
    clippedData = EMPTY_CLIPPED_DATA,
    xLabel,
    yLabel,
    chartDefinition,
    caption,
    onShowTable,
    showAllHardwareTypes = false,
    hardwareConfigOverride,
    overlayData,
    transitionDuration = 300,
    niceAxes = true,
    pinLineLabels = false,
    xExtentOverride,
    yExtentOverride,
  }: ScatterGraphProps) => {
    const {
      hardwareConfig: contextHardwareConfig,
      hwTypesWithData,
      availableRuns,
    } = useInferenceData();
    const {
      activeHwTypes,
      bestPerSku,
      selectedPrecisions,
      selectedRunId,
      selectedSequence,
      quickFilters,
      lockedFrameworks,
      minimalChrome,
    } = useInferenceFilters();
    const {
      selectedYAxisMetric,
      hideNonOptimal,
      showPointLabels,
      highContrast,
      logScale,
      scaleType,
      isLegendExpanded,
      useAdvancedLabels,
      showConcurrencyLabels,
      showGradientLabels,
      showLineLabels,
    } = useInferenceDisplay();
    const {
      setBestPerSku,
      toggleHwType,
      removeHwType,
      resolveComparisonSelection,
      setHideNonOptimal,
      setShowPointLabels,
      selectAllHwTypes,
      setHighContrast,
      setLogScale,
      setIsLegendExpanded,
      setUseAdvancedLabels,
      setShowConcurrencyLabels,
      setShowGradientLabels,
      setShowLineLabels,
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
      setQuickFilterPower,
    } = useInferenceActions();
    const locale = useLocale();
    const legendT = SCATTER_STRINGS[locale];
    const ephemeralUrlState = useEphemeralUrlState();
    const costLimit = chartDefinition.y_cost_limit ?? 0;
    const latencyLimit = chartDefinition.y_latency_limit ?? 0;
    // Legacy-power rings decorate points only while a Measured Energy y-axis
    // is selected (see legacy-power-marker.ts).
    const isMeasuredEnergyAxis = isMeasuredEnergyConfigKey(selectedYAxisMetric);

    const {
      isUnofficialRun,
      activeOverlayHwTypes: providerActiveOverlayHwTypes,
      localOfficialOverride,
      resetOverlaySelection,
      setUnifiedOverlaySelection,
      runIndexByUrl,
      unofficialRunInfos,
    } = useUnofficialRun();
    const chartRef = useRef<D3ChartHandle>(null);

    // Pinned line-label anchors (data-space x) keyed by line-label key. Persists
    // across renders so each label keeps a stable spot along its line during
    // replay animation. Only read/written when `pinLineLabels` is true.
    const lineLabelAnchorRef = useRef<Map<string, number>>(new Map());

    const scopedOverlayHwTypes = useMemo(() => {
      const keys = new Set<string>();
      for (const point of overlayData?.data ?? []) {
        if (
          selectedPrecisions.includes(point.precision) &&
          matchesQuickFilters(point, quickFilters)
        ) {
          keys.add(String(point.hwKey));
        }
      }
      return keys;
    }, [overlayData, selectedPrecisions, quickFilters]);
    const rawOfficialHwTypes = useMemo(() => {
      const source = localOfficialOverride ?? activeHwTypes;
      return new Set([...source].filter((key) => hwTypesWithData.has(key)));
    }, [activeHwTypes, hwTypesWithData, localOfficialOverride]);
    const rawOverlayHwTypes = useMemo(
      () =>
        new Set([...providerActiveOverlayHwTypes].filter((key) => scopedOverlayHwTypes.has(key))),
      [providerActiveOverlayHwTypes, scopedOverlayHwTypes],
    );
    const allUnifiedHwTypes = useMemo(() => {
      const all = new Set(hwTypesWithData);
      scopedOverlayHwTypes.forEach((key) => all.add(`overlay:${key}`));
      return all;
    }, [hwTypesWithData, scopedOverlayHwTypes]);
    const rawUnifiedSelection = useMemo(() => {
      const combined = new Set(rawOfficialHwTypes);
      rawOverlayHwTypes.forEach((key) => combined.add(`overlay:${key}`));
      return combined;
    }, [rawOfficialHwTypes, rawOverlayHwTypes]);
    const resolvedUnifiedSelection = useMemo(
      () =>
        overlayData
          ? rawUnifiedSelection
          : resolveComparisonSelection(
              rawUnifiedSelection,
              rawOfficialHwTypes.size > 0 ? rawOfficialHwTypes : rawUnifiedSelection,
            ).result,
      [overlayData, rawUnifiedSelection, rawOfficialHwTypes, resolveComparisonSelection],
    );
    const resolvedHwTypes = useMemo(() => {
      const official = new Set<string>();
      const overlay = new Set<string>();
      for (const key of resolvedUnifiedSelection) {
        if (key.startsWith('overlay:')) overlay.add(key.slice('overlay:'.length));
        else official.add(key);
      }
      return { official, overlay };
    }, [resolvedUnifiedSelection]);
    const effectiveOfficialHwTypes = resolvedHwTypes.official;
    const activeOverlayHwTypesRef = useRef(resolvedHwTypes.overlay);
    if (!setsEqual(activeOverlayHwTypesRef.current, resolvedHwTypes.overlay)) {
      activeOverlayHwTypesRef.current = resolvedHwTypes.overlay;
    }
    const activeOverlayHwTypes = activeOverlayHwTypesRef.current;

    const commitUnifiedSelection = useCallback(
      (selection: Set<string>) => {
        const official = new Set<string>();
        const scopedOverlay = new Set<string>();
        for (const key of selection) {
          if (key.startsWith('overlay:')) scopedOverlay.add(key.slice('overlay:'.length));
          else official.add(key);
        }
        const overlay = new Set(providerActiveOverlayHwTypes);
        scopedOverlayHwTypes.forEach((key) => overlay.delete(key));
        scopedOverlay.forEach((key) => overlay.add(key));
        setUnifiedOverlaySelection(official, overlay);
      },
      [providerActiveOverlayHwTypes, scopedOverlayHwTypes, setUnifiedOverlaySelection],
    );
    const toggleOfficialHwType = useCallback(
      (key: string) => {
        // The unofficial run is a pinned comparison, not an official legend item.
        // Soloing an official series must therefore leave every overlay selection unchanged.
        setUnifiedOverlaySelection(
          computeToggle(effectiveOfficialHwTypes, key, hwTypesWithData),
          providerActiveOverlayHwTypes,
        );
      },
      [
        effectiveOfficialHwTypes,
        hwTypesWithData,
        providerActiveOverlayHwTypes,
        setUnifiedOverlaySelection,
      ],
    );
    const resetUnifiedSelection = useCallback(() => {
      selectAllHwTypes();
      if (!overlayData) {
        resetOverlaySelection();
        return;
      }
      commitUnifiedSelection(allUnifiedHwTypes);
    }, [
      selectAllHwTypes,
      overlayData,
      resetOverlaySelection,
      allUnifiedHwTypes,
      commitUnifiedSelection,
    ]);

    // When no overlay data, delegate to context's toggleHwType (preserves setActivePresetId)
    const handleToggleHwType = useCallback(
      (key: string) => {
        if (!overlayData) {
          toggleHwType(key);
          return;
        }
        setBestPerSku(false, { applySelection: false });
        toggleOfficialHwType(key);
      },
      [overlayData, setBestPerSku, toggleOfficialHwType, toggleHwType],
    );

    // Best per SKU lives in the Quick Filters dialog, but the handler stays
    // here: overlay mode owns a temporary unified selection that must be
    // recomputed (or restored) when the automatic mode flips.
    const handleBestPerSkuChange = useCallback(
      (checked: boolean) => {
        setBestPerSku(checked);
        if (overlayData) {
          if (checked) {
            const direction =
              chartDefinition[`${selectedYAxisMetric}_roofline` as keyof ChartDefinition];
            if (
              direction === 'upper_right' ||
              direction === 'upper_left' ||
              direction === 'lower_left' ||
              direction === 'lower_right'
            ) {
              const selection = bestSeriesPerSku(data, direction);
              for (const key of bestSeriesPerSku(overlayData.data, direction)) {
                selection.add(`overlay:${key}`);
              }
              commitUnifiedSelection(selection);
            }
          } else {
            resetUnifiedSelection();
          }
        }
        track('inference_best_per_sku_toggled', { enabled: checked });
      },
      [
        setBestPerSku,
        overlayData,
        chartDefinition,
        selectedYAxisMetric,
        data,
        commitUnifiedSelection,
        resetUnifiedSelection,
      ],
    );

    // Legend "X" (remove) — same overlay split as handleToggleHwType. With an
    // overlay loaded the chart reads localOfficialOverride, which the context's
    // removeHwType (activeHwTypes) never touches, so routing the X through it
    // left the official series visibly un-removed. Commit the removal through
    // the unified selection instead; context state stays untouched so
    // dismissing the overlay restores the pre-overlay official selection, same
    // as the toggle path.
    const handleRemoveHwType = useCallback(
      (key: string) => {
        if (!overlayData) {
          removeHwType(key);
          return;
        }
        setBestPerSku(false, { applySelection: false });
        const next = new Set(resolvedUnifiedSelection);
        next.delete(key);
        commitUnifiedSelection(next);
      },
      [overlayData, setBestPerSku, removeHwType, resolvedUnifiedSelection, commitUnifiedSelection],
    );

    // --- Theme ---
    const hardwareConfig = hardwareConfigOverride || contextHardwareConfig;
    const activeHwKeys = useMemo(() => {
      const keys = [...effectiveOfficialHwTypes];
      activeOverlayHwTypes.forEach((key) => keys.push(`overlay:${key}`));
      return keys;
    }, [effectiveOfficialHwTypes, activeOverlayHwTypes]);
    const activeOfficialKeys = useMemo(
      () => [...effectiveOfficialHwTypes],
      [effectiveOfficialHwTypes],
    );
    // High-contrast palette is keyed off the FULL set of official hw types with
    // data, not the active subset. Otherwise deselecting a line shrinks the key
    // set, which re-sizes the iwanthue palette and shifts every remaining line's
    // hue (most visible for single-vendor agentic runs that span the full wheel —
    // e.g. deselecting B300 would recolor B200 from red to blue). Keying off the
    // stable full set fixes each hw's color so toggling only hides/shows lines.
    const stableHcKeys = useMemo(() => [...hwTypesWithData], [hwTypesWithData]);
    const { resolveColor, getCssColor } = useThemeColors({
      highContrast,
      identifiers: activeHwKeys,
      activeKeys: activeOfficialKeys,
      hcKeys: stableHcKeys,
    });

    // --- Changelog ---
    const legendChangelogs = useMemo(
      () =>
        legendChangelogsByHardware(
          data,
          availableRuns,
          selectedSequence === Sequence.AgenticTraces ? 'agentic_traces' : 'single_turn',
        ),
      [data, availableRuns, selectedSequence],
    );

    // --- Data Processing ---
    const groupedData = useMemo(
      () =>
        data.reduce(
          (acc, point) => {
            const key = `${point.hwKey}_${point.precision}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(point);
            return acc;
          },
          {} as Record<string, InferenceData[]>,
        ),
      [data],
    );

    const rooflines = useMemo(() => {
      // Frontier scope is (hw, precision, date) — points from different dates
      // can never share a frontier (a May 15 point can't dominate a May 17 plot).
      // The legend grouping is still by (hw, precision); we just split the
      // pareto compute per date and re-merge into the legend bucket.
      const result: Record<string, InferenceData[]> = {};
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as ParetoDirection | undefined;
      const frontierFn = paretoFrontForDirection(dir ?? 'lower_right');
      for (const hwKey of Object.keys(groupedData)) {
        const combined: InferenceData[] = [];
        for (const datePoints of groupPointsByDate(groupedData[hwKey]).values()) {
          // Agentic modes intersect the selected-axis Pareto frontier with the
          // normalized north-star frontier. This keeps every drawn curve a true
          // Pareto frontier without admitting a non-canonical winner.
          const canonicalPoints = canonicalParetoIntersection(datePoints, dir ?? 'lower_right');
          const front = canonicalPoints ?? frontierFn(datePoints.filter(isFrontierEligible));
          if (front.length === 0) continue;
          combined.push(...front);
        }
        combined.sort((a, b) => a.x - b.x);
        result[hwKey] = combined;
      }
      return result;
    }, [groupedData, selectedYAxisMetric, chartDefinition]);

    const optimalPointKeys = useMemo(() => {
      const keys = new Set<string>();
      Object.values(rooflines).forEach((pts) => pts.forEach((p) => keys.add(optimalPointKey(p))));
      return keys;
    }, [rooflines]);

    const effectiveActiveHwTypes = useMemo(() => {
      if (showAllHardwareTypes) {
        const types = new Set<string>();
        Object.values(groupedData)
          .flat()
          .forEach((p) => {
            if (p.hwKey) types.add(p.hwKey as string);
          });
        return types;
      }
      return effectiveOfficialHwTypes;
    }, [showAllHardwareTypes, groupedData, effectiveOfficialHwTypes]);

    const distinguishPointDates = useMemo(() => {
      let firstDate: string | undefined;
      let hasFirstPoint = false;
      for (const point of data) {
        const date = point.date || undefined;
        if (!hasFirstPoint) {
          firstDate = date;
          hasFirstPoint = true;
        } else if (date !== firstDate) {
          return true;
        }
      }
      return false;
    }, [data]);
    const buildPointId = useCallback(
      (point: InferenceData) => scatterPointJoinId(point, distinguishPointDates),
      [distinguishPointDates],
    );

    // filteredData: visible points only (for scale domain calculation)
    const filteredData = useMemo(
      () =>
        Object.values(groupedData)
          .flat()
          .filter(
            (p) =>
              selectedPrecisions.includes(p.precision) &&
              effectiveActiveHwTypes.has(p.hwKey as string),
          ),
      [groupedData, selectedPrecisions, effectiveActiveHwTypes],
    );

    const processedOverlayData = useMemo(() => {
      // Stable empty reference: without an overlay this must not churn on
      // precision changes — it feeds the `layers` memo, and a new identity
      // there forces a full chart rebuild.
      if (!overlayData?.data) return EMPTY_OVERLAY_DATA;
      // Mirror the official path's precision/quick filters and remove inactive
      // overlay hardware before any points or rooflines are constructed.
      return overlayData.data.filter(
        (point) =>
          selectedPrecisions.includes(point.precision) &&
          matchesQuickFilters(point, quickFilters) &&
          activeOverlayHwTypes.has(String(point.hwKey)),
      );
    }, [overlayData, selectedPrecisions, quickFilters, activeOverlayHwTypes]);

    const processedOverlayClippedData = useMemo(() => {
      if (!overlayData?.clippedData) return EMPTY_CLIPPED_DATA;
      return overlayData.clippedData.filter(
        ({ point }) =>
          selectedPrecisions.includes(point.precision) &&
          matchesQuickFilters(point, quickFilters) &&
          activeOverlayHwTypes.has(String(point.hwKey)),
      );
    }, [overlayData, selectedPrecisions, quickFilters, activeOverlayHwTypes]);

    const officialOverflowContinuations = useMemo((): OverflowContinuationEntry[] => {
      interface Bucket {
        hw: string;
        precision: string;
        visible: InferenceData[];
        clipped: ClippedInferenceData[];
      }
      const buckets = new Map<string, Bucket>();
      const getBucket = (point: InferenceData) => {
        const key = `${point.hwKey}|${point.precision}|${point.date}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            hw: String(point.hwKey),
            precision: point.precision,
            visible: [],
            clipped: [],
          };
          buckets.set(key, bucket);
        }
        return { key, bucket };
      };
      for (const point of data) getBucket(point).bucket.visible.push(point);
      for (const entry of clippedData) getBucket(entry.point).bucket.clipped.push(entry);

      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const direction = chartDefinition[rooflineKey] as ParetoDirection | undefined;
      if (!direction) return [];

      const result: OverflowContinuationEntry[] = [];
      for (const [bucketKey, bucket] of buckets) {
        buildFrontierContinuations(bucket.visible, bucket.clipped, direction).forEach(
          (continuation, index) => {
            result.push({
              key: `official-${bucketKey}-${index}`,
              source: 'official',
              hw: bucket.hw,
              precision: bucket.precision,
              ...continuation,
            });
          },
        );
      }
      return result;
    }, [data, clippedData, selectedYAxisMetric, chartDefinition]);

    const overlayOverflowContinuations = useMemo((): OverflowContinuationEntry[] => {
      interface Bucket {
        hw: string;
        precision: string;
        runIndex: number;
        visible: InferenceData[];
        clipped: ClippedInferenceData[];
      }
      const buckets = new Map<string, Bucket>();
      const getBucket = (point: InferenceData) => {
        const runIndex = overlayRunIndex(point.run_url ?? null, runIndexByUrl);
        const key = `${point.hwKey}|${point.precision}|${point.date}|run${runIndex}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            hw: String(point.hwKey),
            precision: point.precision,
            runIndex,
            visible: [],
            clipped: [],
          };
          buckets.set(key, bucket);
        }
        return { key, bucket };
      };
      for (const point of processedOverlayData) getBucket(point).bucket.visible.push(point);
      for (const entry of processedOverlayClippedData) {
        getBucket(entry.point).bucket.clipped.push(entry);
      }

      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const direction = chartDefinition[rooflineKey] as ParetoDirection | undefined;
      if (!direction) return [];

      const result: OverflowContinuationEntry[] = [];
      for (const [bucketKey, bucket] of buckets) {
        buildFrontierContinuations(bucket.visible, bucket.clipped, direction).forEach(
          (continuation, index) => {
            result.push({
              key: `overlay-${bucketKey}-${index}`,
              source: 'overlay',
              hw: bucket.hw,
              precision: bucket.precision,
              runIndex: bucket.runIndex,
              ...continuation,
            });
          },
        );
      }
      return result;
    }, [
      processedOverlayData,
      processedOverlayClippedData,
      selectedYAxisMetric,
      chartDefinition,
      runIndexByUrl,
    ]);

    // Warning annotations for visible series (official + unofficial overlay)
    // with known upstream issues. Drawn as an SVG layer (box + arrow to the
    // affected line) so PNG exports carry the warning.
    const knownIssueAnnotations = useMemo((): KnownIssueAnnotation[] => {
      const visibleOverlayPoints = processedOverlayData.filter((p) =>
        activeOverlayHwTypes.has(p.hwKey as string),
      );
      const visiblePoints = [...filteredData, ...visibleOverlayPoints];
      const annotations: KnownIssueAnnotation[] = matchKnownConfigIssues(
        modelLabel,
        visiblePoints,
      ).map((issue) => ({
        issue,
        label: parseHwKeyToLabel(issue.hwKey, modelLabel).label,
        color: getCssColor(resolveColor(issue.hwKey)),
        points: visiblePoints
          .filter((p) => pointMatchesIssue(issue, p))
          .map((p) => ({ x: p.x, y: p.y })),
      }));
      // Official-preview notices intentionally follow only official data. An
      // unofficial overlay is not an InferenceX publication. `filteredData`
      // has already applied token-metric support, so the July Rubin notice is
      // present only on output-token charts alongside its visible curve.
      for (const previewConfig of OFFICIAL_PREVIEW_SERIES) {
        const previewPoints = filteredData.filter((point) =>
          hardwareKeyMatchesAnyBase(String(point.hwKey), previewConfig.baseGpuKeys),
        );
        if (previewPoints.length === 0) continue;

        const hwKey = String(previewPoints[0]!.hwKey);
        const previewCopy = previewConfig.strings[locale];
        annotations.push({
          preview: {
            id: previewConfig.id,
            summary: previewCopy.title,
            detail: previewCopy.chartDetail,
          },
          label: getDisplayLabel(getHardwareConfig(hwKey, modelLabel)),
          color: getCssColor(resolveColor(hwKey)),
          points: previewPoints.map((point) => ({ x: point.x, y: point.y })),
        });
      }
      return annotations;
    }, [
      modelLabel,
      filteredData,
      processedOverlayData,
      activeOverlayHwTypes,
      resolveColor,
      getCssColor,
      locale,
    ]);

    const overlayRooflines = useMemo(() => {
      interface Entry {
        hwKey: string;
        runIndex: number;
        points: InferenceData[];
      }
      if (processedOverlayData.length === 0) return {} as Record<string, Entry>;
      // Group by hwKey + precision + runIndex so overlay rooflines from different
      // unofficial runs stay separate and can be styled with per-run hue shifts.
      const grouped = processedOverlayData.reduce(
        (acc, p) => {
          const runIndex = overlayRunIndex(p.run_url ?? null, runIndexByUrl);
          const key = `${p.hwKey}_${p.precision}_run${runIndex}`;
          if (!acc[key]) acc[key] = { hwKey: String(p.hwKey), runIndex, points: [] };
          acc[key].points.push(p);
          return acc;
        },
        {} as Record<string, Entry>,
      );
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as ParetoDirection | undefined;
      const frontierFn = paretoFrontForDirection(dir ?? 'lower_right');
      const result: Record<string, Entry> = {};
      for (const [key, group] of Object.entries(grouped)) {
        const canonicalPoints = canonicalParetoIntersection(group.points, dir ?? 'lower_right');
        const front = canonicalPoints ?? frontierFn(group.points.filter(isFrontierEligible));
        front.sort((a, b) => a.x - b.x);
        result[key] = { hwKey: group.hwKey, runIndex: group.runIndex, points: front };
      }
      return result;
    }, [processedOverlayData, selectedYAxisMetric, chartDefinition, runIndexByUrl]);

    // Overlay counterpart of `optimalPointKeys`: the points on any overlay
    // run's drawn roofline (already e2e-restricted for agentic non-e2e modes).
    // Frontier arrays hold the same object references as `processedOverlayData`
    // items — the pareto fns return the refs they're handed — so identity
    // membership is exact, and unlike composite string keys it can't collide
    // across runs sharing a (hw, precision, tp, conc) tuple.
    const overlayOptimalPoints = useMemo(() => {
      const set = new Set<InferenceData>();
      for (const group of Object.values(overlayRooflines)) {
        for (const p of group.points) set.add(p);
      }
      return set;
    }, [overlayRooflines]);

    // Overlay points respect the Optimal Only toggle exactly like official
    // points do — "optimal" = on the overlay run's drawn roofline. Without
    // this, an e2e-dominated overlay config (hidden on the official side) kept
    // its X marker sitting on the dashed roofline and read as a pareto point.
    // Hardware/precision/quick filters are applied upstream in
    // `processedOverlayData`, so optimality is the only condition here.
    const isOverlayPointVisible = useCallback(
      (d: InferenceData) => !hideNonOptimal || overlayOptimalPoints.has(d),
      [hideNonOptimal, overlayOptimalPoints],
    );

    // All official points for rendering (unfiltered — visibility via opacity)
    const pointsData = useMemo(() => Object.values(groupedData).flat(), [groupedData]);
    // Bulk presence lookup for agentic points: which ids have a stored
    // trace_replay blob → controls the "View charts" button in the pinned
    // tooltip. We deliberately don't fetch the histograms themselves here;
    // a 95-point dsv4-b300 dashboard would pull GB of profile blobs through
    // Neon's HTTP API and trip its 64 MB per-response cap.
    const agenticIds = useMemo(() => {
      const ids: number[] = [];
      for (const p of pointsData) {
        if (p.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(p.id)) ids.push(p.id);
      }
      return ids;
    }, [pointsData]);
    const { data: traceAvailability, isPending: isTraceAvailabilityPending } =
      useTraceAvailability(agenticIds);

    // Log availability applies to every persisted official point, including
    // fixed-sequence runs.
    const persistedPointIds = useMemo(
      () => pointsData.flatMap((point) => (isPersistedBenchmarkId(point.id) ? [point.id] : [])),
      [pointsData],
    );
    const { data: persistedLogAvailability } = useLogAvailability(persistedPointIds);
    const [fixedLogPointId, setFixedLogPointId] = useState<number | null>(null);

    // --- Legend points table (per-series drill-down opened from the legend) ---
    const [pointsTableTarget, setPointsTableTarget] = useState<LegendPointsTarget | null>(null);
    const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
    // A framework lock (embed routes) is not a user filter, so it is not counted.
    const quickFilterCount =
      quickFilters.vendors.length +
      (lockedFrameworks ? 0 : quickFilters.frameworks.length) +
      quickFilters.deployment.length +
      quickFilters.power.length +
      (selectedSequence === Sequence.AgenticTraces ? 0 : quickFilters.spec.length);
    const clearQuickFilters = useCallback(() => {
      setQuickFilterVendors([]);
      setQuickFilterFrameworks([]);
      setQuickFilterDeployment([]);
      if (selectedSequence !== Sequence.AgenticTraces) setQuickFilterSpec([]);
      setQuickFilterPower([]);
    }, [
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
      setQuickFilterPower,
      selectedSequence,
    ]);

    const pointsTable = useMemo(() => {
      if (!pointsTableTarget) return null;
      if (pointsTableTarget.kind === 'official') {
        const { hwKey } = pointsTableTarget;
        const hwConfig = hardwareConfig[hwKey];
        // Same visibility filters the chart applies (precision, Optimal Only),
        // scoped to the clicked series.
        const pts = pointsData.filter(
          (p) =>
            p.hwKey === hwKey &&
            selectedPrecisions.includes(p.precision) &&
            (!hideNonOptimal || optimalPointKeys.has(optimalPointKey(p))),
        );
        return {
          hw: hwKey,
          title: hwConfig ? getDisplayLabel(hwConfig) : hwKey,
          color: resolveColor(hwKey),
          isOverlay: false,
          rows: buildLegendPointsRows(pts, false, locale),
        };
      }
      const { runIndex, runId, branch } = pointsTableTarget;
      // Overlay series: this run's points, respecting the overlay hw toggles
      // and Optimal Only (same visibility filters as the official branch above).
      const pts = processedOverlayData.filter(
        (p) =>
          overlayRunIndex(p.run_url ?? null, runIndexByUrl) === runIndex &&
          activeOverlayHwTypes.has(p.hwKey as string) &&
          isOverlayPointVisible(p),
      );
      return {
        hw: `overlay-run-${runId}`,
        title: `✕ ${branch}`,
        color: overlayRunColor(runIndex),
        isOverlay: true,
        rows: buildLegendPointsRows(pts, true, locale),
      };
    }, [
      pointsTableTarget,
      hardwareConfig,
      pointsData,
      selectedPrecisions,
      hideNonOptimal,
      optimalPointKeys,
      isOverlayPointVisible,
      resolveColor,
      processedOverlayData,
      runIndexByUrl,
      activeOverlayHwTypes,
      locale,
    ]);

    // Gradient label data
    const allPointLabelsByKey = useMemo(() => {
      const globalLabelColorMap = new Map<string, string>();
      let globalColorIdx = 0;
      const result: Record<string, ParetoPointLabel[]> = {};
      Object.entries(rooflines).forEach(([key, rooflinePoints]) => {
        if (rooflinePoints.length < 2) return;
        rooflinePoints.forEach((pt) => {
          const label = getParetoLabel(pt);
          if (!globalLabelColorMap.has(label)) {
            globalLabelColorMap.set(
              label,
              PARETO_LABEL_COLORS[globalColorIdx % PARETO_LABEL_COLORS.length],
            );
            globalColorIdx++;
          }
        });
        result[key] = computeParetoPointLabels(rooflinePoints, globalLabelColorMap);
      });
      return result;
    }, [rooflines]);

    // Point → gradient color lookup (for coloring points by parallelism strategy)
    const gradientColorByPoint = useMemo(
      () => buildGradientColorMap(allPointLabelsByKey),
      [allPointLabelsByKey],
    );

    // --- Scale Domains ---
    // When hideNonOptimal is active, compute scale domains from optimal points only
    // so the axis fits the visible data (especially important for TTFT where non-optimal
    // outliers can have wildly different x values).
    const visiblePoints = useMemo(() => {
      let pts = filteredData;
      if (hideNonOptimal) {
        pts = pts.filter((d) => optimalPointKeys.has(optimalPointKey(d)));
      }
      // Overlay points hidden by Optimal Only are excluded from the domain too
      // so hidden outliers don't stretch the axes.
      const overlayPts = processedOverlayData.filter(isOverlayPointVisible);
      return overlayPts.length > 0 ? [...pts, ...overlayPts] : pts;
    }, [
      filteredData,
      processedOverlayData,
      hideNonOptimal,
      optimalPointKeys,
      isOverlayPointVisible,
    ]);

    const isInputTputMetric = selectedYAxisMetric === 'y_inputTputPerGpu';

    const xScaleConfigRaw = useMemo(() => {
      const ext =
        xExtentOverride ??
        (visiblePoints.length > 0
          ? (d3.extent(visiblePoints, (d) => d.x) as [number, number])
          : ([0, 100] as [number, number]));

      // `x_scale_field` comes from useChartData and follows remapped `data[].x`
      // through both the live chart and Replay. Unlike `xLabel`, it is stable
      // across locales and distinct from the registry's natural `x` field.
      const useLog =
        resolveScatterXAxisScale({
          extent: ext,
          selectedYAxisMetric,
          xAxisField: chartDefinition.x_scale_field,
          scaleType,
        }) === 'log';

      const domain: [number, number] = useLog ? [ext[0] * 0.9, ext[1] * 1.05] : [0, ext[1] * 1.05];
      return {
        type: (useLog ? 'log' : 'linear') as 'log' | 'linear',
        domain,
        nice: niceAxes,
        _isLog: useLog,
      };
    }, [
      visiblePoints,
      selectedYAxisMetric,
      chartDefinition.x_scale_field,
      scaleType,
      niceAxes,
      xExtentOverride,
    ]);
    const xScaleConfig = useStableValue(xScaleConfigRaw, isSameScaleConfig);

    const yScaleConfigRaw = useMemo(() => {
      const ext =
        yExtentOverride ??
        (visiblePoints.length > 0
          ? (d3.extent(visiblePoints, (d) => d.y) as [number, number])
          : ([0, 100] as [number, number]));
      const range = ext[1] - ext[0];
      const useLog = !isInputTputMetric && logScale;

      let yMin: number;
      if (useLog) {
        const dataMin = ext[0];
        yMin =
          dataMin <= 0 ? 0.1 : dataMin < 1 ? 10 ** Math.floor(Math.log10(dataMin)) : dataMin * 0.95;
      } else {
        yMin = Math.max(0, ext[0] - range * 0.05);
      }

      return {
        type: (useLog ? 'log' : 'linear') as 'log' | 'linear',
        domain: [yMin, ext[1] * 1.05] as [number, number],
        nice: niceAxes,
      };
    }, [visiblePoints, isInputTputMetric, logScale, niceAxes, yExtentOverride]);
    const yScaleConfig = useStableValue(yScaleConfigRaw, isSameScaleConfig);

    const dataIdentity = useMemo(
      () =>
        [
          ...pointsData.map((point) => `official:${buildPointId(point)}`),
          ...processedOverlayData.map((point) => `overlay:${scatterPointConfigId(point)}`),
        ]
          .toSorted()
          .join('|'),
      [pointsData, processedOverlayData, buildPointId],
    );
    const metricIdentity = useMemo(
      () =>
        [
          useAdvancedLabels ? 'advanced-labels' : 'basic-labels',
          showConcurrencyLabels ? 'conc-labels' : 'no-conc-labels',
          selectedYAxisMetric,
          `${xScaleConfig.type}:${xScaleConfig.domain.join(',')}`,
          `${yScaleConfig.type}:${yScaleConfig.domain.join(',')}`,
          ...pointsData.map(
            (point) =>
              `${buildPointId(point)}:${point.date ?? ''}:${point.id ?? ''}:${point.run_url ?? ''}:${point.x}:${point.y}`,
          ),
          ...processedOverlayData.map(
            (point) =>
              `overlay:${scatterPointConfigId(point)}:${point.date ?? ''}:${point.id ?? ''}:${point.run_url ?? ''}:${point.x}:${point.y}`,
          ),
        ]
          .toSorted()
          .join('|'),
      [
        selectedYAxisMetric,
        useAdvancedLabels,
        showConcurrencyLabels,
        xScaleConfig,
        yScaleConfig,
        pointsData,
        processedOverlayData,
        buildPointId,
      ],
    );

    // --- Axis configs ---
    const xAxisConfig = useMemo(
      () => ({
        label: xLabel,
        tickFormat: xScaleConfig._isLog
          ? undefined
          : (d: d3.AxisDomain) => formatNumber(d as number),
        tickCount: 10,
      }),
      [xLabel, xScaleConfig._isLog],
    );

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat:
          yScaleConfig.type === 'log'
            ? undefined
            : (d: d3.AxisDomain) => formatLargeNumber(d as number),
        tickCount: 10,
      }),
      [yLabel, yScaleConfig.type],
    );

    // --- Point visibility ---
    const isPointVisible = useCallback(
      (d: InferenceData) =>
        effectiveActiveHwTypes.has(d.hwKey as string) &&
        selectedPrecisions.includes(d.precision) &&
        (!hideNonOptimal || optimalPointKeys.has(optimalPointKey(d))),
      [effectiveActiveHwTypes, selectedPrecisions, hideNonOptimal, optimalPointKeys],
    );

    const powerTierCounts = useMemo(() => {
      const officialTotal = pointsData.filter((point) =>
        selectedPrecisions.includes(point.precision),
      );
      const overlayTotal = processedOverlayData.filter((point) =>
        selectedPrecisions.includes(point.precision),
      );
      const officialVisible = officialTotal.filter(isPointVisible);
      const overlayVisible = overlayTotal.filter(
        (point) => activeOverlayHwTypes.has(String(point.hwKey)) && isOverlayPointVisible(point),
      );
      return {
        total: countPowerTiers([...officialTotal, ...overlayTotal]),
        visible: countPowerTiers([...officialVisible, ...overlayVisible]),
      };
    }, [
      pointsData,
      processedOverlayData,
      selectedPrecisions,
      isPointVisible,
      activeOverlayHwTypes,
      isOverlayPointVisible,
    ]);

    // --- Legend hover highlight ---
    const isRooflineVisible = useCallback(
      (el: SVGElement) => {
        const hw = el.dataset.hwKey;
        const prec = el.dataset.precision;
        if (hw === null || hw === undefined || prec === null || prec === undefined) return false;
        return effectiveActiveHwTypes.has(hw) && selectedPrecisions.includes(prec);
      },
      [effectiveActiveHwTypes, selectedPrecisions],
    );

    // --- Interaction state ref ---
    // Latest visibility predicates, color resolvers, and active sets — read by
    // long-lived D3 closures (layer renders, zoom handlers, hover handlers).
    // Routing these reads through a ref keeps them out of the `layers` /
    // `tooltipConfig` dependency arrays, so a legend or precision toggle no
    // longer tears down and rebuilds the whole chart: the decoration effect
    // below restyles the existing DOM instead (see docs/d3-charts.md "Why 4
    // Effects" — this is the cheap Effect-4 "display toggle" path). Same
    // refs-over-closures rule as docs/pitfalls.md "Stale Closures in D3 Event
    // Handlers".
    const interactionRef = useRef({
      isPointVisible,
      isOverlayPointVisible,
      effectiveActiveHwTypes,
      selectedPrecisions,
      activeOverlayHwTypes,
      getCssColor,
      resolveColor,
      knownIssueAnnotations,
      traceAvailability,
      logAvailability: persistedLogAvailability,
    });
    interactionRef.current = {
      isPointVisible,
      isOverlayPointVisible,
      effectiveActiveHwTypes,
      selectedPrecisions,
      activeOverlayHwTypes,
      getCssColor,
      resolveColor,
      knownIssueAnnotations,
      traceAvailability,
      logAvailability: persistedLogAvailability,
    };

    // --- Perf ruler (opt-in: click two curves, drag the ruler to any iso-x) ---
    // Curve-to-curve ISO-X semantics: each measurement is two CURVES
    // (rendered roofline path class tokens) plus a freely chosen iso-x
    // stored in DATA space (xScale.invert of the click), so measurements
    // survive zoom and metric changes. BOTH ruler ends are interpolated on
    // the curves' rendered paths at the iso-x — neither end needs to be a
    // data point. Multiple rulers accumulate (capped in the pure module);
    // completing one immediately allows starting the next.
    const [perfRulerMode, setPerfRulerMode] = useState(false);
    const [perfRulerState, setPerfRulerState] = useState<PerfRulerState>(EMPTY_PERF_RULER_STATE);
    // Draw passes read mode/state through refs so toggling off clears the
    // rulers in the same pre-paint layout pass — lines/labels must never
    // linger a frame after the switch flips (Bugbot report on PR #853).
    const perfRulerModeRef = useRef(perfRulerMode);
    perfRulerModeRef.current = perfRulerMode;
    const perfRulerStateRef = useRef(perfRulerState);
    perfRulerStateRef.current = perfRulerState;
    // Live per-ruler iso-x overrides for draw passes. Dragging a ruler
    // updates its entry once per animation frame WITHOUT touching React
    // state (the drag commits on end), so the ruler follows the pointer
    // with one redraw per frame. Cleared when committed state changes (an
    // effect, not per render, so an unrelated re-render mid-drag cannot
    // snap the dragged ruler back).
    const perfRulerLiveIsoXRef = useRef(new Map<number, number>());
    useLayoutEffect(() => {
      perfRulerLiveIsoXRef.current.clear();
    }, [perfRulerState]);

    // Scales/group from the most recent draw pass — click and drag handlers
    // convert between pixel and data space with the exact scales the chart
    // is currently drawn with.
    const perfRulerDrawCtxRef = useRef<{
      zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
      xScale: ContinuousScale;
      yScale: ContinuousScale;
      width: number;
      height: number;
    } | null>(null);
    // Forward ref: the drag frame needs to redraw, but drawPerfRuler is
    // defined below (it also attaches the drag behavior — benign cycle).
    const drawPerfRulerRef = useRef<
      | ((
          zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
          xScale: ContinuousScale,
          yScale: ContinuousScale,
          width: number,
          height: number,
        ) => void)
      | null
    >(null);

    // Completion clamp for nextPerfRulerState: the stored iso-x must lie
    // inside the curve pair's overlapping x range, or the completed ruler
    // could render nowhere — no line and no drag handle to recover it.
    // Data → pixel through the exact scales/paths the chart is currently
    // drawn with, clamp, and back. Null (missing paths or disjoint spans)
    // rejects the measurement and keeps the draft anchored.
    const clampPerfRulerIsoXToOverlap = useCallback(
      (curveA: string, curveB: string, isoX: number): number | null => {
        const ctx = perfRulerDrawCtxRef.current;
        if (!ctx) return null;
        const [nodeA, nodeB] = [curveA, curveB].map((cls) =>
          ctx.zoomGroup.select<SVGPathElement>(`.${CSS.escape(cls)}`).node(),
        );
        if (!nodeA || !nodeB || typeof nodeA.getPointAtLength !== 'function') return null;
        const extentA = pathXExtent(nodeA);
        const extentB = pathXExtent(nodeB);
        if (!extentA || !extentB) return null;
        const clamped = clampIsoX(Number(ctx.xScale(isoX)), extentA, extentB);
        return clamped === null ? null : Number(ctx.xScale.invert(clamped));
      },
      [],
    );

    // Curve click (widened hit strokes): iso-x is the click's x pixel
    // through the CURRENT rendered x scale, stored in data space.
    const handlePerfRulerCurveClick = useCallback(
      (curve: string, pixelX: number) => {
        const ctx = perfRulerDrawCtxRef.current;
        if (!ctx) return;
        track('latency_perf_ruler_curve_clicked', { curve });
        const isoX = Number(ctx.xScale.invert(pixelX));
        setPerfRulerState((prev) =>
          nextPerfRulerState(prev, { curve, isoX }, clampPerfRulerIsoXToOverlap),
        );
        chartRef.current?.dismissTooltip();
        chartRef.current?.hideTooltip();
      },
      [clampPerfRulerIsoXToOverlap],
    );
    const perfRulerCurveClickRef = useRef(handlePerfRulerCurveClick);
    perfRulerCurveClickRef.current = handlePerfRulerCurveClick;

    // Points sit on curves: a ruler-mode click on a data point behaves like
    // clicking the point's curve at that point's x. Candidates cover the
    // single- vs multi-date roofline class variants; the first one present
    // in the DOM wins. Ruler-mode clicks measure INSTEAD of pinning the
    // tooltip, so drop the pin the shared click handler applied just before
    // this callback ran.
    const handlePerfRulerPointClick = useCallback(
      (point: InferenceData, source: 'official' | 'overlay') => {
        const ctx = perfRulerDrawCtxRef.current;
        if (!ctx) return;
        const base = `${String(point.hwKey)}_${point.precision}`;
        const candidates =
          source === 'overlay'
            ? [
                `overlay-roofline-${base}_run${overlayRunIndex(point.run_url ?? null, runIndexByUrl)}`,
              ]
            : [`roofline-${base}`, `roofline-${base}__${point.date}`];
        const curve = candidates.find(
          (cls) => !ctx.zoomGroup.select(`.${CSS.escape(cls)}`).empty(),
        );
        // Single-point series render no roofline path — nothing to measure.
        if (!curve) return;
        setPerfRulerState((prev) =>
          nextPerfRulerState(prev, { curve, isoX: point.x }, clampPerfRulerIsoXToOverlap),
        );
        chartRef.current?.dismissTooltip();
        chartRef.current?.hideTooltip();
      },
      [runIndexByUrl, clampPerfRulerIsoXToOverlap],
    );

    // Read by long-lived D3 click closures (official tooltip config + overlay
    // marker handlers) — same refs-over-closures rule as interactionRef.
    const perfRulerRef = useRef({ mode: perfRulerMode, onPointClick: handlePerfRulerPointClick });
    perfRulerRef.current = { mode: perfRulerMode, onPointClick: handlePerfRulerPointClick };

    // Turning the toggle off clears ALL rulers and any in-progress
    // selection (documented in the info tooltip — simple and predictable;
    // the switch handler also clears synchronously, this covers
    // programmatic mode changes). `clearPerfRulers` bails out with the same
    // reference when there is nothing to clear.
    useEffect(() => {
      if (!perfRulerMode) setPerfRulerState(clearPerfRulers);
    }, [perfRulerMode]);

    // Invisible widened hit strokes over every rendered roofline path
    // (official AND overlay) make the curves themselves clickable in ruler
    // mode. The hit layer sits directly ABOVE `.rooflines-layer` (so the
    // visible 2.5px strokes never shadow the hit strokes) but BELOW the
    // dot-groups and overlay markers, so point hover/click behavior is
    // untouched. The layer only exists while ruler mode is on — with the
    // mode off there is nothing to intercept hovers, clicks, or zoom.
    const syncPerfRulerHitPaths = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        let hitLayer = zoomGroup.select<SVGGElement>('.perf-ruler-hits');
        const rooflinesLayerNode = zoomGroup.select<SVGGElement>('.rooflines-layer').node();
        if (!perfRulerModeRef.current || !rooflinesLayerNode) {
          hitLayer.remove();
          return;
        }
        if (hitLayer.empty()) {
          const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          node.setAttribute('class', 'perf-ruler-hits');
          rooflinesLayerNode.after(node);
          hitLayer = d3.select(node) as typeof hitLayer;
        }
        interface HitEntry {
          curve: string;
          d: string;
        }
        const entries: HitEntry[] = [];
        zoomGroup
          .selectAll<SVGPathElement, unknown>('.roofline-path, .overlay-roofline-path')
          .each(function () {
            // The identity token is the curve-specific class, e.g.
            // `roofline-H100_fp8`, `roofline-H100_fp8__2026-01-01`, or
            // `overlay-roofline-H100_fp8_run0`.
            const curve = [...this.classList].find(
              (cls) => cls !== 'roofline-path' && cls !== 'overlay-roofline-path',
            );
            const d = this.getAttribute('d');
            // Curves hidden by legend/precision filters keep their paths at
            // opacity 0 — invisible curves must not be clickable.
            if (!curve || !d || !isPerfRulerCurveVisible(this.style.opacity)) return;
            entries.push({ curve, d });
          });
        const selected = perfRulerCurveSet(perfRulerStateRef.current);
        hitLayer
          .selectAll<SVGPathElement, HitEntry>('.perf-ruler-hit')
          .data(entries, (e) => e.curve)
          .join('path')
          .attr('class', 'perf-ruler-hit')
          .attr('fill', 'none')
          .attr('d', (e) => e.d)
          .attr('stroke', 'var(--primary)')
          // Selected curves get a faint halo as feedback; unselected hit
          // strokes are fully transparent (`pointer-events: stroke` still
          // hit-tests the invisible stroke geometry).
          .attr('stroke-opacity', (e) => (selected.has(e.curve) ? 0.18 : 0))
          .attr('stroke-width', 13)
          .style('pointer-events', 'stroke')
          .style('cursor', 'crosshair')
          .on('click', (event: MouseEvent, e: HitEntry) => {
            event.stopPropagation();
            const [pixelX] = d3.pointer(event, zoomGroup.node());
            perfRulerCurveClickRef.current(e.curve, pixelX);
          });
      },
      [],
    );

    // Horizontal drag on a ruler line — the primary way to fine-tune that
    // ruler's iso-x. The drag handle's datum (set by the render join)
    // identifies WHICH ruler is dragged. rAF-throttled: each frame clamps
    // the pointer x to that ruler's curve pair's overlapping x range,
    // updates its live iso-x, and redraws; the value commits to React state
    // on drag end. d3.drag stops mousedown propagation itself, so dragging
    // a ruler never pans the chart.
    const perfRulerDragTargetRef = useRef<{ id: number; pixelX: number } | null>(null);
    const perfRulerDragFrameRef = useRef<number | null>(null);
    const applyPerfRulerDragFrame = useCallback(() => {
      const ctx = perfRulerDrawCtxRef.current;
      const target = perfRulerDragTargetRef.current;
      if (!ctx || !target) return;
      const ruler = perfRulerStateRef.current.rulers.find((r) => r.id === target.id);
      if (!ruler) return;
      const [nodeA, nodeB] = [ruler.curveA, ruler.curveB].map((cls) =>
        ctx.zoomGroup.select<SVGPathElement>(`.${CSS.escape(cls)}`).node(),
      );
      if (!nodeA || !nodeB || typeof nodeA.getPointAtLength !== 'function') return;
      const extentA = pathXExtent(nodeA);
      const extentB = pathXExtent(nodeB);
      if (!extentA || !extentB) return;
      const clamped = clampIsoX(target.pixelX, extentA, extentB);
      if (clamped === null) return;
      perfRulerLiveIsoXRef.current.set(target.id, Number(ctx.xScale.invert(clamped)));
      drawPerfRulerRef.current?.(ctx.zoomGroup, ctx.xScale, ctx.yScale, ctx.width, ctx.height);
    }, []);
    const applyPerfRulerDragFrameRef = useRef(applyPerfRulerDragFrame);
    applyPerfRulerDragFrameRef.current = applyPerfRulerDragFrame;

    const perfRulerDrag = useMemo(
      () =>
        d3
          .drag<SVGLineElement, PerfRulerRenderEntry>()
          .on(
            'drag',
            (
              event: d3.D3DragEvent<SVGLineElement, PerfRulerRenderEntry, unknown>,
              entry: PerfRulerRenderEntry,
            ) => {
              perfRulerDragTargetRef.current = { id: entry.id, pixelX: event.x };
              if (perfRulerDragFrameRef.current === null) {
                perfRulerDragFrameRef.current = requestAnimationFrame(() => {
                  perfRulerDragFrameRef.current = null;
                  applyPerfRulerDragFrameRef.current();
                });
              }
            },
          )
          .on('end', () => {
            // Flush the pending frame, then commit this ruler's iso-x.
            if (perfRulerDragFrameRef.current !== null) {
              cancelAnimationFrame(perfRulerDragFrameRef.current);
              perfRulerDragFrameRef.current = null;
              applyPerfRulerDragFrameRef.current();
            }
            const target = perfRulerDragTargetRef.current;
            perfRulerDragTargetRef.current = null;
            if (!target) return;
            const isoX = perfRulerLiveIsoXRef.current.get(target.id);
            if (isoX === undefined) return;
            setPerfRulerState((prev) => movePerfRulerIsoX(prev, target.id, isoX));
          }),
      [],
    );

    // Draw (or clear) the hit strokes and all rulers for the current draw
    // pass. Stable callback so the custom layer can live outside the
    // perf-ruler state dependencies — render/zoom passes read mode, rulers,
    // and live iso-x values through refs. Gated on the mode ref so a
    // toggle-off clears everything in the very next pre-paint pass.
    const drawPerfRuler = useCallback(
      (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: ContinuousScale,
        yScale: ContinuousScale,
        width: number,
        height: number,
      ) => {
        perfRulerDrawCtxRef.current = { zoomGroup, xScale, yScale, width, height };
        syncPerfRulerHitPaths(zoomGroup);
        const state = perfRulerStateRef.current;
        const entries: PerfRulerRenderEntry[] = [];
        if (perfRulerModeRef.current && state.rulers.length > 0) {
          // Both ends of each ruler are interpolated on the RENDERED paths —
          // the drawn curve is the measurement surface, so the ruler matches
          // it exactly and stays correct under zoom (rooflines redraw before
          // this layer runs). When either of a ruler's curves does not span
          // its iso-x, has no rendered path, or is hidden (legend/precision
          // toggles keep the path in the DOM at opacity 0), that ruler draws
          // nothing this frame but KEEPS its state — per ruler, others stay
          // visible; zoom/drag/legend re-toggles that restore both visible
          // intersections bring it back.
          const geometries: (PerfRulerGeometry | null)[] = state.rulers.map((ruler) => {
            const isoX = perfRulerLiveIsoXRef.current.get(ruler.id) ?? ruler.isoX;
            const pixelX = xScale(isoX);
            const ends: PerfRulerEndInput[] = [];
            for (const cls of [ruler.curveA, ruler.curveB]) {
              const node = zoomGroup.select<SVGPathElement>(`.${CSS.escape(cls)}`).node();
              if (!node || typeof node.getPointAtLength !== 'function') break;
              if (!isPerfRulerCurveVisible(node.style.opacity)) break;
              const hit = intersectPathAtX(node, pixelX);
              if (!hit) break;
              ends.push({ py: hit.y, rawY: yScale.invert(hit.y) });
            }
            return ends.length === 2 ? computeIsoXRulerGeometry(pixelX, ends[0], ends[1]) : null;
          });
          // Lay out all labels together so overlapping labels nudge apart.
          const layouts = computePerfRulerLabelLayouts(geometries, {
            chartWidth: width,
            chartHeight: height,
          });
          for (const [index, ruler] of state.rulers.entries()) {
            const geometry = geometries[index];
            const layout = layouts[index];
            if (geometry && layout) entries.push({ id: ruler.id, geometry, layout });
          }
        }
        renderPerfRulers(zoomGroup, entries, {
          color: 'var(--primary)',
          halo: 'var(--background)',
          onDelete: (id) => {
            track('latency_perf_ruler_deleted');
            setPerfRulerState((prev) => deletePerfRuler(prev, id));
          },
        });
        // (Re)attach the horizontal drag behavior to the (possibly fresh)
        // drag handles the render pass just joined — their datum (the
        // render entry) tells the drag which ruler it moves.
        const dragHandles = zoomGroup.selectAll<SVGLineElement, PerfRulerRenderEntry>(
          '.perf-ruler .pr-drag',
        );
        if (!dragHandles.empty()) dragHandles.call(perfRulerDrag);
      },
      [syncPerfRulerHitPaths, perfRulerDrag],
    );
    drawPerfRulerRef.current = drawPerfRuler;

    // Render context from the last D3 render — lets the decoration effect
    // restyle with the same layout/scales the chart was drawn with.
    const lastRenderCtxRef = useRef<RenderContext | null>(null);
    const labelDisplayRef = useRef({ showPointLabels, showGradientLabels, showLineLabels });
    labelDisplayRef.current = { showPointLabels, showGradientLabels, showLineLabels };
    const pointLabelsVisible = showPointLabels && !showGradientLabels;
    const lastPointLabelsVisibleRef = useRef(pointLabelsVisible);
    const lastShowLineLabelsRef = useRef(showLineLabels);
    const lastShowGradientLabelsRef = useRef(showGradientLabels);

    const getDisplaySelection = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      const ctx = lastRenderCtxRef.current;
      if (!svg || !ctx) return null;
      const zoomGroup = d3.select(svg).select<SVGGElement>('.zoom-group');
      return zoomGroup.empty() ? null : { svg, ctx, zoomGroup };
    }, []);

    // Hover dimming animates via the inline `transition: opacity 150ms ease`
    // the render path puts on dots, rooflines, and labels — a single style
    // write per node. A d3 `.transition()` here would re-write opacity every
    // animation frame, and each of those writes restarts the CSS transition:
    // one hover used to emit transitionrun/transitioncancel per node per
    // frame (tens of thousands of events per session) and feed the same
    // mutation churn to the PostHog recorder.
    const handleLegendHover = useCallback(
      (hwKey: string) => {
        const svg = chartRef.current?.getSvgElement?.();
        if (!svg) return;
        const root = d3.select(svg);
        root
          .selectAll<SVGGElement, InferenceData>('.dot-group')
          .style('opacity', (d) =>
            isPointVisible(d) ? (String(d.hwKey) === hwKey ? 1 : 0.15) : 0,
          );
        root
          .selectAll<SVGElement, unknown>('.roofline-path, .official-overflow-continuation')
          .style('opacity', function () {
            if (!isRooflineVisible(this)) return 0;
            return this.dataset.hwKey === hwKey ? null : '0.15';
          });
        root
          .selectAll<SVGGElement, unknown>('.parallelism-label, .line-label')
          .style('opacity', function () {
            return labelOpacityForHover((this as SVGGElement).dataset, hwKey);
          });
      },
      [isPointVisible, isRooflineVisible],
    );

    const handleLegendHoverEnd = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root
        .selectAll<SVGGElement, InferenceData>('.dot-group')
        .style('opacity', (d) => (isPointVisible(d) ? 1 : 0));
      root
        .selectAll<SVGElement, unknown>('.roofline-path, .official-overflow-continuation')
        .style('opacity', function () {
          return isRooflineVisible(this) ? 1 : 0;
        });
      root
        .selectAll<SVGGElement, unknown>('.parallelism-label, .line-label')
        .style('opacity', function () {
          return labelOpacityForActiveState(
            (this as SVGGElement).dataset,
            effectiveActiveHwTypes,
            selectedPrecisions,
          );
        });
    }, [isPointVisible, isRooflineVisible, effectiveActiveHwTypes, selectedPrecisions]);

    // --- Zoom config ---
    const eventPrefix = chartDefinition.chartType === 'e2e' ? 'latency' : 'interactivity';
    const zoomResetEventName = `${eventPrefix}_zoom_reset_${chartId}`;

    const zoomConfig = useMemo(
      () => ({
        enabled: true,
        axes: 'both' as const,
        scaleExtent: [0.7, 20] as [number, number],
        resetEventName: zoomResetEventName,
        onReset: () => {
          track(`${eventPrefix}_zoom_reset`);
        },
        constrain: (transform: d3.ZoomTransform, extent: [[number, number], [number, number]]) => {
          const width = extent[1][0];
          const height = extent[1][1];
          let tx = transform.x;
          let ty = transform.y;
          const k = transform.k;
          const maxTx = 0;
          const minTx = Math.min(0, width - width * k);
          const minTy = height * (1 - k);
          const maxTy = Math.max(minTy, 0);
          tx = Math.max(minTx, Math.min(maxTx, tx));
          ty = Math.max(minTy, Math.min(maxTy, ty));
          return d3.zoomIdentity.translate(tx, ty).scale(k);
        },
        onZoom: (_event: d3.D3ZoomEvent<SVGSVGElement, unknown>, ctx: ZoomContext) => {
          if (xScaleConfig._isLog) {
            const newXS = ctx.newXScale as d3.ScaleLogarithmic<number, number>;
            ctx.layout.xAxisGroup.call(
              d3.axisBottom(newXS).ticks(10).tickFormat(logTickFormat(newXS)) as any,
            );
          }
          if (yScaleConfig.type === 'log') {
            const newYS = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
            ctx.layout.yAxisGroup.call(
              d3.axisLeft(newYS).ticks(10).tickFormat(logTickFormat(newYS)) as any,
            );
          }
          if (showPointLabels && !showGradientLabels) {
            avoidPointLabelCollisions(ctx.layout.zoomGroup);
          }
        },
      }),
      [
        zoomResetEventName,
        eventPrefix,
        xScaleConfig._isLog,
        yScaleConfig.type,
        showPointLabels,
        showGradientLabels,
      ],
    );

    // --- Tooltip config ---
    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'crosshair' as const,
        content: (d: InferenceData, isPinned: boolean) =>
          generateTooltipContent({
            data: d,
            isPinned,
            xLabel,
            yLabel,
            selectedYAxisMetric,
            hardwareConfig,
            runUrl: d.run_url ? updateRepoUrl(d.run_url) : undefined,
            hasTrace:
              d.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(d.id)
                ? (interactionRef.current.traceAvailability?.[d.id] ?? false)
                : false,
            hasLog: isPersistedBenchmarkId(d.id)
              ? (interactionRef.current.logAvailability?.[d.id] ?? false)
              : false,
            locale,
          }),
        getRulerX: (d: InferenceData, xScale: any) => (xScale as ContinuousScale)(d.x),
        getRulerY: (d: InferenceData, yScale: any) => (yScale as ContinuousScale)(d.y),
        onHoverStart: (sel: d3.Selection<any, InferenceData, any, any>, d: InferenceData) =>
          applyHoverState(
            sel.select('.visible-shape') as any,
            getShapeKeyForPrecision(d.precision, interactionRef.current.selectedPrecisions),
          ),
        onHoverEnd: (sel: d3.Selection<any, InferenceData, any, any>, d: InferenceData) =>
          applyNormalState(
            sel.select('.visible-shape') as any,
            getShapeKeyForPrecision(d.precision, interactionRef.current.selectedPrecisions),
          ),
        onPointClick: (d: InferenceData) => {
          // Perf ruler mode: the click acts as a click on the point's CURVE
          // at the point's x INSTEAD of pinning the tooltip (the handler
          // drops the pin applied by the shared click path; the hover
          // tooltip stays available).
          const ruler = perfRulerRef.current;
          if (ruler.mode) {
            track('latency_data_point_clicked', {
              hw: String(d.hwKey),
              x: d.x,
              y: d.y,
              perfRuler: true,
            });
            ruler.onPointClick(d, 'official');
            return;
          }
          track('latency_data_point_clicked', { hw: String(d.hwKey), x: d.x, y: d.y });
          const tooltipEl = chartRef.current?.getTooltipElement();
          if (!tooltipEl) return;

          // ── Summary-page actions ──────────────────────────────────────────
          // ── "View charts" real link (supports browser open-in-new-tab) ───
          const viewBtn = tooltipEl.querySelector('[data-action="view-charts"]');
          if (viewBtn && isPersistedBenchmarkId(d.id)) {
            viewBtn.addEventListener('click', (btnEvent) => {
              btnEvent.stopPropagation();
              // Full-document navigation: stamp the chart state onto THIS
              // history entry first, or Back returns to a bare /inference that
              // rebuilds from defaults. Skipped in ephemeral scopes (/model
              // embeds): the store holds the primary dashboard's state there,
              // not this chart's.
              if (!ephemeralUrlState) rememberChartStateInUrl();
              track('latency_view_charts_opened', {
                id: d.id,
                hwKey: String(d.hwKey),
                conc: d.conc,
              });
            });
          }
          const logsBtn = tooltipEl.querySelector('[data-action="view-logs"]');
          if (logsBtn && typeof d.id === 'number') {
            logsBtn.addEventListener('click', (btnEvent) => {
              btnEvent.stopPropagation();
              if (d.benchmark_type !== 'agentic_traces') {
                btnEvent.preventDefault();
                setFixedLogPointId(d.id!);
                chartRef.current?.dismissTooltip();
              }
              track('latency_view_logs_opened', {
                id: d.id,
                hwKey: String(d.hwKey),
                conc: d.conc,
                benchmarkType: d.benchmark_type ?? 'single_turn',
              });
            });
          }
        },
        attachToLayer: 1, // scatter layer is index 1 (after rooflines at 0)
      }),
      [
        xLabel,
        yLabel,
        selectedYAxisMetric,
        hardwareConfig,
        // selectedPrecisions and traceAvailability are read through
        // interactionRef.current so long-lived D3 handlers always observe the
        // latest state without turning tooltip-only data into chart identity.
        locale,
      ],
    );

    // --- Layers ---
    const layers = useMemo((): LayerConfig<InferenceData>[] => {
      // ── Layer 0: Rooflines + gradient labels (custom) ──
      const rooflineLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'rooflines',
        displayIdentity: `${showGradientLabels}:${showLineLabels}`,
        render: (zoomGroup, ctx) => {
          // Visibility / colors come from the interaction ref so this closure
          // stays correct between layer recreations (toggles restyle via the
          // decoration effect instead of rebuilding the chart).
          const ir = interactionRef.current;
          const xScale = ctx.xScale as ContinuousScale;
          const yScale = ctx.yScale as ContinuousScale;
          const { defs } = ctx.layout;

          const lineGen = d3
            .line<InferenceData>()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y))
            .curve(d3.curveMonotoneX);

          // Ensure rooflines layer exists before dot-groups
          let rooflinesLayer = zoomGroup.select<SVGGElement>('.rooflines-layer');
          if (rooflinesLayer.empty()) {
            const firstDotGroup = zoomGroup.select('.dot-group').node() as SVGGElement | null;
            const node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            node.setAttribute('class', 'rooflines-layer');
            const parent = zoomGroup.node()!;
            if (firstDotGroup) firstDotGroup.before(node);
            else parent.append(node);
            rooflinesLayer = d3.select<SVGGElement, unknown>(node);
          }

          // Build roofline entries with gradient or solid stroke
          interface Entry {
            key: string;
            hw: string;
            precision: string;
            points: InferenceData[];
            stroke: string;
            visible: boolean;
          }
          const entries: Entry[] = [];
          const activeGradientIds = new Set<string>();

          Object.entries(rooflines).forEach(([key, pts]) => {
            const hw = key.split('_').slice(0, -1).join('_');
            const precision = key.split('_').pop()!;
            const visible =
              ir.effectiveActiveHwTypes.has(hw) && ir.selectedPrecisions.includes(precision);
            const baseStroke = ir.getCssColor(ir.resolveColor(hw));

            // Split into per-date sub-paths so the line never crosses dates.
            // (When only one date is present the loop runs once with the full set.)
            const byDate = groupPointsByDate(pts);
            const singleDate = byDate.size === 1;

            for (const [date, datePoints] of byDate) {
              const entryKey = singleDate ? key : `${key}__${date}`;
              let stroke = baseStroke;

              // Gradient labels only apply in the single-date case; mapping the
              // (key-wide) ParetoPointLabel array onto per-date sub-segments is
              // ambiguous and the comparison-date overlay is a rare combo.
              if (singleDate && showGradientLabels) {
                const pointLabels = allPointLabelsByKey[key];
                if (pointLabels) {
                  const stops = computeGradientStops(pointLabels, xScale);
                  if (stops) {
                    const gid = `roofline-gradient-${chartId}-${entryKey}`;
                    activeGradientIds.add(gid);
                    let gradient = defs.select<SVGLinearGradientElement>(`#${CSS.escape(gid)}`);
                    if (gradient.empty()) gradient = defs.append('linearGradient').attr('id', gid);
                    gradient
                      .attr('gradientUnits', 'userSpaceOnUse')
                      .attr('x1', xScale(datePoints[0].x))
                      .attr('y1', 0)
                      .attr('x2', xScale(datePoints.at(-1)!.x))
                      .attr('y2', 0);
                    gradient
                      .selectAll('stop')
                      .data(stops)
                      .join('stop')
                      .attr('offset', (s) => `${(s.offset * 100).toFixed(2)}%`)
                      .attr('stop-color', (s) => s.color);
                    stroke = `url(#${gid})`;
                  }
                }
              }

              entries.push({
                key: entryKey,
                hw,
                precision,
                points: datePoints,
                stroke,
                visible,
              });
            }
          });

          // Remove stale gradients
          defs.selectAll('linearGradient').each(function () {
            const id = (this as SVGLinearGradientElement).id;
            if (id.startsWith(`roofline-gradient-${chartId}-`) && !activeGradientIds.has(id)) {
              d3.select(this).remove();
            }
          });

          // Data join for roofline paths
          rooflinesLayer
            .selectAll<SVGPathElement, Entry>('.roofline-path')
            .data(
              entries.filter((entry) => entry.points.length > 1),
              (d) => d.key,
            )
            .join('path')
            .attr('class', (d) => `roofline-path roofline-${d.key}`)
            .attr('data-hw-key', (d) => d.hw)
            .attr('data-precision', (d) => d.precision)
            .attr('fill', 'none')
            .attr('stroke', (d) => d.stroke)
            .attr('stroke-width', 2.5)
            .attr('d', (d) => lineGen(d.points))
            .style('transition', 'opacity 150ms ease')
            .style('opacity', (d) => (d.visible ? 1 : 0));

          // Parallelism labels
          interface LabelSeg {
            segKey: string;
            hw: string;
            precision: string;
            label: string;
            color: string;
            x: number;
            y: number;
            visible: boolean;
          }
          const labelSegments: LabelSeg[] = [];

          if (showGradientLabels) {
            Object.entries(allPointLabelsByKey).forEach(([key, pointLabels]) => {
              if (pointLabels.length < 2) return;
              const hw = key.split('_').slice(0, -1).join('_');
              const precision = key.split('_').pop()!;
              const visible =
                ir.effectiveActiveHwTypes.has(hw) && ir.selectedPrecisions.includes(precision);

              const segments: { label: string; color: string; points: InferenceData[] }[] = [];
              let cur = {
                label: pointLabels[0].label,
                color: pointLabels[0].color,
                points: [pointLabels[0].point],
              };
              for (let i = 1; i < pointLabels.length; i++) {
                if (pointLabels[i].label === cur.label) {
                  cur.points.push(pointLabels[i].point);
                } else {
                  segments.push(cur);
                  cur = {
                    label: pointLabels[i].label,
                    color: pointLabels[i].color,
                    points: [pointLabels[i].point],
                  };
                }
              }
              segments.push(cur);

              segments.forEach((seg, idx) => {
                const midPt = seg.points[Math.floor(seg.points.length / 2)];
                labelSegments.push({
                  segKey: `${key}-${idx}`,
                  hw,
                  precision,
                  label: seg.label,
                  color: seg.color,
                  x: xScale(midPt.x),
                  y: yScale(midPt.y) - 14,
                  visible,
                });
              });
            });
          }

          const plSel = zoomGroup
            .selectAll<SVGGElement, LabelSeg>('.parallelism-label')
            .data(labelSegments, (d) => d.segKey)
            .join(
              (enter) => {
                const g = enter
                  .append('g')
                  .attr('class', 'parallelism-label')
                  .style('pointer-events', 'none')
                  .attr('transform', (d) => `translate(${d.x},${d.y})`);
                g.append('rect')
                  .attr('class', 'pl-bg')
                  .attr('rx', 4)
                  .attr('ry', 4)
                  .attr('opacity', 0.9);
                g.append('text')
                  .attr('class', 'pl-text')
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'central')
                  .attr('fill', 'white')
                  .attr('font-size', '9px')
                  .attr('font-weight', '600');
                return g;
              },
              (update) => update,
              (exit) => exit.remove(),
            )
            .attr('data-seg-key', (d) => d.segKey)
            .attr('data-hw-key', (d) => d.hw)
            .attr('data-precision', (d) => d.precision)
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
            .style('transition', 'opacity 150ms ease')
            .style('opacity', (d) => (d.visible ? 1 : 0));

          // Size each label's background to its text in two passes — write all
          // texts, then measure all bboxes — so the batch forces one layout
          // instead of one per label.
          plSel.each(function (d) {
            d3.select(this).select<SVGTextElement>('.pl-text').text(d.label);
          });
          const plMeasured: { node: SVGGElement; d: LabelSeg; bbox: DOMRect }[] = [];
          plSel.each(function (d) {
            const text = this.querySelector<SVGTextElement>('.pl-text');
            if (text) plMeasured.push({ node: this, d, bbox: text.getBBox() });
          });
          for (const { node, d, bbox } of plMeasured) {
            const px = 4;
            const py = 2;
            d3.select(node)
              .select('.pl-bg')
              .attr('x', bbox.x - px)
              .attr('y', bbox.y - py)
              .attr('width', bbox.width + px * 2)
              .attr('height', bbox.height + py * 2)
              .attr('fill', d.color);
          }

          // ── Line labels (run name along each roofline) ──
          let lineLabels: LineLabelPlacement[] = [];
          if (showLineLabels) {
            const multiPrecision = ir.selectedPrecisions.length > 1;
            const officialByGroup = new Map<string, (typeof entries)[number]>();
            for (const entry of entries) {
              if (!entry.visible) continue;
              const groupKey = multiPrecision ? entry.key : entry.hw;
              const previous = officialByGroup.get(groupKey);
              if (!previous || entry.points.length > previous.points.length) {
                officialByGroup.set(groupKey, entry);
              }
            }

            const officialSeries: LineLabelSeries<InferenceData>[] = [
              ...officialByGroup.values(),
            ].map((entry) => ({
              key: entry.key,
              seriesId: entry.hw,
              label: lineLabelText(entry.hw, entry.precision, multiPrecision, modelLabel),
              color: ir.getCssColor(ir.resolveColor(entry.hw)),
              points: entry.points,
              keepVisibleOnCollision: entry.points.length === 1,
            }));
            const overlaySeries: LineLabelSeries<InferenceData>[] = Object.entries(
              overlayRooflines,
            ).flatMap(([overlayKey, group]) => {
              if (!ir.activeOverlayHwTypes.has(group.hwKey)) return [];
              const info = unofficialRunInfos[group.runIndex];
              const precision = group.points[0]?.precision ?? '';
              const label = info
                ? multiPrecision
                  ? `✕ ${info.branch || `run ${info.id}`} ${getPrecisionLabel(precision as Precision)}`
                  : `✕ ${info.branch || `run ${info.id}`}`
                : lineLabelText(group.hwKey, precision, multiPrecision, modelLabel);
              return [
                {
                  key: `overlay-${overlayKey}`,
                  seriesId: group.hwKey,
                  label,
                  color: overlayRunColor(group.runIndex),
                  points: group.points,
                },
              ];
            });
            const labelSeries = [...officialSeries, ...overlaySeries];

            // Both chart types spread labels along their lines with collision
            // avoidance — endpoint-only placement stacked every label at the
            // right edge of the e2e latency chart.
            lineLabels = placeLineLabels(labelSeries, xScale, yScale, {
              collisionWidth: 120,
              anchors: lineLabelAnchorRef.current,
              pinAnchors: pinLineLabels,
              obstacles: parallelismLabelBoxes(ctx.layout.zoomGroup.node()),
            });

            // Keep hidden data-join entries for precision/date curves that lost
            // deduplication, preserving the chart's one-label-per-series identity.
            const labeledKeys = new Set(lineLabels.map((label) => label.key));
            for (const entry of entries) {
              if (labeledKeys.has(entry.key)) continue;
              lineLabels.push({
                key: entry.key,
                seriesId: entry.hw,
                label: lineLabelText(entry.hw, entry.precision, multiPrecision, modelLabel),
                color: ir.getCssColor(ir.resolveColor(entry.hw)),
                x: xScale(entry.points[0].x),
                y: yScale(entry.points[0].y),
                visible: false,
              });
              labeledKeys.add(entry.key);
            }

            if (pinLineLabels) {
              for (const key of lineLabelAnchorRef.current.keys()) {
                if (!labeledKeys.has(key)) lineLabelAnchorRef.current.delete(key);
              }
            }
          }

          renderLineLabels(zoomGroup, lineLabels, {
            seriesAttribute: 'data-hw-key',
            iconFor: (label) => getLineLabelVendorIcon(label.seriesId),
            configureGroup: (labelGroup, label) => {
              labelGroup
                .attr('data-visible', label.visible ? '1' : '0')
                .select('.ll-bg')
                .attr('opacity', 0.95);
            },
            configureText: (text, label) => {
              const config = getHardwareConfig(label.seriesId, modelLabel);
              const hardwareLabel = getDisplayLabel(config);
              const isHardwareLabel =
                label.label === hardwareLabel || label.label.startsWith(`${config.label} `);
              const remainingLabel = isHardwareLabel ? label.label.slice(config.label.length) : '';
              const engineLabel = config.suffix ? ` ${config.suffix}` : '';
              const precisionLabel =
                engineLabel && remainingLabel.endsWith(engineLabel)
                  ? remainingLabel.slice(0, -engineLabel.length)
                  : remainingLabel;
              const segments = isHardwareLabel
                ? [
                    { className: 'll-gpu', text: config.label, fill: 'white', weight: '700' },
                    ...(precisionLabel
                      ? [
                          {
                            className: 'll-precision',
                            text: precisionLabel,
                            fill: 'white',
                            weight: '600',
                          },
                        ]
                      : []),
                    ...(config.suffix
                      ? [
                          {
                            className: 'll-engine',
                            text: engineLabel,
                            fill: '#d1d5db',
                            weight: '400',
                          },
                        ]
                      : []),
                  ]
                : [
                    {
                      className: 'll-plain',
                      text: label.label,
                      fill: 'white',
                      weight: '600',
                    },
                  ];
              text
                .selectAll<SVGTSpanElement, (typeof segments)[number]>('tspan')
                .data(segments, (segment) => segment.className)
                .join('tspan')
                .attr('class', (segment) => segment.className)
                .attr('fill', (segment) => segment.fill)
                .attr('font-weight', (segment) => segment.weight)
                .text((segment) => segment.text);
            },
          });
        },
        onDisplayUpdate: (zoomGroup, ctx) => {
          const transform = d3.zoomTransform(ctx.layout.svg.node()!);
          rooflineLayer.render?.(zoomGroup, {
            ...ctx,
            xScale: transform.rescaleX(ctx.xScale as ContinuousScale),
            yScale: transform.rescaleY(ctx.yScale as ContinuousScale),
          });
          zoomGroup.selectAll('.line-label').raise();
        },
        onZoom: (zoomGroup, ctx) => {
          const ir = interactionRef.current;
          const newXScale = ctx.newXScale as ContinuousScale;
          const newYScale = ctx.newYScale as ContinuousScale;
          const { defs } = ctx.layout;

          const lineGen = d3
            .line<InferenceData>()
            .x((d) => newXScale(d.x))
            .y((d) => newYScale(d.y))
            .curve(d3.curveMonotoneX);

          // Update roofline paths — must split per-date so the zoom redraw
          // matches the per-date sub-paths created in the initial render.
          Object.entries(rooflines).forEach(([key, pts]) => {
            if (pts.length < 2) return;
            const byDate = groupPointsByDate(pts);
            const singleDate = byDate.size === 1;
            for (const [date, datePoints] of byDate) {
              if (datePoints.length < 2) continue;
              const cls = singleDate ? `roofline-${key}` : `roofline-${key}__${date}`;
              const sel = zoomGroup.select<SVGPathElement>(`.${CSS.escape(cls)}`);
              if (!sel.empty()) sel.attr('d', lineGen(datePoints) as string);
            }
          });

          // Update gradient coordinates
          if (showGradientLabels) {
            Object.entries(allPointLabelsByKey).forEach(([key, pointLabels]) => {
              if (pointLabels.length < 2) return;
              const gid = `roofline-gradient-${chartId}-${key}`;
              const gradientEl = defs.select(`#${CSS.escape(gid)}`);
              if (!gradientEl.empty()) {
                const newStops = computeGradientStops(pointLabels, newXScale);
                if (newStops) {
                  gradientEl
                    .attr('x1', newXScale(pointLabels[0].point.x))
                    .attr('x2', newXScale(pointLabels.at(-1)!.point.x));
                  gradientEl
                    .selectAll('stop')
                    .data(newStops)
                    .join('stop')
                    .attr('offset', (s) => `${(s.offset * 100).toFixed(2)}%`)
                    .attr('stop-color', (s) => s.color);
                }
              }

              // Update parallelism label positions
              const segments: { points: InferenceData[] }[] = [];
              let cur = { points: [pointLabels[0].point] };
              for (let i = 1; i < pointLabels.length; i++) {
                if (pointLabels[i].label === pointLabels[i - 1].label) {
                  cur.points.push(pointLabels[i].point);
                } else {
                  segments.push(cur);
                  cur = { points: [pointLabels[i].point] };
                }
              }
              segments.push(cur);

              segments.forEach((seg, idx) => {
                const segKey = `${key}-${idx}`;
                const labelGroup = zoomGroup.select<SVGGElement>(
                  `.parallelism-label[data-seg-key="${segKey}"]`,
                );
                if (!labelGroup.empty()) {
                  const midPt = seg.points[Math.floor(seg.points.length / 2)];
                  labelGroup.attr(
                    'transform',
                    `translate(${newXScale(midPt.x)},${newYScale(midPt.y) - 14})`,
                  );
                }
              });
            });
          }

          // Update line label positions on zoom with the same placement
          // primitives used for the initial render.
          if (showLineLabels) {
            const multiPrecision = ir.selectedPrecisions.length > 1;
            const bestByGroup = new Map<
              string,
              { key: string; seriesId: string; points: InferenceData[] }
            >();
            for (const [key, points] of Object.entries(rooflines)) {
              const hardware = key.split('_').slice(0, -1).join('_');
              const precision = key.split('_').pop()!;
              if (
                !ir.effectiveActiveHwTypes.has(hardware) ||
                !ir.selectedPrecisions.includes(precision)
              ) {
                continue;
              }
              const pointsByDate = groupPointsByDate(points);
              const singleDate = pointsByDate.size === 1;
              for (const [date, datePoints] of pointsByDate) {
                const entryKey = singleDate ? key : `${key}__${date}`;
                const groupKey = multiPrecision ? entryKey : hardware;
                const previous = bestByGroup.get(groupKey);
                if (!previous || datePoints.length > previous.points.length) {
                  bestByGroup.set(groupKey, {
                    key: entryKey,
                    seriesId: hardware,
                    points: datePoints,
                  });
                }
              }
            }
            const officialSeries: LineLabelSeries<InferenceData>[] = [...bestByGroup.values()].map(
              (entry) => ({
                ...entry,
                label: '',
                color: '',
                keepVisibleOnCollision: entry.points.length === 1,
              }),
            );
            const overlaySeries: LineLabelSeries<InferenceData>[] = Object.entries(
              overlayRooflines,
            ).flatMap(([overlayKey, group]) =>
              ir.activeOverlayHwTypes.has(group.hwKey)
                ? [
                    {
                      key: `overlay-${overlayKey}`,
                      seriesId: group.hwKey,
                      label: '',
                      color: '',
                      points: group.points,
                    },
                  ]
                : [],
            );
            const labelSeries = [...officialSeries, ...overlaySeries];
            const zoomLabels = placeLineLabels(labelSeries, newXScale, newYScale, {
              collisionWidth: 120,
              anchors: lineLabelAnchorRef.current,
              pinAnchors: pinLineLabels,
              obstacles: parallelismLabelBoxes(zoomGroup.node()),
            });
            updateRenderedLineLabels(zoomGroup, zoomLabels);
          }
        },
      };

      // ── Layer 1: Official scatter points ──
      const scatterLayer: LayerConfig<InferenceData> = {
        type: 'scatter',
        key: 'points',
        data: pointsData,
        config: {
          // Visibility / colors / shapes read the interaction ref so these
          // accessors stay current between layer recreations (toggles restyle
          // via the decoration effect instead of rebuilding the chart).
          getColor: (d) =>
            (showGradientLabels && gradientColorByPoint.get(d)) ||
            interactionRef.current.getCssColor(
              interactionRef.current.resolveColor(d.hwKey as string),
            ),
          getOpacity: (d) => (interactionRef.current.isPointVisible(d) ? 1 : 0),
          getPointerEvents: (d) => (interactionRef.current.isPointVisible(d) ? 'auto' : 'none'),
          hideLabels: !showPointLabels || showGradientLabels,
          // Concurrency (C=) is appended only when the advanced
          // "# Concurrent Sessions" toggle is on.
          getLabelText: (d) => pointLabelText(d, useAdvancedLabels, showConcurrencyLabels),
          foreground: 'var(--foreground)',
          dataAttrs: {
            'hw-key': (d) => String(d.hwKey),
            precision: (d) => d.precision,
            // Lets the agentic coach mark pick an anchor out of the DOM
            // without knowing anything about React state.
            'benchmark-type': (d) => d.benchmark_type ?? '',
          },
          getShapeKey: (d) =>
            getShapeKeyForPrecision(d.precision, interactionRef.current.selectedPrecisions),
        },
        keyFn: buildPointId,
      };

      // ── Layer 2: Overlay (rooflines + X-shape points) ──
      const overlayLayer: CustomLayerConfig | null = overlayData
        ? {
            type: 'custom',
            key: 'overlay',
            displayIdentity: `${showPointLabels}:${showGradientLabels}`,
            render: (zoomGroup, ctx) => {
              const xScale = ctx.xScale as ContinuousScale;
              const yScale = ctx.yScale as ContinuousScale;

              // Overlay rooflines
              const lineGen = d3
                .line<InferenceData>()
                .x((d) => xScale(d.x))
                .y((d) => yScale(d.y))
                .curve(d3.curveMonotoneX);

              interface OvEntry {
                key: string;
                points: InferenceData[];
                stroke: string;
                runIndex: number;
              }
              const ovEntries: OvEntry[] = [];
              Object.entries(overlayRooflines).forEach(([key, group]) => {
                const hwCfg = overlayData.hardwareConfig[group.hwKey];
                if (hwCfg && group.points.length > 1) {
                  ovEntries.push({
                    key,
                    points: group.points,
                    // Color by run — same palette entry the legend uses, so they match.
                    stroke: overlayRunColor(group.runIndex),
                    runIndex: group.runIndex,
                  });
                }
              });

              let rooflinesLayer = zoomGroup.select<SVGGElement>('.rooflines-layer');
              if (rooflinesLayer.empty()) {
                rooflinesLayer = zoomGroup.append('g').attr('class', 'rooflines-layer');
              }
              rooflinesLayer
                .selectAll<SVGPathElement, OvEntry>('.overlay-roofline-path')
                .data(ovEntries, (d) => d.key)
                .join('path')
                .attr('class', (d) => `overlay-roofline-path overlay-roofline-${d.key}`)
                .attr('fill', 'none')
                .attr('stroke', (d) => d.stroke)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', (d) => overlayRooflineDasharray(d.runIndex))
                .attr('d', (d) => lineGen(d.points))
                .style('filter', null);

              // Overlay X-shape points — index-keyed so every point renders
              const overlayPoints = zoomGroup
                .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
                .data(processedOverlayData, (_d, i) => String(i))
                .join((enter) => {
                  const g = enter.append('g').attr('class', 'unofficial-overlay-pt');
                  g.append('circle')
                    .attr('r', HIT_AREA_RADIUS)
                    .attr('fill', 'transparent')
                    .attr('cursor', 'pointer');
                  g.each(function (d) {
                    const hwCfg = overlayData.hardwareConfig[d.hwKey];
                    if (hwCfg) {
                      d3.select(this)
                        .append('path')
                        .attr('class', 'visible-shape overlay-x')
                        .attr('d', xMarkerPath(5, 0.7))
                        .attr('fill', 'none')
                        .attr('stroke-width', 2.5)
                        .attr('stroke-linecap', 'round')
                        .attr('cursor', 'pointer');
                    }
                  });
                  return g;
                });

              overlayPoints.attr('transform', (d) => `translate(${xScale(d.x)},${yScale(d.y)})`);
              overlayPoints.style('filter', null);
              // Optimal Only parity with official points (see isOverlayPointVisible).
              // Read through the interaction ref so this long-lived closure sees
              // the current toggle state on zoom/label re-renders.
              overlayPoints.each(function (d) {
                const visible = interactionRef.current.isOverlayPointVisible(d);
                d3.select(this)
                  .style('opacity', visible ? 1 : 0)
                  .style('pointer-events', visible ? 'auto' : 'none');
              });
              overlayPoints
                .select('.overlay-x')
                .attr('stroke', (d) =>
                  overlayRunColor(overlayRunIndex(d.run_url ?? null, runIndexByUrl)),
                );

              // Match official points: KV offload and the measured-axis
              // legacy-power ring are the only persistent point decorations.
              // Decode method remains in the tooltip.
              overlayPoints.each(function (d) {
                const overlayStroke = overlayRunColor(
                  overlayRunIndex(d.run_url ?? null, runIndexByUrl),
                );
                renderOffloadHalo(d3.select(this), d, overlayStroke);
                renderLegacyPowerRing(d3.select(this), d, isMeasuredEnergyAxis, overlayStroke);
              });

              // Labels
              const showLabels = showPointLabels && !showGradientLabels;
              overlayPoints.each(function (d) {
                const lines = pointLabelText(d, useAdvancedLabels, showConcurrencyLabels).split(
                  '\n',
                );
                const text = d3
                  .select(this)
                  .selectAll<SVGTextElement, boolean>('.overlay-label')
                  .data([true])
                  .join('text')
                  .attr('class', 'overlay-label')
                  .attr('text-anchor', 'middle')
                  .style('fill', 'var(--foreground)')
                  .attr('font-size', '10px')
                  .attr('font-weight', '700')
                  .attr('pointer-events', 'none');
                const firstDy = -(1 + (lines.length - 1) * 1.1);
                text
                  .selectAll<SVGTSpanElement, string>('tspan')
                  .data(lines)
                  .join('tspan')
                  .attr('x', 0)
                  .attr('dy', (_l, i) => (i === 0 ? `${firstDy}em` : '1.1em'))
                  .text((l) => l);
              });
              overlayPoints
                .selectAll('.overlay-label')
                .style('display', showLabels ? '' : 'none')
                .style('opacity', showLabels ? 1 : 0);

              // Overlay marker content/coordinates stay chart-local; the shared
              // helper owns the hover, pin, ruler, and marker-state lifecycle.
              const svgNode = ctx.layout.svg.node()!;
              const container = svgNode.parentElement as HTMLDivElement;
              const tooltip = d3.select(ctx.tooltipElement);
              const showRulers = (point: InferenceData, marker: SVGGElement) => {
                const position = overlayMarkerPosition(marker) ?? {
                  x: xScale(point.x),
                  y: yScale(point.y),
                };
                zoomGroup.select('.ruler-group').style('display', 'block');
                zoomGroup.select('.vertical-ruler').attr('x1', position.x).attr('x2', position.x);
                zoomGroup.select('.horizontal-ruler').attr('y1', position.y).attr('y2', position.y);
              };
              attachOverlayXMarkerHandlers(overlayPoints, {
                markerSelector: '.overlay-x',
                normalPath: xMarkerPath(5, 0.7),
                hoverPath: xMarkerPath(7, 0.7),
                tooltip,
                handle: chartRef.current,
                content: (point, pinned) =>
                  generateOverlayTooltipContent({
                    data: point,
                    isPinned: pinned,
                    xLabel,
                    yLabel,
                    selectedYAxisMetric,
                    hardwareConfig: overlayData.hardwareConfig,
                    overlayData,
                    locale,
                  }),
                position: (event) => {
                  const [mouseX, mouseY] = d3.pointer(event, container);
                  return computeTooltipPosition(mouseX, mouseY, tooltip, container);
                },
                rulers: {
                  show: showRulers,
                  hide: () => zoomGroup.select('.ruler-group').style('display', 'none'),
                },
                onClick: (point) => {
                  // Overlay points participate in the perf ruler too — a
                  // ruler-mode click acts as a click on the overlay curve at
                  // the point's x instead of keeping the pinned tooltip (see
                  // AGENTS.md "Unofficial Run Support").
                  const ruler = perfRulerRef.current;
                  if (ruler.mode) {
                    track('latency_data_point_clicked', {
                      hw: String(point.hwKey),
                      x: point.x,
                      y: point.y,
                      overlay: true,
                      perfRuler: true,
                    });
                    ruler.onPointClick(point, 'overlay');
                    return;
                  }
                  track('latency_data_point_clicked', {
                    hw: String(point.hwKey),
                    x: point.x,
                    y: point.y,
                    overlay: true,
                  });
                },
              });
            },
            onDisplayUpdate: (zoomGroup) => {
              const showLabels = showPointLabels && !showGradientLabels;
              zoomGroup
                .selectAll('.unofficial-overlay-pt .overlay-label')
                .style('display', showLabels ? '' : 'none')
                .style('opacity', showLabels ? 1 : 0);
            },
            onZoom: (zoomGroup, ctx) => {
              const newXScale = ctx.newXScale as ContinuousScale;
              const newYScale = ctx.newYScale as ContinuousScale;

              // Update overlay rooflines
              const lineGen = d3
                .line<InferenceData>()
                .x((d) => newXScale(d.x))
                .y((d) => newYScale(d.y))
                .curve(d3.curveMonotoneX);

              Object.entries(overlayRooflines).forEach(([key, group]) => {
                if (group.points.length < 2) return;
                const sel = zoomGroup.select<SVGPathElement>(`.overlay-roofline-${key}`);
                if (!sel.empty()) sel.attr('d', lineGen(group.points) as string);
              });

              // Update overlay points
              zoomGroup
                .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
                .attr('transform', (d) => `translate(${newXScale(d.x)},${newYScale(d.y)})`);
            },
          }
        : null;

      // ── Intentional clipping: interpolated dashed Pareto continuation + arrow ──
      const drawOverflowContinuations = (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: RenderContext,
        xScale: ContinuousScale,
        yScale: ContinuousScale,
      ) => {
        const ir = interactionRef.current;
        const entries = [...officialOverflowContinuations, ...overlayOverflowContinuations];

        const layer = zoomGroup
          .selectAll<SVGGElement, unknown>('.overflow-continuations-layer')
          .data([null])
          .join('g')
          .attr('class', 'overflow-continuations-layer')
          .attr('pointer-events', 'none');
        const rooflinesLayer = zoomGroup.select<SVGGElement>('.rooflines-layer').node();
        const layerNode = layer.node();
        if (rooflinesLayer && layerNode && layerNode.nextSibling !== rooflinesLayer) {
          layerNode.parentNode?.insertBefore(layerNode, rooflinesLayer);
        }

        const groups = layer
          .selectAll<SVGGElement, (typeof entries)[number]>('.overflow-continuation')
          .data(entries, (entry) => entry.key)
          .join((enter) => {
            const group = enter.append('g');
            group
              .append('clipPath')
              .attr('class', 'overflow-continuation-clip')
              .attr('clipPathUnits', 'userSpaceOnUse')
              .append('path');
            group.append('path').attr('class', 'overflow-continuation-line');
            group
              .append('path')
              .attr('class', 'overflow-continuation-arrow')
              .attr('d', 'M 0 0 L -9 -4.5 L -9 4.5 Z');
            group.append('text').attr('class', 'overflow-continuation-label');
            return group;
          })
          .attr('class', (entry) => `overflow-continuation ${entry.source}-overflow-continuation`)
          .attr('data-testid', (entry) => `${entry.source}-overflow-continuation`)
          .attr('data-hw-key', (entry) => entry.hw)
          .attr('data-precision', (entry) => entry.precision)
          .attr('data-clip-reasons', (entry) => entry.reasons.join(','))
          .attr('data-hidden-point-count', (entry) => entry.hiddenPointCount)
          .style('transition', 'opacity 150ms ease')
          .style('opacity', (entry) =>
            entry.source === 'overlay' ||
            (ir.effectiveActiveHwTypes.has(entry.hw) &&
              ir.selectedPrecisions.includes(entry.precision))
              ? 1
              : 0,
          );

        groups.each(function (entry, index) {
          const color =
            entry.source === 'overlay'
              ? overlayRunColor(entry.runIndex ?? 0)
              : ir.getCssColor(ir.resolveColor(entry.hw));
          const group = d3.select(this);
          const pointsRight = entry.toward.x >= entry.from.x;
          const anchorX = xScale(entry.from.x);
          const anchorY = yScale(entry.from.y);
          const clipId = `${chartId}-overflow-continuation-${entry.source}-${index}`;
          group.select<SVGClipPathElement>('.overflow-continuation-clip').attr('id', clipId);
          const lineGenerator = d3
            .line<InferenceData>()
            .x((point) => xScale(point.x))
            .y((point) => yScale(point.y))
            .curve(d3.curveMonotoneX);
          const continuationPath = group
            .select<SVGPathElement>('.overflow-continuation-line')
            .attr('d', lineGenerator(entry.points) ?? '')
            .attr('clip-path', `url(#${clipId})`)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 2.25)
            .attr('stroke-dasharray', '6 5')
            .attr('stroke-linecap', 'round');
          const pathNode = continuationPath.node();
          const geometry = pathNode
            ? visibleContinuationEndpoint(pathNode, anchorX, ctx.width, ctx.height)
            : null;
          const clipRadius = geometry
            ? Math.min(96, Math.max(0.1, Math.hypot(geometry.x2 - anchorX, geometry.y2 - anchorY)))
            : 96;
          group
            .select<SVGClipPathElement>('.overflow-continuation-clip')
            .select('path')
            .attr(
              'd',
              `M${anchorX},${anchorY - clipRadius}A${clipRadius},${clipRadius} 0 0 ${
                pointsRight ? 1 : 0
              } ${anchorX},${anchorY + clipRadius}L${anchorX},${anchorY}Z`,
            );
          group.attr('display', null);
          if (!geometry) {
            group
              .selectAll<SVGElement, unknown>(
                '.overflow-continuation-arrow, .overflow-continuation-label',
              )
              .attr('display', 'none');
            return;
          }
          const label =
            entry.reasons.includes('cost') && entry.reasons.includes('latency')
              ? legendT.overflowMixed(entry.hiddenPointCount)
              : entry.reasons.includes('cost')
                ? legendT.overflowCost(entry.hiddenPointCount, costLimit)
                : legendT.overflowLatency(entry.hiddenPointCount, latencyLimit);
          const labelToRight = geometry.x2 < ctx.width / 2;
          group
            .select<SVGPathElement>('.overflow-continuation-arrow')
            .attr('display', null)
            .attr('transform', `translate(${geometry.x2},${geometry.y2}) rotate(${geometry.angle})`)
            .attr('fill', color);
          group
            .attr('aria-label', label)
            .select<SVGTextElement>('.overflow-continuation-label')
            .attr('display', null)
            .attr('data-testid', 'overflow-continuation-label')
            .attr('x', geometry.x2 + (labelToRight ? 12 : -12))
            .attr('y', fitContinuationLabelBaseline(geometry.y2, ctx.height))
            .attr('text-anchor', labelToRight ? 'start' : 'end')
            .attr('fill', color)
            .attr('stroke', ir.getCssColor('--background'))
            .attr('stroke-width', 4)
            .attr('stroke-linejoin', 'round')
            .attr('paint-order', 'stroke')
            .attr('font-size', 11.5)
            .attr('font-weight', 600)
            .text(label);
        });
      };
      const overflowContinuationLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'overflow-continuations',
        render: (zoomGroup, ctx) =>
          drawOverflowContinuations(
            zoomGroup,
            ctx,
            ctx.xScale as ContinuousScale,
            ctx.yScale as ContinuousScale,
          ),
        onZoom: (zoomGroup, ctx) =>
          drawOverflowContinuations(
            zoomGroup,
            ctx,
            ctx.newXScale as ContinuousScale,
            ctx.newYScale as ContinuousScale,
          ),
      };

      // Annotations/colors resolve through the interaction ref so visibility
      // toggles can redraw this layer without recreating the chart.
      const knownIssueLayer = createKnownIssueLayer(() => {
        const current = interactionRef.current;
        return {
          chartId,
          annotations: current.knownIssueAnnotations,
          background: current.getCssColor('--background'),
          foreground: current.getCssColor('--foreground'),
          mutedForeground: current.getCssColor('--muted-foreground'),
          onLinkClick: (annotation) =>
            annotation.issue &&
            track('inference_known_issue_clicked', {
              hwKey: annotation.issue.hwKey,
              issue: annotation.issue.issueRef,
            }),
        };
      });

      // ── Perf ruler (opt-in iso-x measurement between two curves) ──
      // Mode and measurement are read through refs, so this layer needs
      // no perf-ruler dependencies: full re-renders redraw it after the data
      // phase (the iso-x lives in data space, so it survives metric/display
      // re-renders), and onZoom keeps it glued to the curves during pan/zoom.
      // It lives inside the zoomGroup, so it is clipped and PNG-exported like
      // any other mark.
      const perfRulerLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'perf-ruler',
        render: (zoomGroup, ctx) =>
          drawPerfRuler(
            zoomGroup,
            (ctx.renderedXScale ?? ctx.xScale) as ContinuousScale,
            (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale,
            ctx.width,
            ctx.height,
          ),
        onZoom: (zoomGroup, ctx) =>
          drawPerfRuler(
            zoomGroup,
            ctx.newXScale as ContinuousScale,
            ctx.newYScale as ContinuousScale,
            ctx.width,
            ctx.height,
          ),
      };

      const result: LayerConfig<InferenceData>[] = [rooflineLayer, scatterLayer];
      if (overlayLayer) result.push(overlayLayer);
      result.push(overflowContinuationLayer, perfRulerLayer, knownIssueLayer);
      return result;
      // Interaction state (visibility, colors, precision shapes, known-issue
      // annotations) is deliberately NOT a dependency: layer closures read it
      // through interactionRef, and the decoration effect restyles the
      // existing DOM when it changes. Only data/structure changes recreate
      // the layers (and with them, the full chart render).
    }, [
      rooflines,
      allPointLabelsByKey,
      showGradientLabels,
      showLineLabels,
      pinLineLabels,
      gradientColorByPoint,
      chartId,
      pointsData,
      showPointLabels,
      useAdvancedLabels,
      showConcurrencyLabels,
      buildPointId,
      overlayData,
      processedOverlayData,
      overlayRooflines,
      officialOverflowContinuations,
      overlayOverflowContinuations,
      unofficialRunInfos,
      runIndexByUrl,
      hardwareConfig,
      xLabel,
      yLabel,
      selectedYAxisMetric,
      isMeasuredEnergyAxis,
      chartDefinition,
      locale,
      drawPerfRuler,
    ]);

    // Layers handle for the decoration effect — lets it re-run individual
    // custom layer renders (rooflines/labels, known issues) without waiting
    // for a full chart rebuild.
    const layersRef = useRef(layers);
    layersRef.current = layers;

    // --- onRender: CSS transitions, offload halos, and log tick formatting ---
    const onRender = useCallback(
      (ctx: RenderContext) => {
        // Stash the render context for the decoration effect.
        lastRenderCtxRef.current = ctx;
        const { zoomGroup } = ctx.layout;

        // CSS transitions for smooth opacity animation on hw toggle
        zoomGroup.selectAll('.dot-group').style('transition', 'opacity 150ms ease');

        // Offload halo: dashed ring on every point that used KV offload (Pareto or not).
        // Legacy-power ring: dotted ring on unvalidated telemetry, measured axes only.
        zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (d) {
          renderOffloadHalo(d3.select(this), d, 'var(--foreground)');
          renderLegacyPowerRing(d3.select(this), d, isMeasuredEnergyAxis, 'var(--foreground)');
        });

        avoidPointLabelCollisions(zoomGroup);

        // Tell the nudge engine the chart has painted, so an anchored coach
        // mark can retry resolving a point to point at. This fires once per
        // full render, never per zoom frame.
        window.dispatchEvent(new CustomEvent(SCATTER_RENDERED_EVENT));
        // Log tick formatting on initial render
        if (xScaleConfig._isLog) {
          const xScale = (ctx.renderedXScale ?? ctx.xScale) as d3.ScaleLogarithmic<number, number>;
          ctx.layout.xAxisGroup.call(
            d3.axisBottom(xScale).ticks(10).tickFormat(logTickFormat(xScale)) as any,
          );
        }
        if (yScaleConfig.type === 'log') {
          const yScale = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLogarithmic<number, number>;
          ctx.layout.yAxisGroup.call(
            d3.axisLeft(yScale).ticks(10).tickFormat(logTickFormat(yScale)) as any,
          );
        }
      },
      [
        hardwareConfig,
        xScaleConfig._isLog,
        yScaleConfig.type,
        optimalPointKeys,
        getCssColor,
        resolveColor,
        // A metric-only change must re-run the decoration pass so legacy-power
        // rings appear/disappear with the Measured Energy axis selection.
        isMeasuredEnergyAxis,
      ],
    );

    // --- Side effects ---

    // ScatterGraph has more independent display controls than the generic
    // D3 scatter layer. Keep their mutation scopes separate so a label-only
    // toggle never restamps every point shape, visibility flag, or trace
    // attribute.
    //
    // Mark styling: visibility, palette, and precision shape. This effect can
    // run immediately after a full render while the renderer's old-to-new
    // entrance transitions are only scheduled, so it never writes the
    // animated dot-group `transform` or roofline `d` attributes.
    useLayoutEffect(() => {
      const display = getDisplaySelection();
      if (!display) return;
      const { zoomGroup } = display;
      const ir = interactionRef.current;

      zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (d) {
        const point = d3.select(this);
        const visible = ir.isPointVisible(d);
        point.style('opacity', visible ? 1 : 0).style('pointer-events', visible ? 'auto' : 'none');
        const color =
          (showGradientLabels && gradientColorByPoint.get(d)) ||
          ir.getCssColor(ir.resolveColor(d.hwKey as string));
        syncPointShape(
          point as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
          getShapeKeyForPrecision(d.precision, ir.selectedPrecisions),
          color,
        );
        // A precision toggle may replace and append the visible SVG shape.
        // Keep the decorations above that shape after the swap.
        point.selectAll('.offload-halo').raise();
        point.selectAll('.legacy-power-ring').raise();
      });

      // Overlay points keep their X marker and run-derived color. Only their
      // visibility follows Optimal Only and overlay hardware selection.
      zoomGroup.selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt').each(function (d) {
        const visible = ir.isOverlayPointVisible(d);
        d3.select(this)
          .style('opacity', visible ? 1 : 0)
          .style('pointer-events', visible ? 'auto' : 'none');
      });

      // Rooflines: visibility and solid-stroke recolor as direct writes. Keep
      // gradient url references intact and never touch animated path geometry.
      zoomGroup.selectAll<SVGPathElement, unknown>('.roofline-path').each(function () {
        const hw = this.dataset.hwKey;
        const precision = this.dataset.precision;
        if (!hw || !precision) return;
        const roofline = d3.select(this);
        const visible =
          ir.effectiveActiveHwTypes.has(hw) && ir.selectedPrecisions.includes(precision);
        roofline.style('opacity', visible ? 1 : 0);
        const stroke = roofline.attr('stroke');
        if (stroke && !stroke.startsWith('url(')) {
          roofline.attr('stroke', ir.getCssColor(ir.resolveColor(hw)));
        }
      });

      zoomGroup
        .selectAll<SVGGElement, unknown>('.official-overflow-continuation')
        .each(function () {
          const hw = this.dataset.hwKey;
          const precision = this.dataset.precision;
          if (!hw || !precision) return;
          const visible =
            ir.effectiveActiveHwTypes.has(hw) && ir.selectedPrecisions.includes(precision);
          const color = ir.getCssColor(ir.resolveColor(hw));
          d3.select(this)
            .style('opacity', visible ? 1 : 0)
            .select('.overflow-continuation-line')
            .attr('stroke', color);
          d3.select(this).select('.overflow-continuation-arrow').attr('fill', color);
        });
      zoomGroup
        .selectAll<SVGTextElement, unknown>('.overflow-continuation-label')
        .attr('stroke', ir.getCssColor('--background'));

      zoomGroup
        .selectAll<SVGGElement, unknown>('.parallelism-label, .line-label')
        .style('opacity', function () {
          return labelOpacityForActiveState(
            (this as SVGGElement).dataset,
            ir.effectiveActiveHwTypes,
            ir.selectedPrecisions,
          );
        });
    }, [
      getDisplaySelection,
      isPointVisible,
      isOverlayPointVisible,
      effectiveActiveHwTypes,
      selectedPrecisions,
      activeOverlayHwTypes,
      getCssColor,
      resolveColor,
      showGradientLabels,
      gradientColorByPoint,
    ]);

    // Trace presence resolves asynchronously after the points render. Stamp
    // only the tooltip metadata it owns, without restyling any chart marks.
    useLayoutEffect(() => {
      const display = getDisplaySelection();
      if (!display) return;
      display.zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (d) {
        const pointId = isPersistedBenchmarkId(d.id) ? d.id : null;
        const persistedAgenticPoint = d.benchmark_type === 'agentic_traces' && pointId !== null;
        d3.select(this)
          .attr(
            'data-has-trace',
            pointId !== null && traceAvailability?.[pointId] === true ? 'true' : null,
          )
          .attr(
            'data-trace-availability',
            persistedAgenticPoint ? (isTraceAvailabilityPending ? 'pending' : 'resolved') : null,
          );
      });
    }, [getDisplaySelection, dataIdentity, traceAvailability, isTraceAvailabilityPending]);

    // Label-mode controls own point-label visibility and collision placement.
    // Line and gradient labels are collision obstacles whose custom layer
    // renders once through D3's display phase. Replaying that layer before the
    // point-label collision pass preserves its stable placement behavior
    // without restyling unrelated point marks. Overlay label visibility remains
    // owned by the overlay custom layer's matching selective display callback.
    useLayoutEffect(() => {
      const visibilityChanged = lastPointLabelsVisibleRef.current !== pointLabelsVisible;
      const lineLabelsChanged = lastShowLineLabelsRef.current !== showLineLabels;
      const gradientLabelsChanged = lastShowGradientLabelsRef.current !== showGradientLabels;
      if (!visibilityChanged && !lineLabelsChanged && !gradientLabelsChanged) return;
      lastPointLabelsVisibleRef.current = pointLabelsVisible;
      lastShowLineLabelsRef.current = showLineLabels;
      lastShowGradientLabelsRef.current = showGradientLabels;
      const display = getDisplaySelection();
      if (!display) return;
      const { svg, ctx, zoomGroup } = display;
      if (visibilityChanged) {
        zoomGroup
          .selectAll<SVGTextElement, unknown>('.dot-group .point-label')
          .style('display', pointLabelsVisible ? '' : 'none')
          .style('opacity', pointLabelsVisible ? 1 : 0);
      }
      if ((lineLabelsChanged || gradientLabelsChanged) && (showLineLabels || showGradientLabels)) {
        const entranceInFlight = zoomGroup
          .selectAll<SVGPathElement, unknown>('.roofline-path')
          .nodes()
          .some((node) => hasNamedTransition(node, 'data-update'));
        const rooflineLayer = layersRef.current.find((layer) => layer.key === 'rooflines');
        if (!entranceInFlight && rooflineLayer?.type === 'custom' && rooflineLayer.render) {
          rooflineLayer.render(zoomGroup, currentZoomRenderContext(svg, ctx));
        }
      }
      if (pointLabelsVisible) avoidPointLabelCollisions(zoomGroup);
    }, [getDisplaySelection, pointLabelsVisible, showGradientLabels, showLineLabels]);

    // Visibility and palette changes can alter label collision placement and
    // line-label colors. Label mode changes are handled by each custom layer's
    // display identity, so they do not also enter this pass.
    useLayoutEffect(() => {
      const display = getDisplaySelection();
      if (!display) return;
      const labelDisplay = labelDisplayRef.current;
      const { svg, ctx, zoomGroup } = display;
      const entranceInFlight = zoomGroup
        .selectAll<SVGPathElement, unknown>('.roofline-path')
        .nodes()
        .some((node) => hasNamedTransition(node, 'data-update'));

      if ((labelDisplay.showGradientLabels || labelDisplay.showLineLabels) && !entranceInFlight) {
        const rooflineLayer = layersRef.current.find((layer) => layer.key === 'rooflines');
        if (rooflineLayer?.type === 'custom' && rooflineLayer.render) {
          rooflineLayer.render(zoomGroup, currentZoomRenderContext(svg, ctx));
        }
      }
      if (labelDisplay.showPointLabels && !labelDisplay.showGradientLabels) {
        avoidPointLabelCollisions(zoomGroup);
      }
    }, [
      getDisplaySelection,
      isPointVisible,
      isOverlayPointVisible,
      effectiveActiveHwTypes,
      selectedPrecisions,
      activeOverlayHwTypes,
      getCssColor,
      resolveColor,
    ]);

    // Known-issue annotations have their own data and theme inputs. Re-render
    // only that layer when either changes.
    useLayoutEffect(() => {
      const display = getDisplaySelection();
      if (!display) return;
      const knownIssueLayer = layersRef.current.find((layer) => layer.key === 'known-issues');
      if (knownIssueLayer?.type === 'custom' && knownIssueLayer.render) {
        knownIssueLayer.render(
          display.zoomGroup,
          currentZoomRenderContext(display.svg, display.ctx),
        );
      }
    }, [getDisplaySelection, knownIssueAnnotations, getCssColor, resolveColor]);

    // D3 custom layers are keyed additions, so removing the overlay layer from
    // the config does not delete DOM that the previous render created. Clear
    // those marks explicitly when the last unofficial run is dismissed.
    useLayoutEffect(() => {
      if (overlayData) return;
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      d3.select(svg)
        .selectAll('.unofficial-overlay-pt, .overlay-roofline-path, .overlay-overflow-continuation')
        .remove();
    }, [overlayData]);

    // Perf-ruler decorations: refresh the curve hit strokes and redraw all
    // rulers whenever the mode, ruler state, visibility filters, or
    // underlying data change. Narrow mutation scope — only the hit layer
    // and the ruler groups are touched; the chart itself never rebuilds for
    // a ruler interaction. Redraws use the currently applied zoom transform
    // (mode, rulers, and live iso-x are read through refs in drawPerfRuler).
    //
    // Ordering matters twice here — this effect is deliberately declared
    // AFTER both (a) the mark-styling effect that writes curve opacities
    // from the legend/precision filters, so hiding a curve clears the ruler,
    // label, arrow, and halos in the SAME commit paint (no lingering frame),
    // and (b) the overlay-cleanup effect above, so a dismissed overlay's
    // paths are already gone when the ruler re-resolves.
    useLayoutEffect(() => {
      const display = getDisplaySelection();
      if (!display) return;
      const zoomCtx = currentZoomRenderContext(display.svg, display.ctx);
      drawPerfRuler(
        display.zoomGroup,
        zoomCtx.xScale as ContinuousScale,
        zoomCtx.yScale as ContinuousScale,
        display.ctx.width,
        display.ctx.height,
      );
      // Hidden-but-present curves KEEP their rulers (a legend re-toggle
      // brings a hidden ruler back); curves whose paths left the DOM
      // entirely are truly gone from the data, so prune each ruler (and the
      // draft) that references one. `prunePerfRulers` bails out with the
      // same reference when nothing changed.
      setPerfRulerState((prev) =>
        prunePerfRulers(prev, (cls) => !display.zoomGroup.select(`.${CSS.escape(cls)}`).empty()),
      );
    }, [
      getDisplaySelection,
      perfRulerMode,
      perfRulerState,
      drawPerfRuler,
      dataIdentity,
      effectiveActiveHwTypes,
      selectedPrecisions,
      hideNonOptimal,
      overlayData,
    ]);

    // Dismiss tooltip on filter changes
    useEffect(() => {
      chartRef.current?.dismissTooltip();
    }, [selectedPrecisions, selectedYAxisMetric, hideNonOptimal, overlayData, chartId]);

    // Dismiss when pinned point's hardware becomes hidden
    useEffect(() => {
      const pp = chartRef.current?.getPinnedPoint() as InferenceData | null;
      if (!pp) return;
      const isOverlay = chartRef.current?.getPinnedPointIsOverlay();
      if (isOverlay) {
        if (!activeOverlayHwTypes.has(pp.hwKey as string)) chartRef.current?.dismissTooltip();
      } else if (
        !effectiveActiveHwTypes.has(pp.hwKey as string) ||
        !selectedPrecisions.includes(pp.precision)
      ) {
        chartRef.current?.dismissTooltip();
      }
    }, [effectiveActiveHwTypes, selectedPrecisions, activeOverlayHwTypes]);

    // Distinguish only causes supported by the currently available rows. The
    // official data is already scope-filtered, so an empty array alone cannot
    // prove which upstream filter removed it. Overlay rows use the same filters.
    const hasMatchingHiddenPoints =
      data.some((point) => selectedPrecisions.includes(point.precision)) ||
      (overlayData?.data ?? []).some(
        (point) =>
          selectedPrecisions.includes(point.precision) && matchesQuickFilters(point, quickFilters),
      );
    const hasMatchingClippedPoints =
      clippedData.some(
        ({ point }) =>
          selectedPrecisions.includes(point.precision) &&
          effectiveActiveHwTypes.has(String(point.hwKey)),
      ) || processedOverlayClippedData.length > 0;
    const emptyReason = hasMatchingClippedPoints
      ? 'clipped'
      : hasMatchingHiddenPoints
        ? 'hidden'
        : quickFilterCount > 0
          ? 'filtered'
          : 'selection';
    const emptyState = (
      <ScatterEmptyState
        reason={emptyReason}
        description={
          emptyReason === 'selection' && isRoleLocalMeasuredEnergyConfigKey(selectedYAxisMetric)
            ? legendT.noRoleEnergyDataHint
            : undefined
        }
        onShowChips={() => {
          resetUnifiedSelection();
          track('inference_empty_recovered', { action: 'show_matching_chips' });
        }}
        onClearFilters={() => {
          clearQuickFilters();
          track('inference_quick_filters_cleared', { source: 'scatter_empty' });
        }}
        onEditFilters={() => {
          setQuickFiltersOpen(true);
          track('inference_quick_filters_dialog_opened', { source: 'scatter_empty' });
        }}
        onShowTable={onShowTable}
      />
    );

    // --- Empty state ---
    if (data.length === 0 && !overlayData?.data?.length) {
      return (
        <div className="relative w-full p-3">
          <div className="flex min-h-100 items-center justify-center">{emptyState}</div>
          <QuickFiltersDialog
            open={quickFiltersOpen}
            onOpenChange={setQuickFiltersOpen}
            bestPerSku={{ checked: bestPerSku, onCheckedChange: handleBestPerSkuChange }}
          />
        </div>
      );
    }

    return (
      <>
        <D3Chart<InferenceData>
          ref={chartRef}
          height={minimalChrome ? EMBED_CHART_HEIGHT : undefined}
          chartId={chartId}
          // Stable across toggles: the render effect keys on this for "data
          // changed" rebuilds; scale domains come from x/yScaleConfig (computed
          // from the visible points), and visibility is applied via opacity.
          data={pointsData}
          dataIdentity={dataIdentity}
          metricIdentity={metricIdentity}
          margin={CHART_MARGIN}
          watermark={getChartWatermark(isUnofficialRun)}
          testId="scatter-graph"
          grabCursor={true}
          caption={caption}
          xScale={xScaleConfig}
          yScale={yScaleConfig}
          xAxis={xAxisConfig}
          yAxis={yAxisConfig}
          layers={layers}
          zoom={zoomConfig}
          tooltip={tooltipConfig}
          transitionDuration={transitionDuration}
          onRender={onRender}
          noDataOverlay={
            filteredData.length === 0 && processedOverlayData.length === 0 ? (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ zIndex: 100 }}
              >
                {emptyState}
              </div>
            ) : undefined
          }
          legendElement={
            <ChartLegend
              variant="sidebar"
              onItemHover={handleLegendHover}
              onItemHoverEnd={handleLegendHoverEnd}
              onItemRemove={showAllHardwareTypes ? undefined : handleRemoveHwType}
              legendItems={[
                // Overlay legend: one entry per loaded unofficial run that actually
                // contributes points to this chart. Colored from the shared palette
                // so the legend swatch matches the stroke color used in the chart.
                ...(overlayData && unofficialRunInfos.length > 0
                  ? unofficialRunInfos
                      .map((info, idx) => {
                        const hasPoints = overlayData.data.some(
                          (d) =>
                            overlayRunIndex(d.run_url ?? null, runIndexByUrl) === idx &&
                            selectedPrecisions.includes(d.precision),
                        );
                        if (!hasPoints) return null;
                        const branch = info.branch || `run ${info.id}`;
                        return {
                          name: `✕ unofficial-run-${info.id}`,
                          label: `✕ ${branch}`,
                          color: overlayRunColor(idx),
                          title: legendT.unofficialTitle(branch),
                          isHighlighted: true,
                          hw: `overlay-run-${info.id}`,
                          isActive: true,
                          onClick: () => {},
                          onShowPoints: () => {
                            setPointsTableTarget({
                              kind: 'overlay',
                              runIndex: idx,
                              runId: info.id,
                              branch,
                            });
                            track('inference_legend_points_table_opened', {
                              hw: `overlay-run-${info.id}`,
                              framework: 'overlay',
                            });
                          },
                          tooltip: (
                            <div className="font-normal text-xs">
                              <div className="text-red-500 font-semibold">
                                {legendT.unofficialRun}
                              </div>
                              <div>
                                {legendT.branch}: {branch}
                              </div>
                              {info.url && (
                                <a
                                  href={info.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  {legendT.viewWorkflow}
                                </a>
                              )}
                            </div>
                          ),
                        };
                      })
                      .filter((x): x is NonNullable<typeof x> => x !== null)
                  : []),
                ...Object.entries(hardwareConfig)
                  .filter(([key]) =>
                    showAllHardwareTypes
                      ? effectiveActiveHwTypes.has(key)
                      : hwTypesWithData.has(key),
                  )
                  .toSorted(
                    ([a], [b]) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
                  )
                  .map(([key, hwConfig]: [string, any]) => ({
                    name: hwConfig.name,
                    label: getDisplayLabel(hwConfig),
                    color: resolveColor(key),
                    title: hwConfig.gpu,
                    isHighlighted: legendChangelogs.get(key)?.runId === selectedRunId,
                    hw: key,
                    isActive: showAllHardwareTypes ? true : effectiveOfficialHwTypes.has(key),
                    onClick: showAllHardwareTypes
                      ? () => {}
                      : () => {
                          handleToggleHwType(key);
                          track('latency_hw_type_toggled', { hw: key });
                        },
                    onShowPoints: () => {
                      setPointsTableTarget({ kind: 'official', hwKey: key });
                      track('inference_legend_points_table_opened', {
                        hw: key,
                        framework: hwConfig.framework ?? '',
                      });
                    },
                    tooltip: legendChangelogs.has(key)
                      ? formatChangelogDescription(
                          legendChangelogs.get(key)!.entries.map((entry) => entry.description),
                        )
                      : null,
                  })),
              ]}
              disableActiveSort={false}
              isLegendExpanded={isLegendExpanded}
              onExpandedChange={(expanded) => {
                setIsLegendExpanded(expanded);
                track('latency_legend_expanded', { expanded });
              }}
              switches={[
                ...(selectedYAxisMetric === 'y_inputTputPerGpu'
                  ? []
                  : [
                      {
                        id: 'scatter-log-scale',
                        label: legendT.logScale,
                        advanced: true,
                        checked: logScale,
                        onCheckedChange: (checked: boolean) => {
                          setLogScale(checked);
                          track('latency_log_scale_toggled', { enabled: checked });
                        },
                      },
                    ]),
                {
                  id: 'scatter-hide-non-optimal',
                  label: legendT.optimalOnly,
                  checked: hideNonOptimal,
                  onCheckedChange: (checked: boolean) => {
                    setHideNonOptimal(checked);
                    track('latency_hide_non_optimal_toggled', { enabled: checked });
                  },
                  // Every agentic axis shares the normalized north-star set.
                  ...(selectedSequence === Sequence.AgenticTraces
                    ? {
                        infoTooltip: legendT.optimalInfo,
                      }
                    : {}),
                },
                {
                  id: 'scatter-point-labels',
                  label: legendT.labels,
                  advanced: true,
                  checked: showPointLabels,
                  onCheckedChange: (checked: boolean) => {
                    setShowPointLabels(checked);
                    track('latency_point_labels_toggled', { enabled: checked });
                  },
                },
                {
                  id: 'scatter-high-contrast',
                  label: legendT.highContrast,
                  advanced: true,
                  checked: highContrast,
                  onCheckedChange: (checked: boolean) => {
                    setHighContrast(checked);
                    track('latency_high_contrast_toggled', { enabled: checked });
                  },
                },
                {
                  id: 'scatter-parallelism-labels',
                  label: legendT.parallelismLabels,
                  advanced: true,
                  checked: useAdvancedLabels,
                  onCheckedChange: (checked: boolean) => {
                    setUseAdvancedLabels(checked);
                    track('latency_advanced_labels_toggled', { enabled: checked });
                    // Parallelism labels are point labels; turning them on is
                    // pointless if labels are hidden, so auto-enable Labels.
                    if (checked && !showPointLabels) setShowPointLabels(true);
                    if (checked && !showGradientLabels) {
                      window.dispatchEvent(
                        new CustomEvent(GRADIENT_NUDGE_EVENT, {
                          detail: {
                            enableGradient: () => {
                              setShowGradientLabels(true);
                              setUseAdvancedLabels(false);
                              track('latency_gradient_labels_toggled', {
                                enabled: true,
                                source: 'nudge',
                              });
                            },
                          },
                        }),
                      );
                    }
                  },
                },
                {
                  id: 'scatter-gradient-labels',
                  label: legendT.gradientLabels,
                  checked: showGradientLabels,
                  onCheckedChange: (checked: boolean) => {
                    setShowGradientLabels(checked);
                    track('latency_gradient_labels_toggled', { enabled: checked });
                  },
                },
                {
                  id: 'scatter-line-labels',
                  label: legendT.lineLabels,
                  advanced: true,
                  checked: showLineLabels,
                  onCheckedChange: (checked: boolean) => {
                    setShowLineLabels(checked);
                    track('latency_line_labels_toggled', { enabled: checked });
                  },
                },
                {
                  id: 'scatter-perf-ruler',
                  label: legendT.perfRuler,
                  advanced: true,
                  checked: perfRulerMode,
                  infoTooltip: legendT.perfRulerInfo,
                  onCheckedChange: (checked: boolean) => {
                    setPerfRulerMode(checked);
                    // Toggle-off clears ALL rulers in the same state batch —
                    // the pre-paint decoration effect then removes the rulers
                    // and the curve hit strokes before the next frame (no
                    // lingering lines after toggle-off).
                    if (!checked) setPerfRulerState(clearPerfRulers);
                    track('latency_perf_ruler_toggled', { enabled: checked });
                  },
                },
                {
                  id: 'scatter-concurrency-labels',
                  label: legendT.concurrencyLabels,
                  advanced: true,
                  checked: showConcurrencyLabels,
                  onCheckedChange: (checked: boolean) => {
                    setShowConcurrencyLabels(checked);
                    track('latency_concurrency_labels_toggled', { enabled: checked });
                    // Concurrency is a point-label annotation; turning it on is
                    // pointless if labels are hidden, so auto-enable Labels.
                    if (checked && !showPointLabels) setShowPointLabels(true);
                  },
                },
              ]}
              onAdvancedExpandedChange={(expanded) => {
                track('latency_advanced_controls_toggled', { expanded });
              }}
              actions={[
                ...(effectiveOfficialHwTypes.size < hwTypesWithData.size ||
                activeOverlayHwTypes.size < scopedOverlayHwTypes.size ||
                quickFilterCount > 0
                  ? [
                      {
                        id: 'scatter-reset-filter',
                        label: legendT.resetFilter,
                        onClick: () => {
                          resetUnifiedSelection();
                          clearQuickFilters();
                          track('latency_legend_filter_reset');
                        },
                      },
                    ]
                  : []),
                ...(perfRulerState.rulers.length > 0
                  ? [
                      {
                        id: 'scatter-clear-perf-rulers',
                        label: legendT.clearPerfRulers(perfRulerState.rulers.length),
                        onClick: () => {
                          track('latency_perf_ruler_cleared', {
                            count: perfRulerState.rulers.length,
                          });
                          setPerfRulerState(clearPerfRulers);
                        },
                      },
                    ]
                  : []),
                {
                  id: 'scatter-quick-filters',
                  label: legendT.quickFilters(quickFilterCount),
                  onClick: () => {
                    setQuickFiltersOpen(true);
                    track('inference_quick_filters_dialog_opened', { source: 'scatter_legend' });
                  },
                },
              ]}
              hideAtomFootnote
              readOnly={minimalChrome}
              enableTooltips={true}
            />
          }
        />
        {isMeasuredEnergyAxis && (
          <MeasuredPowerSummary
            total={powerTierCounts.total}
            visible={powerTierCounts.visible}
            bestPerSku={bestPerSku}
            optimalOnly={hideNonOptimal}
          />
        )}
        <QuickFiltersDialog
          open={quickFiltersOpen}
          onOpenChange={setQuickFiltersOpen}
          bestPerSku={{ checked: bestPerSku, onCheckedChange: handleBestPerSkuChange }}
        />
        {pointsTable && (
          <LegendPointsDialog
            open
            onOpenChange={(open) => {
              if (!open) setPointsTableTarget(null);
            }}
            title={pointsTable.title}
            subtitle={`${modelLabel} · ${getSequenceLabel(selectedSequence)}`}
            accentColor={pointsTable.color}
            rows={pointsTable.rows}
            isOverlay={pointsTable.isOverlay}
            onRowClick={(row) =>
              track('inference_legend_points_table_row_clicked', {
                hw: pointsTable.hw,
                conc: row.conc,
                href: row.href ?? '',
              })
            }
          />
        )}
        {fixedLogPointId === null ? null : (
          <FixedSequenceLogDialog
            pointId={fixedLogPointId}
            onOpenChange={(open) => {
              if (!open) setFixedLogPointId(null);
            }}
          />
        )}
      </>
    );
  },
);

ScatterGraph.displayName = 'ScatterGraph';

export default ScatterGraph;

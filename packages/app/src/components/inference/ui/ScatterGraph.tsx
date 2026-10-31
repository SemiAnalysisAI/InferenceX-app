'use client';

import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import { getMeasuredMetricConfig } from '@/components/inference/measured-metric-config';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { useEphemeralUrlState } from '@/hooks/useUrlState';
import { useIsCoarsePointer } from '@/hooks/useMediaQuery';
import { rememberChartStateInUrl } from '@/lib/routing/url-state';
import * as d3 from 'd3';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { GRADIENT_NUDGE_EVENT } from '@/lib/nudges/registry';
import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { usePerfRulerStore } from '@/components/inference/perf-ruler-store';
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
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { OFFICIAL_PREVIEW_SERIES } from '@/components/ui/official-preview-notice';
import {
  getHardwareConfig,
  getModelSortIndex,
  hardwareKeyMatchesAnyBase,
} from '@/lib/catalog/constants';
import {
  getChartWatermark,
  getPrecisionLabel,
  getSequenceLabel,
  type Precision,
  Sequence,
} from '@/lib/catalog/data-mappings';
import { matchKnownConfigIssues, pointMatchesIssue } from '@/lib/benchmarks/known-issues';
import { useLocale } from '@/lib/i18n/use-locale';
import { getLineLabelVendorIcon } from '@/lib/catalog/vendor-logos';
import { formatNumber, getDisplayLabel, updateRepoUrl } from '@/lib/shared/utils';
import {
  getInferenceHardwareConfig,
  getInferenceRunLabel,
  getOverlayLineLabel,
  overlayRunTag,
} from '@/lib/benchmarks/inference-labels';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  LayerConfig,
  RenderContext,
  ZoomContext,
} from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { raiseInOrder, setAttrIfChanged } from '@/lib/d3-chart/chart-update';
import {
  computeTooltipPosition,
  syncPointLabel,
  syncPointShape,
} from '@/lib/d3-chart/layers/scatter-points';
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
  type PerfRulerMeasurement,
  type PerfRulerRenderEntry,
  type PerfRulerState,
} from '@/lib/d3-chart/layers/perf-ruler';
import {
  attachOverlayXMarkerHandlers,
  overlayMarkerPosition,
  xMarkerPath,
} from '@/lib/d3-chart/overlay-x-marker';
import { useStableValue } from '@/hooks/useStableValue';
import { perfRulerAxisMetricKey, usePerfRulerAxisReset } from '@/hooks/usePerfRulerAxisReset';
import {
  overlayRooflineDasharray,
  overlayRunColor,
  overlayRunIndex,
} from '@/lib/charts/overlay-run-style';
import { nearestScrubCandidate, type ScrubCandidate } from '@/lib/charts/powerx-scrub';
import {
  HIT_AREA_RADIUS,
  formatLargeNumber,
  logTickFormat,
  applyHoverState,
  applyNormalState,
  getShapeKeyForPrecision,
} from '@/lib/charts/chart-rendering';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  isFrontierEligible,
  paretoMaximizesX,
  type ParetoDirection,
} from '@/lib/charts/chart-utils';
import { frontierHardwareKeys } from '@/components/inference/utils/pareto-series';
import {
  globalParetoFrontier,
  paretoHighlightArea,
  paretoHighlightGeometry,
} from '@/components/inference/utils/global-pareto';
import {
  chartFrontier,
  upperPowerEnvelope,
  isPowerCurveMetric,
  isPowerGaugeSeries,
} from '@/components/inference/utils/powerCurves';
import type {
  ChartDefinition,
  ClippedInferenceData,
  InferenceData,
  ScatterGraphProps,
  PowerVariant,
} from '@/components/inference/types';
import {
  generateOverlayTooltipContent,
  generateTooltipContent,
} from '@/components/inference/utils/tooltipUtils';
import { usePowerTraceAction } from '@/components/inference/hooks/usePowerTraceAction';
import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';
import { describeEngineComparisonConflict } from '@/components/inference/ui/engine-comparison-conflict-toast';
import { ScatterEmptyState } from '@/components/inference/ui/ScatterEmptyState';
import { ALL_IN_MEASURED_EMPTY, type PowerBasisLabelStyle } from '@/lib/power/power-basis';
import {
  scatterPointConfigId,
  scatterPointJoinId,
  parseScatterSeriesKey,
  scatterSeriesKey,
} from '@/components/inference/utils/point-identity';
import {
  flatSeriesValue,
  inferPowerCompare,
  lineLabelHardwareKey,
  lineLabelSeriesId,
  metricPlotsWatts,
  powerCompareBase,
  powerLineLabelSuffix,
  powerVariantDash,
  powerVariantId,
  powerVariantLabel,
  powerVariantsInData,
} from '@/components/inference/utils/power-compare';
import FrontierPointsPanel from '@/components/inference/ui/FrontierPointsPanel';
import LegendPointsDialog from '@/components/inference/ui/LegendPointsDialog';
import { renderOffloadHalo } from '@/components/inference/utils/offload-halo';
import {
  isAllInMeasuredConfigKey,
  isMeasuredEnergyConfigKey,
  isRoleLocalMeasuredEnergyConfigKey,
  metricAxisCeiling,
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
import { powerBreakdownInteractivity } from '@/components/inference/utils/power-breakdown';
import {
  usePowerXSurface,
  useSetPowerXActivePoint,
  useSetPowerXCompareTarget,
  type PowerXActivePointUpdate,
} from '@/components/inference/ui/powerx-surface';
import { POWER_PERCENT_TDP_METRIC } from '@/components/inference/powerx/powerx-views';
import {
  buildFrontierContinuations,
  fitContinuationLabelBaseline,
} from '@/components/inference/utils/overflowContinuations';

const PowerTelemetryDialog = dynamic(
  () =>
    import('@/components/inference/power-telemetry-dialog').then(
      (module) => module.PowerTelemetryDialog,
    ),
  { ssr: false },
);

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

const optimalPointKey = (d: InferenceData): string =>
  `${d.hwKey}_${d.precision}_${d.date}-${d.x}-${d.y}`;

const EMPTY_OVERLAY_DATA: InferenceData[] = [];
const EMPTY_CLIPPED_DATA: ClippedInferenceData[] = [];

const POWER_VARIANT_LEGEND_PREFIX = 'power-variant:';
const POWER_VARIANT_POINT_OPACITY = 0.6;
const pointOpacityForVariant = (d: InferenceData): number =>
  d.powerVariant ? POWER_VARIANT_POINT_OPACITY : 1;
const powerVariantDashById = (variantId: string | null | undefined): string =>
  variantId ? (VARIANT_DASH_BY_ID.get(variantId) ?? '') : '';
const VARIANT_DASH_BY_ID = new Map<string, string>(
  (
    [
      ['basis', 'gpu-measured'],
      ['basis', 'gpu-provisioned'],
      ['basis', 'utility-provisioned'],
      ['basis', 'it-modeled'],
      ['basis', 'utility-modeled'],
      ['role', 'all'],
      ['role', 'prefill'],
      ['role', 'decode'],
    ] as const
  ).map(([kind, id]) => [id, powerVariantDash({ kind, id } as PowerVariant)]),
);

const LINE_LABEL_RAISE = ['.line-label'] as const;
const POINT_DECORATION_RAISE = ['.offload-halo'] as const;

function syncGradientStop(this: SVGStopElement, stop: { offset: number; color: string }): void {
  setAttrIfChanged(this, 'offset', `${(stop.offset * 100).toFixed(2)}%`);
  setAttrIfChanged(this, 'stop-color', stop.color);
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

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

const parseHwKeyToLabel = (hwKey: string, model?: string): { name: string; label: string } => {
  const config = getHardwareConfig(hwKey, model);
  return { name: config.label, label: getDisplayLabel(config) };
};

const lineLabelText = (
  hwKey: string,
  precision: string,
  includePrecision: boolean,
  model?: string,
  points: InferenceData[] = [],
): string => {
  const config = getInferenceHardwareConfig(hwKey, model, points);
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
    paretoFrontier: 'Pareto Frontier',
    paretoFrontierInfo:
      'Dotted line connecting the best visible results, with green shading beyond it. Switch off and on again for a sunny butterfly castle background; repeat to return to green.',
    optimalInfo: 'Optimal points form the Pareto frontier for the selected axes.',
    powerBoundaryInfo:
      'Show only points on the upper measured power boundary. Turn off to show all measurements; the boundary stays the same. This is a power-load boundary, not an energy-efficiency frontier.',
    labels: '# of GPUs Label',
    highContrast: 'High Contrast',
    parallelismLabels: 'Parallelism Labels',
    concurrencyLabels: '# Concurrent Sessions',
    gradientLabels: 'Gradient Labels',
    lineLabels: 'Line Labels',
    offloadingLabel: 'Offloading Label',
    perfRuler: 'Perf Ruler',
    perfRulerInfo:
      'Click two curves to place a vertical ruler, then drag it to measure the ratio of their Y-axis values at any x value. Repeat to add more rulers (up to 8); hover a ruler and click × to delete it. Turning the toggle off clears all rulers.',
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
    noMeasuredDataHint:
      'No measured GPU power is reported for this selection. Choose other chip configs, or a different model, scenario, precision or date.',
    unofficialTitle: (branch: string) => `UNOFFICIAL: ${branch}`,
    unofficialRun: 'UNOFFICIAL RUN',
    branch: 'Branch',
    viewWorkflow: 'View workflow run',
  },
  zh: {
    logScale: '对数缩放',
    optimalOnly: '仅最优',
    paretoFrontier: 'Pareto 前沿',
    paretoFrontierInfo:
      '用点线连接所有可见系列的最优边界点，并在更优一侧填充绿色。关闭后再次开启，切换为阳光、蝴蝶和城堡背景；再重复一次恢复绿色。',
    optimalInfo: '最优点构成当前所选坐标轴的 Pareto 前沿。',
    powerBoundaryInfo:
      '仅显示实测功率上边界上的点。关闭后显示全部测量点，边界曲线保持不变。这是功率负载边界，不是能效前沿。',
    labels: 'GPU 数量标签',
    highContrast: '高对比度',
    parallelismLabels: '并行配置标签',
    concurrencyLabels: '并发会话数',
    gradientLabels: '渐变标签',
    lineLabels: '曲线标签',
    offloadingLabel: 'offload 标签',
    perfRuler: '性能标尺',
    perfRulerInfo:
      '先点击两条曲线放置垂直标尺，再拖动标尺，比较任意横坐标下两条曲线的纵轴数值之比。重复操作可添加多把标尺（最多 8 把）；悬停标尺并点击 × 可删除该标尺。关闭开关将清除所有标尺。',
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
    noMeasuredDataHint:
      '当前选择没有实测 GPU 功耗数据。请选择其他芯片配置，或更换模型、场景、精度或日期。',
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
    plotHeight,
  }: ScatterGraphProps) => {
    const {
      hardwareConfig: contextHardwareConfig,
      hwTypesWithData,
      availableRuns,
    } = useInferenceData();
    const {
      activeHwTypes,
      bestPerSku,
      blockedHwToggles,
      selectedPrecisions,
      selectedRunId,
      selectedSequence,
      quickFilters,
      lockedFrameworks,
      minimalChrome,
    } = useInferenceFilters();
    const {
      selectedYAxisMetric,
      hideNonOptimal: preferOptimalOnly,
      showPointLabels,
      highContrast,
      logScale,
      scaleType,
      isLegendExpanded,
      useAdvancedLabels,
      showConcurrencyLabels,
      showGradientLabels,
      showLineLabels,
      showOffloadingLabel,
      showParetoFrontier,
      paretoFrontierPlayful,
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
      setShowOffloadingLabel,
      setShowParetoFrontier,
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
      setQuickFilterPower,
      setQuickFilterTopologies,
    } = useInferenceActions();
    const paretoDirection = chartDefinition[`${selectedYAxisMetric}_roofline`] as
      | ParetoDirection
      | undefined;
    const hideNonOptimal = preferOptimalOnly && Boolean(paretoDirection);
    const showPowerEnvelope = isPowerCurveMetric(selectedYAxisMetric);
    const groupDisplayedPoints = useCallback(
      (points: InferenceData[]) => {
        const groups = groupPointsByDate(points);
        if (showPowerEnvelope && paretoDirection) {
          for (const [date, samples] of groups) {
            groups.set(
              date,
              upperPowerEnvelope(
                samples,
                paretoDirection,
                isPowerGaugeSeries(selectedYAxisMetric, samples[0]),
              ),
            );
          }
        }
        return groups;
      },
      [showPowerEnvelope, paretoDirection, selectedYAxisMetric],
    );
    const locale = useLocale();
    // PowerX names the measured boundaries the way its Count control does.
    const powerXSurface = usePowerXSurface();
    const powerLabelStyle: PowerBasisLabelStyle = powerXSurface ? 'count' : 'basis';
    // PowerX on a touch-primary device: the pinned point sheet says Tap, not Click.
    const touchPrimary = useIsCoarsePointer();
    const touchCopy = powerXSurface && touchPrimary;
    // PowerX, Power draw as % of TDP: shade each chip's headroom from its P90 draw to 100 %.
    const headroomShading = powerXSurface && selectedYAxisMetric === POWER_PERCENT_TDP_METRIC;
    const featureGateUnlocked = useFeatureGate();
    const showPowerTelemetry =
      featureGateUnlocked || getMeasuredMetricConfig(selectedYAxisMetric) !== undefined;
    const legendT = SCATTER_STRINGS[locale];
    const [hiddenPowerVariants, setHiddenPowerVariants] = useState<ReadonlySet<string>>(
      () => new Set(),
    );
    const ephemeralUrlState = useEphemeralUrlState();
    const costLimit = chartDefinition.y_cost_limit ?? 0;
    const latencyLimit = chartDefinition.y_latency_limit ?? 0;

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
              const selection = bestSeriesPerSku(data, direction, selectedPrecisions);
              for (const key of bestSeriesPerSku(overlayData.data, direction, selectedPrecisions)) {
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
        selectedPrecisions,
        data,
        commitUnifiedSelection,
        resetUnifiedSelection,
      ],
    );

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
    const stableHcKeys = useMemo(() => [...hwTypesWithData], [hwTypesWithData]);
    const { resolveColor, getCssColor } = useThemeColors({
      highContrast,
      identifiers: activeHwKeys,
      activeKeys: activeOfficialKeys,
      hcKeys: stableHcKeys,
    });

    const legendChangelogs = useMemo(
      () =>
        legendChangelogsByHardware(
          data,
          availableRuns,
          selectedSequence === Sequence.AgenticTraces ? 'agentic_traces' : 'single_turn',
        ),
      [data, availableRuns, selectedSequence],
    );

    const groupedData = useMemo(
      () =>
        data.reduce(
          (acc, point) => {
            const key = scatterSeriesKey(point);
            if (!acc[key]) acc[key] = [];
            acc[key].push(point);
            return acc;
          },
          {} as Record<string, InferenceData[]>,
        ),
      [data],
    );

    const rooflines = useMemo(() => {
      const result: Record<string, InferenceData[]> = {};
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as ParetoDirection | undefined;
      for (const hwKey of Object.keys(groupedData)) {
        const combined: InferenceData[] = [];
        for (const datePoints of groupPointsByDate(groupedData[hwKey]).values()) {
          const front = chartFrontier(datePoints, dir);
          if (front.length === 0) continue;
          combined.push(...front);
        }
        combined.sort((a, b) => a.x - b.x);
        result[hwKey] = combined;
      }
      return result;
    }, [groupedData, selectedYAxisMetric, chartDefinition]);

    const displayedRooflines = showPowerEnvelope ? groupedData : rooflines;

    const powerEnvelopePointKeys = useMemo(() => {
      const keys = new Set<string>();
      if (showPowerEnvelope) {
        for (const points of Object.values(groupedData)) {
          for (const segment of groupDisplayedPoints(points).values()) {
            for (const point of segment) keys.add(optimalPointKey(point));
          }
        }
      }
      return keys;
    }, [showPowerEnvelope, groupedData, groupDisplayedPoints]);

    const optimalPointKeys = useMemo(() => {
      if (showPowerEnvelope) return powerEnvelopePointKeys;
      const keys = new Set<string>();
      Object.values(rooflines).forEach((pts) => pts.forEach((p) => keys.add(optimalPointKey(p))));
      return keys;
    }, [rooflines, showPowerEnvelope, powerEnvelopePointKeys]);

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
      if (!overlayData?.data) return EMPTY_OVERLAY_DATA;
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
      if (showPowerEnvelope) return [];
      interface Bucket {
        hw: string;
        precision: string;
        visible: InferenceData[];
        clipped: ClippedInferenceData[];
      }
      const buckets = new Map<string, Bucket>();
      const getBucket = (point: InferenceData) => {
        const key = `${scatterSeriesKey(point)}|${point.date}`;
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
    }, [data, clippedData, selectedYAxisMetric, chartDefinition, showPowerEnvelope]);

    const overlayOverflowContinuations = useMemo((): OverflowContinuationEntry[] => {
      if (showPowerEnvelope) return [];
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
        const key = `${scatterSeriesKey(point)}|${point.date}|run${runIndex}`;
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
      showPowerEnvelope,
    ]);

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

    const overlayGroups = useMemo(() => {
      interface Entry {
        hwKey: string;
        runIndex: number;
        variant: string | null;
        points: InferenceData[];
      }
      if (processedOverlayData.length === 0) return {} as Record<string, Entry>;
      const grouped = processedOverlayData.reduce(
        (acc, p) => {
          const runIndex = overlayRunIndex(p.run_url ?? null, runIndexByUrl);
          const key = `${scatterSeriesKey(p)}_run${runIndex}`;
          if (!acc[key]) {
            acc[key] = {
              hwKey: String(p.hwKey),
              runIndex,
              variant: p.powerVariant?.id ?? null,
              points: [],
            };
          }
          acc[key].points.push(p);
          return acc;
        },
        {} as Record<string, Entry>,
      );
      return grouped;
    }, [processedOverlayData, runIndexByUrl]);

    const overlayRooflines = useMemo(
      () =>
        Object.fromEntries(
          Object.entries(overlayGroups).map(([key, group]) => [
            key,
            {
              ...group,
              points: chartFrontier(group.points, paretoDirection).toSorted((a, b) => a.x - b.x),
            },
          ]),
        ),
      [overlayGroups, paretoDirection],
    );
    const displayedOverlayRooflines = useMemo(() => {
      if (!showPowerEnvelope) return overlayRooflines;
      return Object.fromEntries(
        Object.entries(overlayGroups).flatMap(([key, group]) =>
          [...groupDisplayedPoints(group.points)].map(([segment, points]) => [
            `${key}__${encodeURIComponent(segment)}`,
            { ...group, points },
          ]),
        ),
      );
    }, [showPowerEnvelope, overlayRooflines, overlayGroups, groupDisplayedPoints]);

    const overlayOptimalPoints = useMemo(() => {
      const set = new Set<InferenceData>();
      for (const group of Object.values(
        showPowerEnvelope ? displayedOverlayRooflines : overlayRooflines,
      )) {
        for (const p of group.points) set.add(p);
      }
      return set;
    }, [overlayRooflines, showPowerEnvelope, displayedOverlayRooflines]);

    const overlayGradientLabelPoints = useMemo(() => {
      const labels = new Set<InferenceData>();
      for (const { points } of Object.values(displayedOverlayRooflines)) {
        if (points.length < 2) continue;
        let start = 0;
        for (let end = 1; end <= points.length; end++) {
          if (
            end === points.length ||
            getParetoLabel(points[end]) !== getParetoLabel(points[start])
          ) {
            labels.add(points[Math.floor((start + end) / 2)]);
            start = end;
          }
        }
      }
      return labels;
    }, [displayedOverlayRooflines]);

    const isOverlayPointVisible = useCallback(
      (d: InferenceData) =>
        !hiddenPowerVariants.has(powerVariantId(d.powerVariant)) &&
        (!hideNonOptimal || overlayOptimalPoints.has(d)),
      [hiddenPowerVariants, hideNonOptimal, overlayOptimalPoints],
    );

    const pointsData = useMemo(() => Object.values(groupedData).flat(), [groupedData]);
    const agenticIds = useMemo(() => {
      const ids: number[] = [];
      for (const p of pointsData) {
        if (p.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(p.id)) ids.push(p.id);
      }
      return ids;
    }, [pointsData]);
    const { data: traceAvailability, isPending: isTraceAvailabilityPending } =
      useTraceAvailability(agenticIds);

    const persistedPointIds = useMemo(
      () => pointsData.flatMap((point) => (isPersistedBenchmarkId(point.id) ? [point.id] : [])),
      [pointsData],
    );
    const { data: persistedLogAvailability } = useLogAvailability(persistedPointIds);
    const [fixedLogPointId, setFixedLogPointId] = useState<number | null>(null);
    const [powerTelemetryPoint, setPowerTelemetryPoint] = useState<InferenceData | null>(null);

    const attachPowerTraceAction = usePowerTraceAction(chartRef);

    const [pointsTableTarget, setPointsTableTarget] = useState<LegendPointsTarget | null>(null);
    const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
    useDialogCloseTracking(quickFiltersOpen, 'inference_quick_filters_dialog_closed');
    useDialogCloseTracking(pointsTableTarget !== null, 'inference_legend_points_table_closed');
    useDialogCloseTracking(fixedLogPointId !== null, 'latency_logs_closed');
    useDialogCloseTracking(powerTelemetryPoint !== null, 'inference_power_telemetry_closed');
    const quickFilterCount =
      quickFilters.vendors.length +
      (lockedFrameworks ? 0 : quickFilters.frameworks.length) +
      quickFilters.deployment.length +
      quickFilters.power.length +
      (quickFilters.topologies?.length ?? 0) +
      (selectedSequence === Sequence.AgenticTraces ? 0 : quickFilters.spec.length);
    const clearQuickFilters = useCallback(() => {
      setQuickFilterVendors([]);
      setQuickFilterFrameworks([]);
      setQuickFilterDeployment([]);
      if (selectedSequence !== Sequence.AgenticTraces) setQuickFilterSpec([]);
      setQuickFilterPower([]);
      setQuickFilterTopologies([]);
    }, [
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
      setQuickFilterPower,
      setQuickFilterTopologies,
      selectedSequence,
    ]);

    const pointsTable = useMemo(() => {
      if (!pointsTableTarget) return null;
      if (pointsTableTarget.kind === 'official') {
        const { hwKey } = pointsTableTarget;
        const hwConfig = hardwareConfig[hwKey];
        const pts = pointsData.filter(
          (p) =>
            p.hwKey === hwKey &&
            !p.powerVariant &&
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
      const pts = processedOverlayData.filter(
        (p) =>
          overlayRunIndex(p.run_url ?? null, runIndexByUrl) === runIndex &&
          !p.powerVariant &&
          activeOverlayHwTypes.has(p.hwKey as string) &&
          (!hideNonOptimal || overlayOptimalPoints.has(p)),
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
      overlayOptimalPoints,
      resolveColor,
      processedOverlayData,
      runIndexByUrl,
      activeOverlayHwTypes,
      locale,
    ]);

    const allPointLabelsByKey = useMemo(() => {
      const globalLabelColorMap = new Map<string, string>();
      let globalColorIdx = 0;
      const result: Record<string, ParetoPointLabel[]> = {};
      Object.entries(displayedRooflines).forEach(([key, points]) => {
        let rooflinePoints = points;
        if (showPowerEnvelope) {
          const byDate = groupDisplayedPoints(points);
          if (byDate.size !== 1) return;
          rooflinePoints = byDate.values().next().value!;
        }
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
    }, [displayedRooflines, showPowerEnvelope, groupDisplayedPoints]);

    const gradientColorByPoint = useMemo(
      () => buildGradientColorMap(allPointLabelsByKey),
      [allPointLabelsByKey],
    );

    const visiblePoints = useMemo(() => {
      let pts = filteredData;
      if (hideNonOptimal && !showPowerEnvelope) {
        pts = pts.filter((d) => optimalPointKeys.has(optimalPointKey(d)));
      }
      const overlayPts = processedOverlayData.filter(
        (point) => !hideNonOptimal || showPowerEnvelope || overlayOptimalPoints.has(point),
      );
      return overlayPts.length > 0 ? [...pts, ...overlayPts] : pts;
    }, [
      filteredData,
      processedOverlayData,
      hideNonOptimal,
      optimalPointKeys,
      overlayOptimalPoints,
      showPowerEnvelope,
    ]);

    const isInputTputMetric = selectedYAxisMetric === 'y_inputTputPerGpu';

    const xScaleConfigRaw = useMemo(() => {
      const ext =
        xExtentOverride ??
        (visiblePoints.length > 0
          ? (d3.extent(visiblePoints, (d) => d.x) as [number, number])
          : ([0, 100] as [number, number]));

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

      // Bounded metrics (% TDP) read against their full 0-to-limit range, with headroom
      // so the dashed limit line stays visible.
      const ceiling = metricAxisCeiling(selectedYAxisMetric);
      if (ceiling !== undefined && !useLog) yMin = 0;
      // % TDP stops at 100%; values above the rating keep the plain 5% headroom.
      // The PowerX headroom band runs up to the rating, so the axis reaches it then.
      const yMax =
        ceiling !== undefined && ext[1] <= ceiling
          ? headroomShading
            ? ceiling
            : Math.min(ext[1] * 1.05, ceiling)
          : ext[1] * 1.05;

      return {
        type: (useLog ? 'log' : 'linear') as 'log' | 'linear',
        domain: [yMin, yMax] as [number, number],
        nice: niceAxes,
      };
    }, [
      visiblePoints,
      isInputTputMetric,
      logScale,
      niceAxes,
      yExtentOverride,
      selectedYAxisMetric,
      headroomShading,
    ]);
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
          showPowerEnvelope ? 'power-envelopes' : 'pareto-curves',
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
        showPowerEnvelope,
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

    const isPointVisible = useCallback(
      (d: InferenceData) =>
        effectiveActiveHwTypes.has(d.hwKey as string) &&
        selectedPrecisions.includes(d.precision) &&
        !hiddenPowerVariants.has(powerVariantId(d.powerVariant)) &&
        (!hideNonOptimal || optimalPointKeys.has(optimalPointKey(d))),
      [
        effectiveActiveHwTypes,
        selectedPrecisions,
        hiddenPowerVariants,
        hideNonOptimal,
        optimalPointKeys,
      ],
    );

    const maximizeParetoX = paretoDirection !== undefined && paretoMaximizesX(paretoDirection);
    const maximizeParetoY = paretoDirection?.startsWith('upper') ?? true;
    const globalParetoPoints = useMemo(
      () =>
        !paretoDirection || !showParetoFrontier
          ? []
          : [
              ...pointsData.filter(isPointVisible),
              ...processedOverlayData.filter(
                (point) =>
                  activeOverlayHwTypes.has(String(point.hwKey)) &&
                  selectedPrecisions.includes(point.precision) &&
                  isOverlayPointVisible(point),
              ),
            ].filter(isFrontierEligible),
      [
        paretoDirection,
        showParetoFrontier,
        pointsData,
        isPointVisible,
        processedOverlayData,
        activeOverlayHwTypes,
        selectedPrecisions,
        isOverlayPointVisible,
      ],
    );
    const globalFrontier = useMemo(
      () => globalParetoFrontier(globalParetoPoints, maximizeParetoX, maximizeParetoY),
      [globalParetoPoints, maximizeParetoX, maximizeParetoY],
    );
    const frontierHwKeys = useMemo(
      () => frontierHardwareKeys(globalParetoPoints, globalFrontier),
      [globalParetoPoints, globalFrontier],
    );
    const showFrontierPoints =
      showParetoFrontier &&
      globalFrontier.length > 0 &&
      !minimalChrome &&
      getMeasuredMetricConfig(selectedYAxisMetric) !== undefined;
    const frontierHardwareLabel = useCallback(
      (point: InferenceData) => {
        const config = processedOverlayData.includes(point)
          ? overlayData?.hardwareConfig[point.hwKey]
          : hardwareConfig[point.hwKey];
        return config ? getDisplayLabel(config) : point.hwKey;
      },
      [processedOverlayData, overlayData, hardwareConfig],
    );
    const frontierHardwareColor = useCallback(
      (point: InferenceData) => getCssColor(resolveColor(point.hwKey)),
      [getCssColor, resolveColor],
    );
    const applyParetoFadeRef = useRef<(group: RenderContext['layout']['zoomGroup']) => void>(
      () => {},
    );
    applyParetoFadeRef.current = (zoomGroup) => {
      zoomGroup
        .selectAll<SVGElement, { hwKey?: string; points?: InferenceData[] }>(
          '.dot-group, .roofline-path, .unofficial-overlay-pt, .overlay-roofline-path, .overflow-continuation, .parallelism-label, .line-label',
        )
        .style('filter', function (d) {
          const hw = this.dataset.hwKey ?? d?.hwKey ?? d?.points?.[0]?.hwKey;
          return showParetoFrontier && frontierHwKeys.size > 0 && hw && !frontierHwKeys.has(hw)
            ? 'opacity(0.2)'
            : null;
        });
    };
    const paretoHighlightLayer = useMemo<CustomLayerConfig>(() => {
      const render: NonNullable<CustomLayerConfig['render']> = (zoomGroup, ctx) => {
        applyParetoFadeRef.current(zoomGroup);
        const xScale = (ctx.renderedXScale ?? ctx.xScale) as ContinuousScale;
        const yScale = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
        const bestX = maximizeParetoX === xScale.range()[1] > xScale.range()[0] ? ctx.width : 0;
        const bestY = maximizeParetoY === yScale.range()[1] > yScale.range()[0] ? ctx.height : 0;
        const boundary = {
          points: globalFrontier,
          visible: showParetoFrontier,
          group: 'global-pareto-highlight',
          path: 'global-pareto-frontier',
          color: getCssColor('var(--foreground)'),
          dash: '1,6',
          playful: paretoFrontierPlayful,
          shade: '#22c55e',
          cornerX: bestX,
          cornerY: bestY,
        };
        const geometry = paretoHighlightGeometry(boundary.points, xScale, yScale);
        const area = paretoHighlightArea(geometry.points, boundary.cornerX, boundary.cornerY);
        const patternId = `${chartId}-${boundary.path}-scene`;
        const pattern = ctx.layout.defs
          .selectAll<SVGPatternElement, null>(`#${patternId}`)
          .data(boundary.visible && boundary.playful && area ? [null] : [])
          .join('pattern')
          .attr('id', patternId)
          .attr('patternUnits', 'userSpaceOnUse')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', ctx.width)
          .attr('height', ctx.height);
        pattern
          .selectAll<SVGImageElement, string>('image')
          .data(['/decorative/pareto/sunny-castle.webp'])
          .join('image')
          .attr('href', (src) => src)
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', ctx.width)
          .attr('height', ctx.height)
          .attr('preserveAspectRatio', 'xMidYMid slice');
        zoomGroup
          .selectAll<SVGPathElement, string>(`.${boundary.path}-area`)
          .data(boundary.visible && area ? [area] : [])
          .join('path')
          .attr('class', `${boundary.path}-area`)
          .attr('d', (path) => path)
          .attr('fill', boundary.playful ? `url(#${patternId})` : boundary.shade)
          .attr('fill-opacity', boundary.playful ? 0.3 : 0.14)
          .attr('data-style', boundary.playful ? 'playful' : 'plain')
          .attr('pointer-events', 'none')
          .lower();
        const highlight = zoomGroup
          .selectAll<SVGGElement, null>(`.${boundary.group}`)
          .data(boundary.visible && geometry.line ? [null] : [])
          .join('g')
          .attr('class', boundary.group)
          .attr('pointer-events', 'none');
        highlight.raise();
        highlight
          .selectAll<SVGPathElement, string>(`.${boundary.path}`)
          .data(geometry.line ? [geometry.line] : [])
          .join('path')
          .attr('class', boundary.path)
          .attr('d', (path) => path)
          .attr('fill', 'none')
          .attr('stroke', boundary.color)
          .attr('stroke-width', 2.5)
          .attr('stroke-dasharray', boundary.dash)
          .attr('stroke-linecap', 'round')
          .attr('pointer-events', 'none');
        highlight
          .selectAll<SVGCircleElement, { x: number; y: number }>('circle')
          .data(geometry.points)
          .join('circle')
          .attr('cx', (point) => point.x)
          .attr('cy', (point) => point.y)
          .attr('r', 6)
          .attr('fill', 'none')
          .attr('stroke', boundary.color)
          .attr('stroke-width', 1.5);
      };
      return {
        type: 'custom',
        key: 'global-pareto',
        displayIdentity: JSON.stringify([
          showParetoFrontier,
          paretoFrontierPlayful,
          globalFrontier.map((point) => [point.x, point.y]),
          [...frontierHwKeys].sort(),
        ]),
        render,
        onDisplayUpdate: render,
        onZoom: (group, ctx) =>
          render(group, { ...ctx, renderedXScale: ctx.newXScale, renderedYScale: ctx.newYScale }),
      };
    }, [
      globalFrontier,
      frontierHwKeys,
      showParetoFrontier,
      paretoFrontierPlayful,
      maximizeParetoX,
      maximizeParetoY,
      chartId,
      getCssColor,
    ]);

    const powerCompareMode = useMemo(() => {
      const official = inferPowerCompare(pointsData);
      return official === 'none' ? inferPowerCompare(processedOverlayData) : official;
    }, [pointsData, processedOverlayData]);
    const powerCompareBaseId = useMemo(
      () => powerVariantId(powerCompareBase(selectedYAxisMetric, powerCompareMode)),
      [selectedYAxisMetric, powerCompareMode],
    );

    const powerVariantLegendItems = useMemo(() => {
      const allPoints = [...pointsData, ...processedOverlayData];
      const variants = powerVariantsInData(allPoints, selectedYAxisMetric);
      const baseId = powerCompareBaseId;
      return variants.map((variant) => {
        const id = powerVariantId(variant);
        const legendId = `${POWER_VARIANT_LEGEND_PREFIX}${id}`;
        const isBase = id === baseId;
        return {
          name: legendId,
          hw: legendId,
          label: powerVariantLabel(variant, locale, powerLabelStyle),
          section:
            variant.kind === 'basis'
              ? locale === 'zh'
                ? '功耗边界'
                : 'Boundary'
              : locale === 'zh'
                ? 'GPU 角色'
                : 'GPU role',
          color: 'var(--foreground)',
          lineDasharray: isBase ? '1 0' : powerVariantDash(variant) || '1 0',
          isActive: !hiddenPowerVariants.has(isBase ? '' : id),
          isRemovable: false,
          onClick: () => {
            const key = isBase ? '' : id;
            setHiddenPowerVariants((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
            track('inference_power_compare_series_toggled', {
              series: id,
              enabled: hiddenPowerVariants.has(key),
            });
          },
        };
      });
    }, [
      pointsData,
      processedOverlayData,
      selectedYAxisMetric,
      powerCompareBaseId,
      locale,
      powerLabelStyle,
      hiddenPowerVariants,
    ]);

    const isRooflineVisible = useCallback(
      (el: SVGElement) => {
        const hw = el.dataset.hwKey;
        const prec = el.dataset.precision;
        if (hw === null || hw === undefined || prec === null || prec === undefined) return false;
        return (
          effectiveActiveHwTypes.has(hw) &&
          selectedPrecisions.includes(prec) &&
          !hiddenPowerVariants.has(el.dataset.powerVariant ?? '')
        );
      },
      [effectiveActiveHwTypes, selectedPrecisions, hiddenPowerVariants],
    );

    const interactionRef = useRef({
      isPointVisible,
      isOverlayPointVisible,
      effectiveActiveHwTypes,
      hiddenPowerVariants,
      selectedPrecisions,
      activeOverlayHwTypes,
      getCssColor,
      resolveColor,
      knownIssueAnnotations,
      traceAvailability,
      logAvailability: persistedLogAvailability,
      showPowerTelemetry,
    });
    interactionRef.current = {
      isPointVisible,
      isOverlayPointVisible,
      effectiveActiveHwTypes,
      hiddenPowerVariants,
      selectedPrecisions,
      activeOverlayHwTypes,
      getCssColor,
      resolveColor,
      knownIssueAnnotations,
      traceAvailability,
      logAvailability: persistedLogAvailability,
      showPowerTelemetry,
    };

    const perfRulerStore = usePerfRulerStore();
    const persistedRulers = perfRulerStore?.chartId === chartId ? perfRulerStore : undefined;
    const [perfRulerMode, setPerfRulerMode] = useState(
      () =>
        persistedRulers !== undefined &&
        (persistedRulers.pending !== null || persistedRulers.state.rulers.length > 0),
    );
    const [localPerfRulerState, setLocalPerfRulerState] =
      useState<PerfRulerState>(EMPTY_PERF_RULER_STATE);
    const perfRulerState = persistedRulers ? persistedRulers.state : localPerfRulerState;
    const setPerfRulerState = persistedRulers ? persistedRulers.setState : setLocalPerfRulerState;
    usePerfRulerAxisReset(
      perfRulerAxisMetricKey(chartDefinition.x_scale_field, selectedYAxisMetric),
      setLocalPerfRulerState,
    );
    const perfRulerModeRef = useRef(perfRulerMode);
    perfRulerModeRef.current = perfRulerMode;
    const perfRulerStateRef = useRef(perfRulerState);
    perfRulerStateRef.current = perfRulerState;
    const perfRulerLiveIsoXRef = useRef(new Map<number, number>());
    useLayoutEffect(() => {
      perfRulerLiveIsoXRef.current.clear();
    }, [perfRulerState]);

    const perfRulerDrawCtxRef = useRef<{
      zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
      xScale: ContinuousScale;
      yScale: ContinuousScale;
      width: number;
      height: number;
    } | null>(null);
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

    const persistedRulersRef = useRef(persistedRulers);
    persistedRulersRef.current = persistedRulers;
    const committedPendingRef = useRef<readonly PerfRulerMeasurement[] | null>(null);
    const commitPendingPerfRulers = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        const store = persistedRulersRef.current;
        const pending = store?.pending ?? null;
        if (!store || !pending || !perfRulerModeRef.current) return;
        if (committedPendingRef.current === pending) return;
        const curveExists = (cls: string) => !zoomGroup.select(`.${CSS.escape(cls)}`).empty();
        const resolved: PerfRulerMeasurement[] = [];
        const remaining: PerfRulerMeasurement[] = [];
        for (const ruler of pending) {
          if (!curveExists(ruler.curveA) || !curveExists(ruler.curveB)) {
            remaining.push(ruler);
            continue;
          }
          const isoX = clampPerfRulerIsoXToOverlap(ruler.curveA, ruler.curveB, ruler.isoX);
          if (isoX !== null) resolved.push({ ...ruler, isoX });
        }
        if (remaining.length === pending.length) return;
        committedPendingRef.current = pending;
        store.commitPending(resolved, remaining.length > 0 ? remaining : null);
      },
      [clampPerfRulerIsoXToOverlap],
    );

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

    const handlePerfRulerPointClick = useCallback(
      (point: InferenceData, source: 'official' | 'overlay') => {
        const ctx = perfRulerDrawCtxRef.current;
        if (!ctx) return;
        const series = scatterSeriesKey(point);
        const base =
          source === 'overlay'
            ? `overlay-roofline-${series}_run${overlayRunIndex(point.run_url ?? null, runIndexByUrl)}`
            : `roofline-${series}`;
        const candidates = [`${base}__${encodeURIComponent(point.date)}`, base];
        const curve = candidates.find(
          (cls) => !ctx.zoomGroup.select(`.${CSS.escape(cls)}`).empty(),
        );
        if (!curve) return;
        setPerfRulerState((prev) =>
          nextPerfRulerState(prev, { curve, isoX: point.x }, clampPerfRulerIsoXToOverlap),
        );
        chartRef.current?.dismissTooltip();
        chartRef.current?.hideTooltip();
      },
      [runIndexByUrl, clampPerfRulerIsoXToOverlap],
    );

    const setCompareTarget = useSetPowerXCompareTarget();
    // PowerX: the readout row under the caption follows the hovered or pinned point.
    const setActivePoint = useSetPowerXActivePoint();
    const activePointRef = useRef<((update: PowerXActivePointUpdate) => void) | null>(null);
    activePointRef.current = setActivePoint;
    // PowerX on a coarse pointer: the finger in flight on the plot (its pointer id).
    const scrubPointerRef = useRef<number | null>(null);
    const touchScrub = powerXSurface && touchPrimary;
    const compareFollowsHoverRef = useRef<((x: number) => void) | null>(null);
    compareFollowsHoverRef.current =
      setCompareTarget && powerBreakdownInteractivity(chartDefinition.x_scale_field).fromChart
        ? setCompareTarget
        : null;
    const perfRulerRef = useRef({ mode: perfRulerMode, onPointClick: handlePerfRulerPointClick });
    perfRulerRef.current = { mode: perfRulerMode, onPointClick: handlePerfRulerPointClick };

    useEffect(() => {
      if (perfRulerMode) return;
      setPerfRulerState(clearPerfRulers);
      persistedRulers?.discardPending();
    }, [perfRulerMode]);

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
            const curve = [...this.classList].find(
              (cls) => cls !== 'roofline-path' && cls !== 'overlay-roofline-path',
            );
            const d = this.getAttribute('d');
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
        commitPendingPerfRulers(zoomGroup);
        const state = perfRulerStateRef.current;
        const entries: PerfRulerRenderEntry[] = [];
        if (perfRulerModeRef.current && state.rulers.length > 0) {
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
        const dragHandles = zoomGroup.selectAll<SVGLineElement, PerfRulerRenderEntry>(
          '.perf-ruler .pr-drag',
        );
        if (!dragHandles.empty()) dragHandles.call(perfRulerDrag);
      },
      [syncPerfRulerHitPaths, commitPendingPerfRulers, perfRulerDrag],
    );
    drawPerfRulerRef.current = drawPerfRuler;

    const lastRenderCtxRef = useRef<RenderContext | null>(null);
    const pointLabelsVisible =
      (showPointLabels || useAdvancedLabels || showConcurrencyLabels) && !showGradientLabels;
    const labelDisplayRef = useRef({ pointLabelsVisible, showGradientLabels, showLineLabels });
    labelDisplayRef.current = { pointLabelsVisible, showGradientLabels, showLineLabels };
    const lastShowGpuCountRef = useRef(showPointLabels);
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

    const handleLegendHover = useCallback(
      (hwKey: string) => {
        const svg = chartRef.current?.getSvgElement?.();
        if (!svg) return;
        const root = d3.select(svg);
        const variantId = hwKey.startsWith(POWER_VARIANT_LEGEND_PREFIX)
          ? hwKey.slice(POWER_VARIANT_LEGEND_PREFIX.length)
          : null;
        const matchesPoint = (d: InferenceData) =>
          variantId === null
            ? String(d.hwKey) === hwKey
            : (powerVariantId(d.powerVariant) || powerCompareBaseId) === variantId;
        root
          .selectAll<SVGGElement, InferenceData>('.dot-group')
          .style('opacity', (d) =>
            isPointVisible(d) ? (matchesPoint(d) ? pointOpacityForVariant(d) : 0.15) : 0,
          );
        root
          .selectAll<SVGElement, unknown>('.roofline-path, .official-overflow-continuation')
          .style('opacity', function () {
            if (!isRooflineVisible(this)) return 0;
            const matches =
              variantId === null
                ? this.dataset.hwKey === hwKey
                : (this.dataset.powerVariant || powerCompareBaseId) === variantId;
            return matches ? null : '0.15';
          });
        root
          .selectAll<SVGGElement, unknown>('.parallelism-label, .line-label')
          .style('opacity', function () {
            return labelOpacityForHover((this as SVGGElement).dataset, hwKey);
          });
      },
      [isPointVisible, isRooflineVisible, powerCompareBaseId],
    );

    const handleLegendHoverEnd = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root
        .selectAll<SVGGElement, InferenceData>('.dot-group')
        .style('opacity', (d) => (isPointVisible(d) ? pointOpacityForVariant(d) : 0));
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
            activeOverlayHwTypes,
          );
        });
    }, [
      isPointVisible,
      isRooflineVisible,
      effectiveActiveHwTypes,
      selectedPrecisions,
      activeOverlayHwTypes,
    ]);

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
          if (pointLabelsVisible) {
            avoidPointLabelCollisions(ctx.layout.zoomGroup);
          }
        },
      }),
      [zoomResetEventName, eventPrefix, xScaleConfig._isLog, yScaleConfig.type, pointLabelsVisible],
    );

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
            showPowerTelemetry: interactionRef.current.showPowerTelemetry,
            runUrl: d.run_url ? updateRepoUrl(d.run_url) : undefined,
            hasTrace:
              d.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(d.id)
                ? (interactionRef.current.traceAvailability?.[d.id] ?? false)
                : false,
            hasLog: isPersistedBenchmarkId(d.id)
              ? (interactionRef.current.logAvailability?.[d.id] ?? false)
              : false,
            locale,
            powerLabelStyle,
            touch: touchCopy,
          }),
        getRulerX: (d: InferenceData, xScale: any) => (xScale as ContinuousScale)(d.x),
        getRulerY: (d: InferenceData, yScale: any) => (yScale as ContinuousScale)(d.y),
        onHoverStart: (sel: d3.Selection<any, InferenceData, any, any>, d: InferenceData) => {
          // PowerX: the chip comparison follows the hovered point's interactivity.
          if (compareFollowsHoverRef.current) compareFollowsHoverRef.current(d.x);
          activePointRef.current?.({ point: d, source: 'hover' });
          applyHoverState(
            sel.select('.visible-shape') as any,
            getShapeKeyForPrecision(d.precision, interactionRef.current.selectedPrecisions),
          );
        },
        onHoverEnd: (sel: d3.Selection<any, InferenceData, any, any>, d: InferenceData) => {
          activePointRef.current?.(null);
          applyNormalState(
            sel.select('.visible-shape') as any,
            getShapeKeyForPrecision(d.precision, interactionRef.current.selectedPrecisions),
          );
        },
        onPointClick: (d: InferenceData) => {
          activePointRef.current?.({ point: d, source: 'pinned' });
          const ruler = perfRulerRef.current;
          if (ruler.mode) {
            track('latency_data_point_clicked', {
              gpu: String(d.hwKey),
              x: d.x,
              y: d.y,
              perf_ruler: true,
            });
            ruler.onPointClick(d, 'official');
            return;
          }
          track('latency_data_point_clicked', { gpu: String(d.hwKey), x: d.x, y: d.y });
          const tooltipEl = chartRef.current?.getTooltipElement();
          if (!tooltipEl) return;

          const viewBtn = tooltipEl.querySelector('[data-action="view-charts"]');
          if (viewBtn && isPersistedBenchmarkId(d.id)) {
            viewBtn.addEventListener('click', (btnEvent) => {
              btnEvent.stopPropagation();
              if (!ephemeralUrlState) rememberChartStateInUrl();
              track('latency_view_charts_opened', {
                id: d.id,
                gpu: String(d.hwKey),
                conc: d.conc,
              });
            });
          }
          const powerBtn = tooltipEl.querySelector('[data-action="view-power-telemetry"]');
          if (powerBtn && isPersistedBenchmarkId(d.id)) {
            powerBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              setPowerTelemetryPoint(d);
              chartRef.current?.dismissTooltip();
              track('inference_power_telemetry_opened', { id: d.id, gpu: d.hwKey, conc: d.conc });
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
                gpu: String(d.hwKey),
                conc: d.conc,
                benchmark_type: d.benchmark_type ?? 'single_turn',
              });
            });
          }
          attachPowerTraceAction(tooltipEl, d, false);
        },
        attachToLayer: 1,
      }),
      [
        attachPowerTraceAction,
        xLabel,
        yLabel,
        selectedYAxisMetric,
        hardwareConfig,
        locale,
        powerLabelStyle,
        touchCopy,
      ],
    );

    const layers = useMemo((): LayerConfig<InferenceData>[] => {
      const wattsAxis = metricPlotsWatts(selectedYAxisMetric);
      const lineLabelIdentity = (hw: string, points: readonly InferenceData[]) => {
        const variant = points[0]?.powerVariant;
        const variantId = powerVariantId(variant);
        const isBase = !variant || variantId === powerCompareBaseId;
        return { variant, variantId, isBase, seriesId: lineLabelSeriesId(hw, variant, isBase) };
      };
      const lineLabelSuffix = (
        identity: ReturnType<typeof lineLabelIdentity>,
        points: readonly InferenceData[],
      ) =>
        powerLineLabelSuffix(identity.variant, {
          isBase: identity.isBase,
          locale,
          labelStyle: powerLabelStyle,
          flatWatts:
            !identity.isBase && wattsAxis && identity.variant?.kind === 'basis'
              ? flatSeriesValue(points.map((point) => point.y))
              : null,
        });

      // Comparison lines carry no label pill (the legend's line styles name them) unless they
      // are flat references whose value is the point of the pill, e.g. "TDP 1 kW".
      const showsLinePill = (hw: string, points: readonly InferenceData[]) => {
        const identity = lineLabelIdentity(hw, points);
        if (identity.isBase) return true;
        return (
          wattsAxis &&
          identity.variant?.kind === 'basis' &&
          flatSeriesValue(points.map((point) => point.y)) !== null
        );
      };

      const rooflineLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'rooflines',
        displayIdentity: `${showGradientLabels}:${showLineLabels}`,
        render: (zoomGroup, ctx) => {
          const ir = interactionRef.current;
          const xScale = ctx.xScale as ContinuousScale;
          const yScale = ctx.yScale as ContinuousScale;
          const { defs } = ctx.layout;

          const lineGen = d3
            .line<InferenceData>()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y))
            .curve(d3.curveMonotoneX);

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

          interface Entry {
            key: string;
            hw: string;
            precision: string;
            variant: string;
            points: InferenceData[];
            stroke: string;
            visible: boolean;
          }
          const entries: Entry[] = [];
          const activeGradientIds = new Set<string>();

          Object.entries(displayedRooflines).forEach(([key, pts]) => {
            const { hw, precision, variant } = parseScatterSeriesKey(key);
            const visible =
              ir.effectiveActiveHwTypes.has(hw) &&
              ir.selectedPrecisions.includes(precision) &&
              !ir.hiddenPowerVariants.has(variant ?? '');
            const baseStroke = ir.getCssColor(ir.resolveColor(hw));

            const byDate = groupDisplayedPoints(pts);
            const singleDate = byDate.size === 1;

            for (const [date, datePoints] of byDate) {
              const entryKey = singleDate ? key : `${key}__${encodeURIComponent(date)}`;
              let stroke = baseStroke;

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
                      .selectAll<SVGStopElement, (typeof stops)[number]>('stop')
                      .data(stops)
                      .join('stop')
                      .each(syncGradientStop);
                    stroke = `url(#${gid})`;
                  }
                }
              }

              entries.push({
                key: entryKey,
                hw,
                precision,
                variant: variant ?? '',
                points: datePoints,
                stroke,
                visible,
              });
            }
          });

          defs.selectAll('linearGradient').each(function () {
            const id = (this as SVGLinearGradientElement).id;
            if (id.startsWith(`roofline-gradient-${chartId}-`) && !activeGradientIds.has(id)) {
              d3.select(this).remove();
            }
          });

          rooflinesLayer
            .selectAll<SVGPathElement, Entry>('.roofline-path')
            .data(
              entries.filter((entry) => entry.points.length > 1),
              (d) => d.key,
            )
            .join('path')
            .attr('class', (d) => `roofline-path roofline-${d.key}`)
            .attr('data-curve-kind', showPowerEnvelope ? 'power-envelope' : 'pareto')
            .attr('data-hw-key', (d) => d.hw)
            .attr('data-precision', (d) => d.precision)
            .attr('data-power-variant', (d) => d.variant || null)
            .attr('fill', 'none')
            .attr('stroke', (d) => d.stroke)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', (d) => powerVariantDashById(d.variant) || null)
            .attr('d', (d) => lineGen(d.points))
            .style('transition', 'opacity 150ms ease')
            .style('opacity', (d) => (d.visible ? 1 : 0));

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
              const { hw, precision, variant } = parseScatterSeriesKey(key);
              const visible =
                ir.effectiveActiveHwTypes.has(hw) &&
                ir.selectedPrecisions.includes(precision) &&
                !ir.hiddenPowerVariants.has(variant ?? '');

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
            .attr('data-curve-kind', showPowerEnvelope ? 'power-envelope' : 'pareto')
            .attr('data-hw-key', (d) => d.hw)
            .attr('data-precision', (d) => d.precision)
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
            .style('transition', 'opacity 150ms ease')
            .style('opacity', (d) => (d.visible ? 1 : 0));

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

          let lineLabels: LineLabelPlacement[] = [];
          const lineLabelMeta = new Map<
            string,
            { variantId: string; suffix: string; runTag: string }
          >();
          if (showLineLabels) {
            const multiPrecision = ir.selectedPrecisions.length > 1;
            const officialByGroup = new Map<string, (typeof entries)[number]>();
            for (const entry of entries) {
              if (!entry.visible) continue;
              const groupKey = multiPrecision ? entry.key : `${entry.hw}::${entry.variant}`;
              const previous = officialByGroup.get(groupKey);
              if (!previous || entry.points.length > previous.points.length) {
                officialByGroup.set(groupKey, entry);
              }
            }

            const officialSeries: LineLabelSeries<InferenceData>[] = [...officialByGroup.values()]
              .filter((entry) => showsLinePill(entry.hw, entry.points))
              .map((entry) => {
                const identity = lineLabelIdentity(entry.hw, entry.points);
                const suffix = lineLabelSuffix(identity, entry.points);
                lineLabelMeta.set(entry.key, { variantId: identity.variantId, suffix, runTag: '' });
                return {
                  key: entry.key,
                  seriesId: identity.seriesId,
                  label: `${lineLabelText(
                    entry.hw,
                    entry.precision,
                    multiPrecision,
                    modelLabel,
                    entry.points,
                  )}${suffix}`,
                  color: ir.getCssColor(ir.resolveColor(entry.hw)),
                  points: entry.points,
                };
              });
            const overlayRunsByHw = new Map<string, Set<number>>();
            for (const group of Object.values(displayedOverlayRooflines)) {
              if (!ir.activeOverlayHwTypes.has(group.hwKey)) continue;
              if (!overlayRunsByHw.has(group.hwKey)) overlayRunsByHw.set(group.hwKey, new Set());
              overlayRunsByHw.get(group.hwKey)!.add(group.runIndex);
            }
            const overlaySeries: LineLabelSeries<InferenceData>[] = Object.entries(
              displayedOverlayRooflines,
            ).flatMap(([overlayKey, group]) => {
              if (!ir.activeOverlayHwTypes.has(group.hwKey)) return [];
              if (!showsLinePill(group.hwKey, group.points)) return [];
              const info = unofficialRunInfos[group.runIndex];
              const precision = group.points[0]?.precision ?? '';
              const hardwareLabel = lineLabelText(
                group.hwKey,
                precision,
                multiPrecision,
                modelLabel,
                group.points,
              );
              const sharesHardware = (overlayRunsByHw.get(group.hwKey)?.size ?? 0) > 1;
              const runTag = info && sharesHardware ? overlayRunTag(info) : '';
              const label = info
                ? getOverlayLineLabel(hardwareLabel, info, sharesHardware)
                : hardwareLabel;
              const identity = lineLabelIdentity(group.hwKey, group.points);
              const suffix = lineLabelSuffix(identity, group.points);
              const key = `overlay-${overlayKey}`;
              lineLabelMeta.set(key, { variantId: identity.variantId, suffix, runTag });
              return [
                {
                  key,
                  seriesId: identity.seriesId,
                  label: `${label}${suffix}`,
                  color: overlayRunColor(group.runIndex),
                  points: group.points,
                },
              ];
            });
            const labelSeries = [...officialSeries, ...overlaySeries];

            lineLabels = placeLineLabels(labelSeries, xScale, yScale, {
              collisionWidth: 120,
              anchors: lineLabelAnchorRef.current,
              pinAnchors: pinLineLabels,
              obstacles: parallelismLabelBoxes(ctx.layout.zoomGroup.node()),
            });

            const labeledKeys = new Set(lineLabels.map((label) => label.key));
            for (const entry of entries) {
              if (labeledKeys.has(entry.key)) continue;
              const identity = lineLabelIdentity(entry.hw, entry.points);
              const suffix = lineLabelSuffix(identity, entry.points);
              lineLabelMeta.set(entry.key, { variantId: identity.variantId, suffix, runTag: '' });
              lineLabels.push({
                key: entry.key,
                seriesId: identity.seriesId,
                label: `${lineLabelText(
                  entry.hw,
                  entry.precision,
                  multiPrecision,
                  modelLabel,
                  entry.points,
                )}${suffix}`,
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
            seriesAttribute: 'data-series-id',
            iconFor: (label) => getLineLabelVendorIcon(lineLabelHardwareKey(label.seriesId)),
            configureGroup: (labelGroup, label) => {
              labelGroup
                .attr('data-visible', label.visible ? '1' : '0')
                .attr('data-hw-key', lineLabelHardwareKey(label.seriesId))
                .attr('data-power-variant', lineLabelMeta.get(label.key)?.variantId ?? '')
                .select('.ll-bg')
                .attr('opacity', 0.95);
            },
            configureText: (text, label) => {
              const config = getHardwareConfig(lineLabelHardwareKey(label.seriesId), modelLabel);
              const meta = lineLabelMeta.get(label.key);
              const suffix = meta?.suffix ?? '';
              const runTag = meta?.runTag ?? '';
              let coreLabel = suffix ? label.label.slice(0, -suffix.length) : label.label;
              if (runTag) coreLabel = coreLabel.slice(0, -runTag.length);
              const hardwareLabel = getDisplayLabel(config);
              const isHardwareLabel =
                coreLabel === hardwareLabel || coreLabel.startsWith(`${config.label} `);
              const remainingLabel = isHardwareLabel ? coreLabel.slice(config.label.length) : '';
              const engineLabel =
                remainingLabel.match(/ \([^()]*\)$/u)?.[0] ??
                (config.suffix ? ` ${config.suffix}` : '');
              const precisionLabel =
                engineLabel && remainingLabel.endsWith(engineLabel)
                  ? remainingLabel.slice(0, -engineLabel.length)
                  : remainingLabel;
              const runSegments = runTag
                ? [{ className: 'll-run', text: runTag, fill: '#d1d5db', weight: '400' }]
                : [];
              const variantSegments = suffix
                ? [{ className: 'll-variant', text: suffix, fill: 'white', weight: '500' }]
                : [];
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
                    ...(engineLabel
                      ? [
                          {
                            className: 'll-engine',
                            text: engineLabel,
                            fill: '#d1d5db',
                            weight: '400',
                          },
                        ]
                      : []),
                    ...runSegments,
                    ...variantSegments,
                  ]
                : [
                    {
                      className: 'll-plain',
                      text: coreLabel,
                      fill: 'white',
                      weight: '600',
                    },
                    ...runSegments,
                    ...variantSegments,
                  ];
              text
                .selectAll<SVGTSpanElement, (typeof segments)[number]>('tspan')
                .data(segments, (segment) => segment.className)
                .join('tspan')
                .attr('class', (segment) => segment.className)
                .attr('fill', (segment) => segment.fill)
                .attr('font-weight', (segment) => segment.weight)
                .attr('x', null)
                .attr('dy', null)
                .text((segment) => segment.text);
              const textX = Number(text.attr('x') ?? 0);
              const maxLineWidth = ctx.width - textX - 10;
              let lineWidth = 0;
              text.selectAll<SVGTSpanElement, unknown>('tspan').each(function () {
                const width = this.getComputedTextLength();
                if (lineWidth > 0 && lineWidth + width > maxLineWidth) {
                  d3.select(this)
                    .attr('x', textX)
                    .attr('dy', CHART_TYPE.lineLabel + 3);
                  lineWidth = 0;
                }
                lineWidth += width;
              });
            },
          });
          applyParetoFadeRef.current(zoomGroup);
        },
        onDisplayUpdate: (zoomGroup, ctx) => {
          const transform = d3.zoomTransform(ctx.layout.svg.node()!);
          rooflineLayer.render?.(zoomGroup, {
            ...ctx,
            xScale: transform.rescaleX(ctx.xScale as ContinuousScale),
            yScale: transform.rescaleY(ctx.yScale as ContinuousScale),
          });
          raiseInOrder(zoomGroup, LINE_LABEL_RAISE);
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

          Object.entries(displayedRooflines).forEach(([key, pts]) => {
            if (pts.length < 2) return;
            const byDate = groupDisplayedPoints(pts);
            const singleDate = byDate.size === 1;
            for (const [date, datePoints] of byDate) {
              if (datePoints.length < 2) continue;
              const cls = singleDate
                ? `roofline-${key}`
                : `roofline-${key}__${encodeURIComponent(date)}`;
              const sel = zoomGroup.select<SVGPathElement>(`.${CSS.escape(cls)}`);
              if (!sel.empty()) sel.attr('d', lineGen(datePoints) as string);
            }
          });

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
                    .selectAll<SVGStopElement, (typeof newStops)[number]>('stop')
                    .data(newStops)
                    .join('stop')
                    .each(syncGradientStop);
                }
              }

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

          if (showLineLabels) {
            const multiPrecision = ir.selectedPrecisions.length > 1;
            const bestByGroup = new Map<
              string,
              { key: string; seriesId: string; points: InferenceData[] }
            >();
            for (const [key, points] of Object.entries(displayedRooflines)) {
              const { hw: hardware, precision, variant } = parseScatterSeriesKey(key);
              if (
                !ir.effectiveActiveHwTypes.has(hardware) ||
                !ir.selectedPrecisions.includes(precision) ||
                ir.hiddenPowerVariants.has(variant ?? '')
              ) {
                continue;
              }
              const pointsByDate = groupDisplayedPoints(points);
              const singleDate = pointsByDate.size === 1;
              for (const [date, datePoints] of pointsByDate) {
                const entryKey = singleDate ? key : `${key}__${encodeURIComponent(date)}`;
                const groupKey = multiPrecision ? entryKey : `${hardware}::${variant ?? ''}`;
                const previous = bestByGroup.get(groupKey);
                if (!previous || datePoints.length > previous.points.length) {
                  bestByGroup.set(groupKey, {
                    key: entryKey,
                    seriesId: lineLabelIdentity(hardware, datePoints).seriesId,
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
              }),
            );
            const overlaySeries: LineLabelSeries<InferenceData>[] = Object.entries(
              displayedOverlayRooflines,
            ).flatMap(([overlayKey, group]) =>
              ir.activeOverlayHwTypes.has(group.hwKey)
                ? [
                    {
                      key: `overlay-${overlayKey}`,
                      seriesId: lineLabelIdentity(group.hwKey, group.points).seriesId,
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

      const scatterLayer: LayerConfig<InferenceData> = {
        type: 'scatter',
        key: 'points',
        data: pointsData,
        config: {
          getColor: (d) =>
            (showGradientLabels && gradientColorByPoint.get(d)) ||
            interactionRef.current.getCssColor(
              interactionRef.current.resolveColor(d.hwKey as string),
            ),
          getOpacity: (d) =>
            interactionRef.current.isPointVisible(d) ? pointOpacityForVariant(d) : 0,
          getPointerEvents: (d) => (interactionRef.current.isPointVisible(d) ? 'auto' : 'none'),
          hideLabels: !pointLabelsVisible,
          // Concurrency (C=) is appended only when the advanced
          // "# Concurrent Sessions" toggle is on.
          getLabelText: (d) =>
            pointLabelText(d, showPointLabels, useAdvancedLabels, showConcurrencyLabels),
          foreground: 'var(--foreground)',
          dataAttrs: {
            'hw-key': (d) => String(d.hwKey),
            precision: (d) => d.precision,
            'power-variant': (d) => d.powerVariant?.id ?? '',
            'benchmark-type': (d) => d.benchmark_type ?? '',
          },
          getShapeKey: (d) =>
            getShapeKeyForPrecision(d.precision, interactionRef.current.selectedPrecisions),
        },
        keyFn: buildPointId,
      };

      const updateOverlayLabels = (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
      ) => {
        const overlayPoints = zoomGroup.selectAll<SVGGElement, InferenceData>(
          '.unofficial-overlay-pt',
        );
        const powerLabels = showPowerEnvelope && showGradientLabels;
        const showLabels = powerLabels || pointLabelsVisible;
        overlayPoints.each(function (d) {
          const lines = (
            powerLabels
              ? getParetoLabel(d)
              : pointLabelText(d, showPointLabels, useAdvancedLabels, showConcurrencyLabels)
          ).split('\n');
          const text = d3
            .select(this)
            .selectAll<SVGTextElement, boolean>('.overlay-label')
            .data([true])
            .join('text')
            .attr('class', 'overlay-label')
            .attr('text-anchor', 'middle')
            .style(
              'display',
              showLabels && (!powerLabels || overlayGradientLabelPoints.has(d)) ? '' : 'none',
            )
            .style('opacity', showLabels ? 1 : 0)
            .style(
              'fill',
              powerLabels
                ? overlayRunColor(overlayRunIndex(d.run_url ?? null, runIndexByUrl))
                : 'var(--foreground)',
            )
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
      };

      const overlayLayer: CustomLayerConfig | null = overlayData
        ? {
            type: 'custom',
            key: 'overlay',
            displayIdentity: `${showPointLabels}:${useAdvancedLabels}:${showConcurrencyLabels}:${showGradientLabels}`,
            render: (zoomGroup, ctx) => {
              const xScale = ctx.xScale as ContinuousScale;
              const yScale = ctx.yScale as ContinuousScale;

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
                variant: string | null;
              }
              const ovEntries: OvEntry[] = [];
              Object.entries(displayedOverlayRooflines).forEach(([key, group]) => {
                const hwCfg = overlayData.hardwareConfig[group.hwKey];
                if (hwCfg && group.points.length > 1) {
                  ovEntries.push({
                    key,
                    points: group.points,
                    stroke: overlayRunColor(group.runIndex),
                    runIndex: group.runIndex,
                    variant: group.variant,
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
                .attr('data-curve-kind', showPowerEnvelope ? 'power-envelope' : 'pareto')
                .attr('fill', 'none')
                .attr('stroke', (d) => d.stroke)
                .attr('stroke-width', 2)
                .attr('data-power-variant', (d) => d.variant)
                .attr('stroke-dasharray', (d) =>
                  d.variant
                    ? powerVariantDashById(d.variant)
                    : overlayRooflineDasharray(d.runIndex),
                )
                .attr('d', (d) => lineGen(d.points))
                .style('filter', null)
                .style('opacity', (d) =>
                  interactionRef.current.hiddenPowerVariants.has(d.variant ?? '') ? 0 : null,
                );

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
              overlayPoints.each(function (d) {
                const visible = interactionRef.current.isOverlayPointVisible(d);
                d3.select(this)
                  .style('opacity', visible ? pointOpacityForVariant(d) : 0)
                  .style('pointer-events', visible ? 'auto' : 'none');
              });
              overlayPoints
                .select('.overlay-x')
                .attr('stroke', (d) =>
                  overlayRunColor(overlayRunIndex(d.run_url ?? null, runIndexByUrl)),
                );

              overlayPoints.each(function (d) {
                renderOffloadHalo(
                  d3.select(this),
                  d,
                  overlayRunColor(overlayRunIndex(d.run_url ?? null, runIndexByUrl)),
                );
              });

              updateOverlayLabels(zoomGroup);

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
                    powerLabelStyle,
                    touch: touchCopy,
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
                  const ruler = perfRulerRef.current;
                  if (ruler.mode) {
                    track('latency_data_point_clicked', {
                      gpu: String(point.hwKey),
                      x: point.x,
                      y: point.y,
                      overlay: true,
                      perf_ruler: true,
                    });
                    ruler.onPointClick(point, 'overlay');
                    return;
                  }
                  track('latency_data_point_clicked', {
                    gpu: String(point.hwKey),
                    x: point.x,
                    y: point.y,
                    overlay: true,
                  });
                  attachPowerTraceAction(ctx.tooltipElement, point, true);
                },
              });
            },
            onDisplayUpdate: updateOverlayLabels,
            onZoom: (zoomGroup, ctx) => {
              const newXScale = ctx.newXScale as ContinuousScale;
              const newYScale = ctx.newYScale as ContinuousScale;

              const lineGen = d3
                .line<InferenceData>()
                .x((d) => newXScale(d.x))
                .y((d) => newYScale(d.y))
                .curve(d3.curveMonotoneX);

              Object.entries(displayedOverlayRooflines).forEach(([key, group]) => {
                if (group.points.length < 2) return;
                const sel = zoomGroup.select<SVGPathElement>(
                  `.${CSS.escape(`overlay-roofline-${key}`)}`,
                );
                if (!sel.empty()) sel.attr('d', lineGen(group.points) as string);
              });

              zoomGroup
                .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
                .attr('transform', (d) => `translate(${newXScale(d.x)},${newYScale(d.y)})`);
            },
          }
        : null;

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
              gpu: annotation.issue.hwKey,
              issue: annotation.issue.issueRef,
            }),
        };
      });

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

      const axisCeiling = metricAxisCeiling(selectedYAxisMetric);
      const drawCeiling = (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        yScale: ContinuousScale,
        width: number,
      ) => {
        const domainTop = Math.max(...(yScale.domain() as number[]));
        // Only mark the rating when the axis reaches it.
        const y = axisCeiling === undefined || axisCeiling > domainTop ? null : yScale(axisCeiling);
        const g = zoomGroup
          .selectAll<SVGGElement, number>('g.metric-ceiling')
          .data(y === null || !Number.isFinite(y) ? [] : [y])
          .join('g')
          .attr('class', 'metric-ceiling')
          .attr('pointer-events', 'none');
        g.selectAll('line')
          .data((d) => [d])
          .join('line')
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', (d) => d)
          .attr('y2', (d) => d)
          .attr('stroke', 'var(--muted-foreground)')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '5,4');
        g.selectAll('text')
          .data((d) => [d])
          .join('text')
          .attr('x', width - 4)
          .attr('y', (d) => d - 4)
          .attr('text-anchor', 'end')
          .attr('font-size', 11)
          .attr('fill', 'var(--muted-foreground)')
          .text('100% TDP');
      };
      const ceilingLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'metric-ceiling',
        render: (zoomGroup, ctx) =>
          drawCeiling(zoomGroup, (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale, ctx.width),
        onZoom: (zoomGroup, ctx) =>
          drawCeiling(zoomGroup, ctx.newYScale as ContinuousScale, ctx.width),
      };

      // PowerX headroom: the band between each chip's P90 draw (dotted) and 100 % TDP,
      // for the official chip lines and for every unofficial-run overlay line in its run color.
      const headroomBand = (points: InferenceData[], optimal: (p: InferenceData) => boolean) =>
        points
          .filter(
            (p) =>
              selectedPrecisions.includes(p.precision) &&
              (!hideNonOptimal || optimal(p)) &&
              Number.isFinite(p.measuredP90Power?.y) &&
              Number.isFinite(p.measuredAvgPower?.y) &&
              (p.measuredAvgPower?.y ?? 0) > 0 &&
              Number.isFinite(p.measuredPowerPercentTdp?.y),
          )
          .map((p) => ({
            x: p.x,
            // % TDP at P90 = P90 W × (% TDP ÷ avg W), the point's own TDP ratio.
            y: (p.measuredP90Power!.y * p.measuredPowerPercentTdp!.y) / p.measuredAvgPower!.y,
          }))
          .toSorted((a, b) => a.x - b.x);
      const headroomSeries: {
        key: string;
        color: string;
        band: { x: number; y: number }[];
        runIndex: number | null;
      }[] = headroomShading
        ? [
            ...Object.entries(groupedData).flatMap(([key, points]) => {
              if (points[0]?.powerVariant) return [];
              const hwKey = points[0]?.hwKey;
              if (!hwKey || !effectiveActiveHwTypes.has(hwKey)) return [];
              const band = headroomBand(points, (p) => optimalPointKeys.has(optimalPointKey(p)));
              return band.length >= 2
                ? [{ key, color: getCssColor(resolveColor(hwKey)), band, runIndex: null }]
                : [];
            }),
            ...Object.entries(overlayGroups).flatMap(([key, group]) => {
              if (group.variant !== null || !activeOverlayHwTypes.has(group.hwKey)) return [];
              const band = headroomBand(group.points, (p) => overlayOptimalPoints.has(p));
              return band.length >= 2
                ? [
                    {
                      key: `overlay-${key}`,
                      color: overlayRunColor(group.runIndex),
                      band,
                      runIndex: group.runIndex,
                    },
                  ]
                : [];
            }),
          ]
        : [];
      const drawHeadroom = (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: ContinuousScale,
        yScale: ContinuousScale,
      ) => {
        const domainTop = Math.max(...(yScale.domain() as number[]));
        const topY = yScale(Math.min(100, domainTop));
        const area = d3
          .area<{ x: number; y: number }>()
          .x((d) => xScale(d.x))
          .y0(() => topY)
          .y1((d) => yScale(d.y));
        const line = d3
          .line<{ x: number; y: number }>()
          .x((d) => xScale(d.x))
          .y((d) => yScale(d.y));
        const g = zoomGroup
          .selectAll<SVGGElement, (typeof headroomSeries)[number]>('g.headroom-band')
          .data(headroomSeries, (d) => d.key)
          .join('g')
          .attr('class', 'headroom-band')
          .attr('data-testid', 'headroom-band')
          .attr('data-run-index', (d) => (d.runIndex === null ? null : d.runIndex))
          .attr('pointer-events', 'none');
        g.selectAll('path.headroom-area')
          .data((d) => [d])
          .join('path')
          .attr('class', 'headroom-area')
          .attr('fill', (d) => d.color)
          .attr('fill-opacity', 0.09)
          .attr('stroke', 'none')
          .attr('d', (d) => area(d.band));
        g.selectAll('path.headroom-p90')
          .data((d) => [d])
          .join('path')
          .attr('class', 'headroom-p90')
          .attr('fill', 'none')
          .attr('stroke', (d) => d.color)
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2,3')
          .attr('d', (d) => line(d.band));
      };
      const headroomLayer: CustomLayerConfig = {
        type: 'custom',
        key: 'powerx-headroom',
        render: (zoomGroup, ctx) =>
          drawHeadroom(
            zoomGroup,
            (ctx.renderedXScale ?? ctx.xScale) as ContinuousScale,
            (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale,
          ),
        onZoom: (zoomGroup, ctx) =>
          drawHeadroom(
            zoomGroup,
            ctx.newXScale as ContinuousScale,
            ctx.newYScale as ContinuousScale,
          ),
      };

      // PowerX on a coarse pointer: there is no hover tooltip, so a finger dragged across
      // the plot snaps to the nearest visible point (official or overlay, under the current
      // zoom) and the readout above the chart reads it; a tap on a point still opens its
      // sheet through the point's own click. One-finger touches never reach d3-zoom
      // (zoomEventFilter), the svg keeps touch-action pan-y so a vertical pan scrolls the
      // page, and it is none only while a scrub is in progress.
      const scrubLayer: CustomLayerConfig | null = touchScrub
        ? {
            type: 'custom',
            key: 'powerx-scrub',
            render: (zoomGroup, ctx) => {
              // A re-render (the readout's own update re-renders the chart) keeps the mark
              // where the finger last was; the next finger, or a zoom, moves or drops it.
              zoomGroup.select('g.powerx-scrub').raise();
              const svg = ctx.layout.svg;
              const svgNode = svg.node();
              const candidates = (): ScrubCandidate<InferenceData>[] => {
                if (!svgNode) return [];
                const zoomed = currentZoomRenderContext(svgNode, ctx);
                const xScale = zoomed.xScale as ContinuousScale;
                const yScale = zoomed.yScale as ContinuousScale;
                const ir = interactionRef.current;
                return [
                  ...pointsData
                    .filter((point) => ir.isPointVisible(point))
                    .map((point) => ({
                      point,
                      x: xScale(point.x),
                      y: yScale(point.y),
                      overlay: false,
                    })),
                  ...processedOverlayData
                    .filter((point) => ir.isOverlayPointVisible(point))
                    .map((point) => ({
                      point,
                      x: xScale(point.x),
                      y: yScale(point.y),
                      overlay: true,
                    })),
                ];
              };
              const snap = (event: PointerEvent) => {
                const [mx, my] = d3.pointer(event, zoomGroup.node());
                const best = nearestScrubCandidate(candidates(), mx, my);
                if (!best) return;
                const ir = interactionRef.current;
                const color = best.overlay
                  ? overlayRunColor(overlayRunIndex(best.point.run_url ?? null, runIndexByUrl))
                  : ir.getCssColor(ir.resolveColor(best.point.hwKey as string));
                let mark = zoomGroup.select<SVGGElement>('g.powerx-scrub');
                if (mark.empty()) {
                  mark = zoomGroup
                    .append('g')
                    .attr('class', 'powerx-scrub')
                    .attr('data-testid', 'powerx-scrub')
                    .attr('pointer-events', 'none');
                  mark
                    .append('line')
                    .attr('class', 'powerx-scrub-rule')
                    .attr('stroke', 'var(--foreground)')
                    .attr('stroke-width', 1.5)
                    .attr('stroke-opacity', 0.7);
                  mark
                    .append('circle')
                    .attr('class', 'powerx-scrub-ring')
                    .attr('r', 9)
                    .attr('fill', 'none')
                    .attr('stroke-width', 2.5);
                }
                mark
                  .attr('data-hw-key', String(best.point.hwKey))
                  .attr('data-conc', String(best.point.conc))
                  .attr('data-overlay', best.overlay ? 'true' : null)
                  .raise();
                mark
                  .select('line.powerx-scrub-rule')
                  .attr('x1', best.x)
                  .attr('x2', best.x)
                  .attr('y1', 0)
                  .attr('y2', ctx.height);
                mark
                  .select('circle.powerx-scrub-ring')
                  .attr('cx', best.x)
                  .attr('cy', best.y)
                  .attr('stroke', color);
                activePointRef.current?.({ point: best.point, source: 'scrub' });
              };
              svg
                .on('pointerdown.powerxScrub', (event: PointerEvent) => {
                  if (event.pointerType === 'mouse' || event.isPrimary === false) return;
                  scrubPointerRef.current = event.pointerId;
                  snap(event);
                })
                .on('pointermove.powerxScrub', (event: PointerEvent) => {
                  if (scrubPointerRef.current !== event.pointerId) return;
                  if (svgNode) svgNode.style.touchAction = 'none';
                  snap(event);
                })
                .on('pointerup.powerxScrub pointercancel.powerxScrub', (event: PointerEvent) => {
                  if (scrubPointerRef.current !== event.pointerId) return;
                  scrubPointerRef.current = null;
                  if (svgNode) svgNode.style.touchAction = 'pan-y';
                });
            },
            // The mark's pixel position is stale after a zoom; the next finger redraws it.
            onZoom: (zoomGroup) => {
              zoomGroup.selectAll('.powerx-scrub').remove();
            },
          }
        : null;

      const result: LayerConfig<InferenceData>[] = headroomShading
        ? [headroomLayer, rooflineLayer, scatterLayer]
        : [rooflineLayer, scatterLayer];
      if (overlayLayer) result.push(overlayLayer);
      result.push(
        overflowContinuationLayer,
        paretoHighlightLayer,
        perfRulerLayer,
        knownIssueLayer,
        ceilingLayer,
      );
      if (scrubLayer) result.push(scrubLayer);
      return result;
    }, [
      displayedRooflines,
      paretoHighlightLayer,
      groupDisplayedPoints,
      showPowerEnvelope,
      allPointLabelsByKey,
      showGradientLabels,
      showLineLabels,
      pinLineLabels,
      gradientColorByPoint,
      overlayGradientLabelPoints,
      chartId,
      pointsData,
      showPointLabels,
      pointLabelsVisible,
      useAdvancedLabels,
      showConcurrencyLabels,
      buildPointId,
      overlayData,
      processedOverlayData,
      displayedOverlayRooflines,
      officialOverflowContinuations,
      overlayOverflowContinuations,
      unofficialRunInfos,
      runIndexByUrl,
      hardwareConfig,
      xLabel,
      yLabel,
      selectedYAxisMetric,
      powerCompareBaseId,
      headroomShading,
      groupedData,
      overlayGroups,
      activeOverlayHwTypes,
      overlayOptimalPoints,
      effectiveActiveHwTypes,
      selectedPrecisions,
      hideNonOptimal,
      optimalPointKeys,
      getCssColor,
      resolveColor,
      chartDefinition,
      locale,
      powerLabelStyle,
      drawPerfRuler,
      attachPowerTraceAction,
      touchScrub,
    ]);

    const layersRef = useRef(layers);
    layersRef.current = layers;

    const onExportRender = useCallback(
      (ctx: RenderContext) => {
        const { zoomGroup } = ctx.layout;

        zoomGroup.selectAll('.dot-group').style('transition', 'opacity 150ms ease');

        zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (d) {
          renderOffloadHalo(d3.select(this), d, 'var(--foreground)');
        });

        avoidPointLabelCollisions(zoomGroup);

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
      ],
    );

    const onRender = useCallback(
      (ctx: RenderContext) => {
        lastRenderCtxRef.current = ctx;
        onExportRender(ctx);
      },
      [onExportRender],
    );

    useLayoutEffect(() => {
      const display = getDisplaySelection();
      if (!display) return;
      const { zoomGroup } = display;
      const ir = interactionRef.current;

      zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (d) {
        const point = d3.select(this);
        const visible = ir.isPointVisible(d);
        point
          .style('opacity', visible ? pointOpacityForVariant(d) : 0)
          .style('pointer-events', visible ? 'auto' : 'none');
        const color =
          (showGradientLabels && gradientColorByPoint.get(d)) ||
          ir.getCssColor(ir.resolveColor(d.hwKey as string));
        syncPointShape(
          point as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
          getShapeKeyForPrecision(d.precision, ir.selectedPrecisions),
          color,
        );
        raiseInOrder(point, POINT_DECORATION_RAISE);
      });

      zoomGroup.selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt').each(function (d) {
        const visible = ir.isOverlayPointVisible(d);
        d3.select(this)
          .style('opacity', visible ? pointOpacityForVariant(d) : 0)
          .style('pointer-events', visible ? 'auto' : 'none');
      });
      zoomGroup.selectAll<SVGPathElement, unknown>('.overlay-roofline-path').each(function () {
        const roofline = d3.select(this);
        if (ir.hiddenPowerVariants.has(this.dataset.powerVariant ?? '')) {
          roofline.style('opacity', 0);
        } else {
          roofline.style('opacity', null);
        }
      });

      zoomGroup.selectAll<SVGPathElement, unknown>('.roofline-path').each(function () {
        const hw = this.dataset.hwKey;
        const precision = this.dataset.precision;
        if (!hw || !precision) return;
        const roofline = d3.select(this);
        const visible =
          ir.effectiveActiveHwTypes.has(hw) &&
          ir.selectedPrecisions.includes(precision) &&
          !ir.hiddenPowerVariants.has(this.dataset.powerVariant ?? '');
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
            ir.activeOverlayHwTypes,
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

    useLayoutEffect(() => {
      const visibilityChanged = lastPointLabelsVisibleRef.current !== pointLabelsVisible;
      const gpuCountChanged = lastShowGpuCountRef.current !== showPointLabels;
      const lineLabelsChanged = lastShowLineLabelsRef.current !== showLineLabels;
      const gradientLabelsChanged = lastShowGradientLabelsRef.current !== showGradientLabels;
      if (!visibilityChanged && !gpuCountChanged && !lineLabelsChanged && !gradientLabelsChanged)
        return;
      lastShowGpuCountRef.current = showPointLabels;
      lastPointLabelsVisibleRef.current = pointLabelsVisible;
      lastShowLineLabelsRef.current = showLineLabels;
      lastShowGradientLabelsRef.current = showGradientLabels;
      const display = getDisplaySelection();
      if (!display) return;
      const { svg, ctx, zoomGroup } = display;
      if (visibilityChanged || gpuCountChanged) {
        zoomGroup.selectAll<SVGGElement, InferenceData>('.dot-group').each(function (point) {
          syncPointLabel(
            this,
            pointLabelText(point, showPointLabels, useAdvancedLabels, showConcurrencyLabels),
            'var(--foreground)',
            !pointLabelsVisible,
          );
        });
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
    }, [
      getDisplaySelection,
      pointLabelsVisible,
      showPointLabels,
      useAdvancedLabels,
      showConcurrencyLabels,
      showGradientLabels,
      showLineLabels,
    ]);

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
      if (labelDisplay.pointLabelsVisible) {
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

    useLayoutEffect(() => {
      if (overlayData) return;
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      d3.select(svg)
        .selectAll('.unofficial-overlay-pt, .overlay-roofline-path, .overlay-overflow-continuation')
        .remove();
    }, [overlayData]);

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

    useEffect(() => {
      chartRef.current?.dismissTooltip();
    }, [selectedPrecisions, selectedYAxisMetric, hideNonOptimal, overlayData, chartId]);

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
          emptyReason === 'selection'
            ? isRoleLocalMeasuredEnergyConfigKey(selectedYAxisMetric)
              ? legendT.noRoleEnergyDataHint
              : isAllInMeasuredConfigKey(selectedYAxisMetric)
                ? ALL_IN_MEASURED_EMPTY[locale]
                : isMeasuredEnergyConfigKey(selectedYAxisMetric)
                  ? legendT.noMeasuredDataHint
                  : undefined
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
      <div
        className="contents"
        data-orange-chicken-eligible={
          selectedSequence === Sequence.AgenticTraces ? 'true' : undefined
        }
      >
        <D3Chart<InferenceData>
          ref={chartRef}
          // PowerX drops the interaction hint under its charts; /inference keeps it.
          instructions={minimalChrome || powerXSurface ? '' : undefined}
          chartId={chartId}
          height={plotHeight}
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
          onExportRender={onExportRender}
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
                          label: getInferenceRunLabel(
                            `✕ ${branch}`,
                            overlayData.data.filter(
                              (point) =>
                                overlayRunIndex(point.run_url ?? null, runIndexByUrl) === idx &&
                                selectedPrecisions.includes(point.precision),
                            ),
                          ),
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
                              gpu: `overlay-run-${info.id}`,
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
                  .map(([key, hwConfig]: [string, any]) => {
                    const isActive = showAllHardwareTypes
                      ? true
                      : effectiveOfficialHwTypes.has(key);
                    const blocked = isActive ? undefined : blockedHwToggles.get(key);
                    return {
                      name: hwConfig.name,
                      label: getDisplayLabel(hwConfig),
                      color: resolveColor(key),
                      title: hwConfig.gpu,
                      isHighlighted: legendChangelogs.get(key)?.runId === selectedRunId,
                      hw: key,
                      isActive,
                      blockedReason: blocked
                        ? describeEngineComparisonConflict({ kind: 'blocked', ...blocked }, locale)
                        : undefined,
                      onClick: showAllHardwareTypes
                        ? () => {}
                        : () => {
                            handleToggleHwType(key);
                            track('latency_hw_type_toggled', { gpu: key });
                          },
                      onShowPoints: () => {
                        setPointsTableTarget({ kind: 'official', hwKey: key });
                        track('inference_legend_points_table_opened', {
                          gpu: key,
                          framework: hwConfig.framework ?? '',
                        });
                      },
                      tooltip: legendChangelogs.has(key)
                        ? formatChangelogDescription(
                            legendChangelogs.get(key)!.entries.map((entry) => entry.description),
                          )
                        : null,
                    };
                  }),
                ...powerVariantLegendItems,
              ]}
              disableActiveSort={false}
              isLegendExpanded={isLegendExpanded}
              onExpandedChange={(expanded) => {
                setIsLegendExpanded(expanded);
                track('latency_legend_expanded', { enabled: expanded });
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
                ...(paretoDirection
                  ? [
                      {
                        id: 'scatter-hide-non-optimal',
                        label: legendT.optimalOnly,
                        checked: hideNonOptimal,
                        onCheckedChange: (checked: boolean) => {
                          setHideNonOptimal(checked);
                          track('latency_hide_non_optimal_toggled', { enabled: checked });
                        },
                        ...(showPowerEnvelope || selectedSequence === Sequence.AgenticTraces
                          ? {
                              infoTooltip: showPowerEnvelope
                                ? legendT.powerBoundaryInfo
                                : legendT.optimalInfo,
                            }
                          : {}),
                      },
                      {
                        id: `${chartId}-pareto-frontier`,
                        label: legendT.paretoFrontier,
                        advanced: true,
                        checked: showParetoFrontier,
                        infoTooltip: legendT.paretoFrontierInfo,
                        onCheckedChange: (checked: boolean) => {
                          setShowParetoFrontier(checked);
                          track('inference_pareto_frontier_toggled', { enabled: checked });
                        },
                      },
                    ]
                  : []),
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
                  checked: useAdvancedLabels,
                  onCheckedChange: (checked: boolean) => {
                    setUseAdvancedLabels(checked);
                    track('latency_advanced_labels_toggled', { enabled: checked });
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
                  id: 'scatter-offloading-label',
                  label: legendT.offloadingLabel,
                  advanced: true,
                  checked: showOffloadingLabel,
                  onCheckedChange: (checked: boolean) => {
                    setShowOffloadingLabel(checked);
                    track('latency_offloading_label_toggled', { enabled: checked });
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
                    if (!checked) {
                      setPerfRulerState(clearPerfRulers);
                      persistedRulers?.discardPending();
                    }
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
                  },
                },
              ]}
              onAdvancedExpandedChange={(expanded) => {
                track('latency_advanced_controls_toggled', { enabled: expanded });
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
                          persistedRulers?.discardPending();
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
                gpu: pointsTable.hw,
                conc: row.conc,
                href: row.href ?? '',
              })
            }
          />
        )}
        {showFrontierPoints && (
          <FrontierPointsPanel
            chartId={chartId}
            eligible={globalParetoPoints}
            frontier={globalFrontier}
            xLabel={xLabel}
            yLabel={yLabel}
            overlayPoints={processedOverlayData}
            hardwareLabel={frontierHardwareLabel}
            hardwareColor={frontierHardwareColor}
          />
        )}
        {powerTelemetryPoint === null ? null : (
          <PowerTelemetryDialog
            key={powerTelemetryPoint.id}
            point={powerTelemetryPoint}
            onOpenChange={(open) => {
              if (!open) setPowerTelemetryPoint(null);
            }}
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
      </div>
    );
  },
);

ScatterGraph.displayName = 'ScatterGraph';

export default ScatterGraph;

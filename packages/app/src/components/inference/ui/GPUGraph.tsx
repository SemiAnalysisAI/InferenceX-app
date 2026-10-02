'use client';

import { useFeatureGate } from '@/lib/use-feature-gate';
import { getMeasuredMetricConfig } from '@/components/inference/measured-metric-config';
import { track } from '@/lib/analytics';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { useEphemeralUrlState } from '@/hooks/useUrlState';
import { rememberChartStateInUrl } from '@/lib/url-state';
import * as d3 from 'd3';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import ChartLegend from '@/components/ui/chart-legend';
import { Button } from '@/components/ui/button';
import { OFFICIAL_PREVIEW_SERIES } from '@/components/official-preview-notice';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { getHardwareConfig, hardwareKeyMatchesAnyBase } from '@/lib/constants';
import {
  getInferenceHardwareConfig,
  getInferenceRunLabel,
  getOverlayLineLabel,
} from '@/lib/inference-labels';
import { getChartWatermark, Sequence } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';
import { formatNumber, getDisplayLabel, updateRepoUrl } from '@/lib/utils';
import { useTraceAvailability } from '@/hooks/api/use-trace-availability';
import { useLogAvailability } from '@/hooks/api/use-log-availability';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import type {
  CustomLayerConfig,
  D3ChartHandle,
  RenderContext,
  ZoomContext,
} from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import {
  applyHoverState,
  applyNormalState,
  formatLargeNumber,
  getShapeKeyForPrecision,
  HIT_AREA_RADIUS,
  logTickFormat,
} from '@/lib/chart-rendering';
import { computeTooltipPosition } from '@/lib/d3-chart/layers/scatter-points';
import {
  attachOverlayXMarkerHandlers,
  overlayMarkerPosition,
  xMarkerPath,
} from '@/lib/d3-chart/overlay-x-marker';
import {
  overlayRooflineDasharray,
  overlayRunColor,
  overlayRunIndex,
} from '@/lib/overlay-run-style';
import type { ParetoDirection } from '@/lib/chart-utils';
import {
  chartFrontier,
  upperPowerEnvelope,
  isPowerCurveMetric,
  isPowerGaugeSeries,
  isMeasuredPowerCurveMetric,
} from '@/components/inference/utils/powerCurves';
import type {
  ChartDefinition,
  InferenceData,
  ScatterGraphProps,
} from '@/components/inference/types';
import { comparisonEntryLabel } from '@/components/inference/utils/comparisonEntry';
import { groupConcurrencySeries } from '@/components/inference/utils/concurrency-series';
import { matchesQuickFilters } from '@/components/inference/utils/quickFilters';
import {
  generateGPUGraphTooltipContent,
  generateOverlayTooltipContent,
} from '@/components/inference/utils/tooltipUtils';
import { useComparisonSeries } from '@/components/inference/hooks/useComparisonSeries';
import { usePowerTraceAction } from '@/components/inference/hooks/usePowerTraceAction';
import { pointLabelText } from '@/components/inference/ui/point-label';
import { scatterPointConfigId } from '@/components/inference/utils/point-identity';
import {
  type KnownIssueAnnotation,
  createKnownIssueLayer,
} from '@/components/inference/utils/knownIssueAnnotations';
import { matchKnownConfigIssues, pointMatchesIssue } from '@/lib/known-issues';
import { renderOffloadHalo } from '@/components/inference/utils/offload-halo';
import {
  isMeasuredEnergyConfigKey,
  isRoleLocalMeasuredEnergyConfigKey,
} from '@/components/inference/metric-registry';
import {
  keepPointLabelsInPlot,
  parallelismLabelBoxes,
  placeLineLabels,
  renderLineLabels,
  updateRenderedLineLabels,
  type LineLabelSeries,
} from '@/components/inference/ui/line-label-layer';
import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';

const PowerTelemetryDialog = dynamic(
  () =>
    import('@/components/inference/power-telemetry-dialog').then(
      (module) => module.PowerTelemetryDialog,
    ),
  { ssr: false },
);

const FixedSequenceLogDialog = dynamic(() =>
  import('@/components/inference/log-viewer/fixed-sequence-log-dialog').then(
    (module) => module.FixedSequenceLogDialog,
  ),
);

const CHART_MARGIN = { top: 24, right: 10, bottom: 60, left: 60 };

// Series id of an unofficial run: `overlay-run<index>_<hwKey>`. Official series
// ids are `${date}_${hwKey}`, the `activeDates` key.
const OVERLAY_SERIES_PREFIX = 'overlay-run';

// Label text combines the hw config (display label) and the date so
// both dimensions of the GPU comparison view are legible on the chart,
// not only the legend. Falls back to the raw hwKey if the config
// lookup misses (legacy data).
function hardwareLabelFor(pts: InferenceData[]): string {
  const hwKey = String(pts[0].hwKey);
  const cfg = getInferenceHardwareConfig(hwKey, pts[0].model, pts);
  return cfg ? getDisplayLabel(cfg) : hwKey;
}

function labelTextFor(pts: InferenceData[], numbering: Map<string, number>): string {
  return `${hardwareLabelFor(pts)} • ${comparisonEntryLabel(String(pts[0].date), numbering)}`;
}

const GPU_STRINGS = {
  en: {
    logScale: 'Log Scale',
    highContrast: 'High Contrast',
    optimalOnly: 'Optimal Only',
    showAllMeasurements: 'Show all measurements',
    powerBoundaryInfo:
      'Show only points on the upper measured power boundary. Turn off to show all measurements; the boundary stays the same. This is a power-load boundary, not an energy-efficiency frontier.',
    labels: 'Labels',
    parallelismLabels: 'Parallelism Labels',
    concurrencyLabels: '# Concurrent Sessions',
    lineLabels: 'Line Labels',
    resetFilter: 'Reset filter',
    quickFilters: (count: number) => (count > 0 ? `Quick Filters (${count})` : 'Quick Filters'),
    noData: 'No data available',
    noDataHint: 'Please change the model, sequence, precision, date range or chip selection.',
    noRoleEnergyDataHint:
      'This dataset does not report role-level prefill/decode energy. Choose a different model, scenario, precision, date, or measured-energy metric.',
    noMeasuredDataHint:
      'No measured GPU power is reported for this selection. Choose other chip configs, or a different model, scenario, precision or date.',
    unofficialTitle: (branch: string) => `UNOFFICIAL: ${branch}`,
  },
  zh: {
    logScale: '对数缩放',
    highContrast: '高对比度',
    optimalOnly: '仅最优',
    showAllMeasurements: '显示全部测量点',
    powerBoundaryInfo:
      '仅显示实测功率上边界上的点。关闭后显示全部测量点，边界曲线保持不变。这是功率负载边界，不是能效前沿。',
    labels: '标签',
    parallelismLabels: '并行配置标签',
    concurrencyLabels: '并发会话数',
    lineLabels: '曲线标签',
    resetFilter: '重置筛选',
    quickFilters: (count: number) => (count > 0 ? `快捷筛选（${count}）` : '快捷筛选'),
    noData: '暂无数据',
    noDataHint: '请调整模型、序列长度、精度、日期范围或芯片选项。',
    noRoleEnergyDataHint:
      '当前数据集未提供 Prefill/Decode 各角色的能耗数据。请选择其他模型、场景、精度、日期或实测能耗指标。',
    noMeasuredDataHint:
      '当前选择没有实测 GPU 功耗数据。请选择其他芯片配置，或更换模型、场景、精度或日期。',
    unofficialTitle: (branch: string) => `非官方：${branch}`,
  },
} as const;

const GPUGraph = React.memo(
  ({
    chartId,
    modelLabel,
    data,
    xLabel,
    yLabel,
    chartDefinition,
    caption,
    overlayData,
    runNumbering: providedRunNumbering,
  }: ScatterGraphProps) => {
    const { hardwareConfig } = useInferenceData();
    const {
      selectedPrecisions,
      selectedGPUs,
      selectedDateRange,
      selectedDates,
      selectedSequence,
      quickFilters,
      activeDates,
      lockedFrameworks,
      minimalChrome,
    } = useInferenceFilters();
    const {
      selectedYAxisMetric,
      hideNonOptimal: savedHideNonOptimal,
      showAllMeasurements: savedShowAllMeasurements,
      showPointLabels,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showConcurrencyLabels,
      highContrast,
      showLineLabels,
    } = useInferenceDisplay();
    const {
      setSelectedDates,
      toggleActiveDate,
      removeActiveDate,
      setHideNonOptimal,
      setShowAllMeasurements,
      setShowPointLabels,
      setLogScale,
      setIsLegendExpanded,
      setUseAdvancedLabels,
      setShowConcurrencyLabels,
      setHighContrast,
      selectAllActiveDates,
      setShowLineLabels,
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
      setQuickFilterPower,
      setQuickFilterTopologies,
    } = useInferenceActions();
    const locale = useLocale();
    const featureGateUnlocked = useFeatureGate();
    const showPowerTelemetry =
      featureGateUnlocked || getMeasuredMetricConfig(selectedYAxisMetric) !== undefined;
    const showPowerTelemetryRef = useRef(showPowerTelemetry);
    showPowerTelemetryRef.current = showPowerTelemetry;
    const legendT = GPU_STRINGS[locale];
    // The Concurrency axis plots observed load sweeps: no frontier or power
    // envelope, same as ScatterGraph.
    const isConcurrencyAxis = chartDefinition.x_scale_field === 'conc';
    const frontierDirection = isConcurrencyAxis
      ? undefined
      : (chartDefinition[`${selectedYAxisMetric}_roofline` as keyof ChartDefinition] as
          | ParetoDirection
          | undefined);
    const hideNonOptimal = Boolean(frontierDirection) && savedHideNonOptimal;
    const powerCurveMetric = isPowerCurveMetric(selectedYAxisMetric);
    const isMeasuredPowerAxis = isMeasuredPowerCurveMetric(selectedYAxisMetric);
    const powerEnvelopeMode =
      !isConcurrencyAxis && powerCurveMetric && (isMeasuredPowerAxis || !hideNonOptimal);
    const showAllMeasurements = isMeasuredPowerAxis ? !hideNonOptimal : savedShowAllMeasurements;
    const noDataHint = isRoleLocalMeasuredEnergyConfigKey(selectedYAxisMetric)
      ? legendT.noRoleEnergyDataHint
      : isMeasuredEnergyConfigKey(selectedYAxisMetric)
        ? legendT.noMeasuredDataHint
        : legendT.noDataHint;
    const ephemeralUrlState = useEphemeralUrlState();
    const chartRef = useRef<D3ChartHandle>(null);
    const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
    // A framework lock (embed routes) is not a user filter, so it is not counted.
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
      setQuickFilterSpec([]);
      setQuickFilterPower([]);
      setQuickFilterTopologies([]);
    }, [
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
      setQuickFilterPower,
      setQuickFilterTopologies,
    ]);

    const { runNumbering, allGraphs, paletteIdentity, resolveColor, getCssColor } =
      useComparisonSeries(providedRunNumbering);

    // Unofficial runs stay on this chart as their own (run, chip config)
    // series in the run's colour, next to the compared dates. Same gates as
    // ScatterGraph: precision, quick filters and overlay hardware selection;
    // dismissing a run removes its rows from `overlayData`.
    const { runIndexByUrl, unofficialRunInfos, activeOverlayHwTypes } = useUnofficialRun();
    const overlayPoints = useMemo(
      () =>
        (overlayData?.data ?? []).filter(
          (point) =>
            // Boundary / role siblings are a same-run comparison (see ChartDisplay).
            !point.powerVariant &&
            selectedPrecisions.includes(point.precision) &&
            matchesQuickFilters(point, quickFilters) &&
            activeOverlayHwTypes.has(String(point.hwKey)),
        ),
      [overlayData, selectedPrecisions, quickFilters, activeOverlayHwTypes],
    );
    const overlayPointSet = useMemo(() => new Set(overlayPoints), [overlayPoints]);
    const overlayRunOf = useCallback(
      (point: InferenceData) => overlayRunIndex(point.run_url ?? null, runIndexByUrl),
      [runIndexByUrl],
    );
    const overlaySeriesId = useCallback(
      (point: InferenceData) => `${OVERLAY_SERIES_PREFIX}${overlayRunOf(point)}_${point.hwKey}`,
      [overlayRunOf],
    );
    const seriesIdOf = useCallback(
      (point: InferenceData) =>
        overlayPointSet.has(point) ? overlaySeriesId(point) : `${point.date}_${point.hwKey}`,
      [overlayPointSet, overlaySeriesId],
    );

    // Removing a series from the legend should also drop it from the comparison
    // selection so the config changelog stays in sync (two-way binding). Legend
    // ids are `${entry}_${gpu}`; strip the gpu suffix to recover the entry. Range
    // endpoints aren't individual selections, so those fall back to a visibility hide.
    const handleLegendRemove = useCallback(
      (id: string) => {
        const gpu = selectedGPUs.find((g) => id.endsWith(`_${g}`));
        const entry = gpu ? id.slice(0, id.length - gpu.length - 1) : id;
        if (selectedDates.includes(entry)) {
          setSelectedDates((prev) => prev.filter((e) => e !== entry));
        } else {
          removeActiveDate(id);
        }
      },
      [selectedGPUs, selectedDates, setSelectedDates, removeActiveDate],
    );

    const groupedData = useMemo(() => {
      const groups: Record<string, InferenceData[]> = {};
      const add = (point: InferenceData) => {
        const key = `${seriesIdOf(point)}_${point.precision}`;
        (groups[key] ??= []).push(point);
      };
      data.forEach((point) => {
        if (selectedPrecisions.includes(point.precision)) add(point);
      });
      overlayPoints.forEach(add);
      return groups;
    }, [data, selectedPrecisions, overlayPoints, seriesIdOf]);

    // Track which date+GPU combos have actual data points
    const idsWithData = useMemo(() => {
      const ids = new Set<string>();
      for (const key of Object.keys(groupedData)) {
        // key = "seriesId_precision" — strip last segment
        const lastUnderscore = key.lastIndexOf('_');
        ids.add(key.slice(0, lastUnderscore));
      }
      return ids;
    }, [groupedData]);

    const paretoRooflines = useMemo(() => {
      const result: Record<string, InferenceData[]> = {};
      for (const key of Object.keys(groupedData)) {
        result[key] = chartFrontier(groupedData[key], frontierDirection).toSorted(
          (a, b) => a.x - b.x,
        );
      }
      return result;
    }, [groupedData, frontierDirection]);

    const rooflines = useMemo(() => {
      // One path per observed load sweep, never joined across runs or
      // topologies (see groupConcurrencySeries).
      if (isConcurrencyAxis) {
        const result: Record<string, InferenceData[]> = {};
        for (const [key, points] of Object.entries(groupedData)) {
          for (const [segment, sweep] of groupConcurrencySeries(points)) {
            result[`${key}__${encodeURIComponent(segment)}`] = sweep;
          }
        }
        return result;
      }
      if (!powerEnvelopeMode) return paretoRooflines;
      const result: Record<string, InferenceData[]> = {};
      for (const [key, points] of Object.entries(groupedData)) {
        result[key] = upperPowerEnvelope(
          points,
          chartDefinition.chartType !== 'e2e',
          isPowerGaugeSeries(selectedYAxisMetric, points[0]),
        );
      }
      return result;
    }, [
      isConcurrencyAxis,
      powerEnvelopeMode,
      groupedData,
      paretoRooflines,
      chartDefinition.chartType,
      selectedYAxisMetric,
    ]);

    const boundaryKeyOf = useCallback(
      (p: InferenceData) => `${seriesIdOf(p)}_${p.precision}-${p.x}-${p.y}`,
      [seriesIdOf],
    );
    const boundaryPointKeys = useMemo(() => {
      const keys = new Set<string>();
      Object.values(rooflines).forEach((pts) => pts.forEach((p) => keys.add(boundaryKeyOf(p))));
      return keys;
    }, [rooflines, boundaryKeyOf]);

    // Unofficial runs are not date series: the `activeDates` toggles leave them on.
    const activeData = useMemo(
      () =>
        Object.values(groupedData)
          .flat()
          .filter((p) => overlayPointSet.has(p) || activeDates.has(`${p.date}_${p.hwKey}`)),
      [groupedData, activeDates, overlayPointSet],
    );

    const filteredData = useMemo(() => {
      if (hideNonOptimal || (powerEnvelopeMode && !showAllMeasurements))
        return activeData.filter((p) => boundaryPointKeys.has(boundaryKeyOf(p)));
      return activeData;
    }, [
      activeData,
      hideNonOptimal,
      powerEnvelopeMode,
      showAllMeasurements,
      boundaryPointKeys,
      boundaryKeyOf,
    ]);
    // Official points join the scatter layer; unofficial ones draw as X markers.
    const officialPoints = useMemo(
      () => filteredData.filter((point) => !overlayPointSet.has(point)),
      [filteredData, overlayPointSet],
    );
    const visibleOverlayPoints = useMemo(
      () => filteredData.filter((point) => overlayPointSet.has(point)),
      [filteredData, overlayPointSet],
    );

    // Keep domains fixed so revealing off-boundary dots cannot move power curves.
    const scaleData = powerEnvelopeMode ? activeData : filteredData;

    // Only official DB-backed points have a benchmark_results id, a persisted
    // trace and logs; unofficial overlays cannot open those routes.
    const agenticIds = useMemo(
      () =>
        officialPoints.flatMap((point) =>
          point.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(point.id)
            ? [point.id]
            : [],
        ),
      [officialPoints],
    );
    const { data: traceAvailability } = useTraceAvailability(agenticIds);
    const traceAvailabilityRef = useRef(traceAvailability);
    traceAvailabilityRef.current = traceAvailability;

    // Log availability applies to every persisted official point in the
    // comparison, including fixed-sequence runs.
    const persistedPointIds = useMemo(
      () => officialPoints.flatMap((point) => (isPersistedBenchmarkId(point.id) ? [point.id] : [])),
      [officialPoints],
    );
    const { data: logAvailability } = useLogAvailability(persistedPointIds);
    const logAvailabilityRef = useRef(logAvailability);
    logAvailabilityRef.current = logAvailability;
    const [fixedLogPointId, setFixedLogPointId] = useState<number | null>(null);
    const [powerTelemetryPoint, setPowerTelemetryPoint] = useState<InferenceData | null>(null);

    // Warning annotations for visible series (official and unofficial) with
    // known upstream issues — same treatment the scatter view gets. Lines here
    // are colored per (gpu, date) pair, so take the first active pair's color
    // as the series swatch. Official-preview notices follow official data only.
    const knownIssueAnnotations = useMemo((): KnownIssueAnnotation[] => {
      const annotations: KnownIssueAnnotation[] = matchKnownConfigIssues(
        modelLabel,
        filteredData,
      ).map((issue) => {
        const cfg = getHardwareConfig(issue.hwKey, modelLabel);
        const colorEntry = allGraphs.find(
          (entry) => entry.hwKey === issue.hwKey && activeDates.has(entry.id),
        );
        return {
          issue,
          label: cfg ? getDisplayLabel(cfg) : issue.hwKey,
          color: getCssColor(colorEntry?.color ?? resolveColor(issue.hwKey)),
          points: filteredData
            .filter((p) => pointMatchesIssue(issue, p))
            .map((p) => ({ x: p.x, y: p.y })),
        };
      });
      for (const previewConfig of OFFICIAL_PREVIEW_SERIES) {
        const previewPoints = officialPoints.filter((point) =>
          hardwareKeyMatchesAnyBase(String(point.hwKey), previewConfig.baseGpuKeys),
        );
        if (previewPoints.length === 0) continue;

        const hwKey = String(previewPoints[0]!.hwKey);
        const colorEntry = allGraphs.find(
          (entry) => entry.hwKey === hwKey && activeDates.has(entry.id),
        );
        const previewCopy = previewConfig.strings[locale];
        annotations.push({
          preview: {
            id: previewConfig.id,
            summary: previewCopy.title,
            detail: previewCopy.chartDetail,
          },
          label: getDisplayLabel(getHardwareConfig(hwKey, modelLabel)),
          color: getCssColor(colorEntry?.color ?? resolveColor(hwKey)),
          points: previewPoints.map((point) => ({ x: point.x, y: point.y })),
        });
      }
      return annotations;
    }, [
      modelLabel,
      filteredData,
      officialPoints,
      allGraphs,
      activeDates,
      resolveColor,
      getCssColor,
      locale,
    ]);

    const knownIssueLayer = useMemo(
      () =>
        createKnownIssueLayer(
          () => ({
            chartId,
            annotations: knownIssueAnnotations,
            background: getCssColor('--background'),
            foreground: getCssColor('--foreground'),
            mutedForeground: getCssColor('--muted-foreground'),
            onLinkClick: (annotation) =>
              annotation.issue &&
              track('inference_known_issue_clicked', {
                hwKey: annotation.issue.hwKey,
                issue: annotation.issue.issueRef,
              }),
          }),
          paletteIdentity,
        ),
      [chartId, knownIssueAnnotations, getCssColor, paletteIdentity],
    );

    // Compute scale domains
    const xExtent = useMemo(() => {
      if (scaleData.length === 0) return [0, 100] as [number, number];
      const ext = d3.extent(scaleData, (d) => d.x) as [number, number];
      return [0, ext[1] * 1.05] as [number, number];
    }, [scaleData]);

    const yDomain = useMemo(() => {
      if (scaleData.length === 0) return [0, 100] as [number, number];
      const yExtent = d3.extent(scaleData, (d) => d.y) as [number, number];
      const yRange = yExtent[1] - yExtent[0];
      let yMin: number;
      if (logScale) {
        const dataMin = yExtent[0];
        yMin =
          dataMin <= 0 ? 0.1 : dataMin < 1 ? 10 ** Math.floor(Math.log10(dataMin)) : dataMin * 0.95;
      } else {
        yMin = Math.max(0, yExtent[0] - yRange * 0.05);
      }
      return [yMin, yExtent[1] * 1.05] as [number, number];
    }, [scaleData, logScale]);

    const pointIdentity = useCallback(
      (point: InferenceData) =>
        overlayPointSet.has(point)
          ? `overlay:${overlaySeriesId(point)}:${scatterPointConfigId(point)}`
          : `${point.date}:${scatterPointConfigId(point)}`,
      [overlayPointSet, overlaySeriesId],
    );
    const dataIdentity = useMemo(
      () => filteredData.map(pointIdentity).toSorted().join('|'),
      [filteredData, pointIdentity],
    );
    // Tooltip-only trace availability is deliberately excluded from chart
    // identity; the long-lived D3 content callback reads its latest value via
    // traceAvailabilityRef.
    const metricIdentity = useMemo(
      () =>
        [
          useAdvancedLabels ? 'advanced-labels' : 'basic-labels',
          showConcurrencyLabels ? 'conc-labels' : 'no-conc-labels',
          selectedYAxisMetric,
          powerEnvelopeMode ? 'power-envelope' : 'pareto-curves',
          `linear:${xExtent.join(',')}`,
          `${logScale ? 'log' : 'linear'}:${yDomain.join(',')}`,
          ...filteredData.map((point) => `${pointIdentity(point)}:${point.x}:${point.y}`),
        ]
          .toSorted()
          .join('|'),
      [
        selectedYAxisMetric,
        powerEnvelopeMode,
        useAdvancedLabels,
        showConcurrencyLabels,
        xExtent,
        logScale,
        yDomain,
        filteredData,
        pointIdentity,
      ],
    );

    // Color resolver for points/rooflines; an unofficial run keeps its run color.
    const getColor = useMemo(
      () => (d: InferenceData) => {
        if (overlayPointSet.has(d)) return overlayRunColor(overlayRunOf(d));
        const graphIndex = allGraphs.findIndex(
          ({ date, hwKey }) => d.date === date && d.hwKey === hwKey,
        );
        return graphIndex === -1 ? '#6b7280' : allGraphs[graphIndex].color;
      },
      [allGraphs, overlayPointSet, overlayRunOf],
    );

    const getRooflineColor = useMemo(
      () => (key: string) => {
        const point = rooflines[key]?.[0];
        return point ? getColor(point) : '#6b7280';
      },
      [rooflines, getColor],
    );

    const isRooflineVisible = useMemo(
      () => (key: string) => {
        const point = rooflines[key]?.[0];
        if (point === undefined) return false;
        return overlayPointSet.has(point) || activeDates.has(`${point.date}_${point.hwKey}`);
      },
      [activeDates, rooflines, overlayPointSet],
    );

    // Unofficial-run curves keep the run's dash, as in ScatterGraph.
    const getRooflineDasharray = useCallback(
      (key: string) => {
        const point = rooflines[key]?.[0];
        return point && overlayPointSet.has(point)
          ? overlayRooflineDasharray(overlayRunOf(point))
          : null;
      },
      [rooflines, overlayPointSet, overlayRunOf],
    );

    // ── Line labels (date along each roofline) ──
    // One label per (date, hwKey) pair — keys with multiple precisions for the
    // same combo dedupe down to the longest roofline so the label rides the
    // line that has the most placement options. Labels track the active filter
    // (`activeDates`) so removing a series via the legend hides its label too.
    const lineLabelLayer: CustomLayerConfig = useMemo(() => {
      const buildSeries = (): LineLabelSeries<InferenceData>[] => {
        const bestByGraph = new Map<
          string,
          { key: string; graphId: string; points: InferenceData[] }
        >();
        for (const [key, points] of Object.entries(rooflines)) {
          if (points.length < 2 || !isRooflineVisible(key)) continue;
          const graphId = seriesIdOf(points[0]);
          const previous = bestByGraph.get(graphId);
          if (!previous || points.length > previous.points.length) {
            bestByGraph.set(graphId, { key, graphId, points });
          }
        }
        // Runs drawing the same hardware need a run tag on their pills.
        const overlayRunsByHw = new Map<string, Set<number>>();
        for (const { points } of bestByGraph.values()) {
          if (!overlayPointSet.has(points[0])) continue;
          const hwKey = String(points[0].hwKey);
          const runs = overlayRunsByHw.get(hwKey) ?? new Set<number>();
          overlayRunsByHw.set(hwKey, runs.add(overlayRunOf(points[0])));
        }
        const overlayLabelFor = (points: InferenceData[]) => {
          const info = unofficialRunInfos[overlayRunOf(points[0])];
          const hardwareLabel = hardwareLabelFor(points);
          const sharesHardware = (overlayRunsByHw.get(String(points[0].hwKey))?.size ?? 0) > 1;
          return info ? getOverlayLineLabel(hardwareLabel, info, sharesHardware) : hardwareLabel;
        };
        return [...bestByGraph.values()].map(({ key, graphId, points }) => ({
          key,
          seriesId: graphId,
          label: overlayPointSet.has(points[0])
            ? overlayLabelFor(points)
            : labelTextFor(points, runNumbering),
          color: getRooflineColor(key),
          points,
        }));
      };
      const placeLabels = (
        xScale: ContinuousScale,
        yScale: ContinuousScale,
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
      ) => {
        if (!showLineLabels) return [];
        const series = buildSeries();
        // Both chart types spread labels along their lines with collision
        // avoidance — endpoint-only placement stacked every label at the
        // right edge of the e2e latency chart.
        return placeLineLabels(series, xScale, yScale, {
          collisionWidth: 160,
          obstacles: parallelismLabelBoxes(zoomGroup.node()),
        });
      };

      return {
        type: 'custom',
        key: 'line-labels',
        displayIdentity: `${showLineLabels ? 'visible' : 'hidden'}:${paletteIdentity}`,
        render: (zoomGroup, ctx) => {
          renderLineLabels(
            zoomGroup,
            placeLabels(ctx.xScale as ContinuousScale, ctx.yScale as ContinuousScale, zoomGroup),
            {
              seriesAttribute: 'data-graph-id',
              opacity: showLineLabels ? 0.95 : 0,
            },
          );
        },
        onDisplayUpdate: (zoomGroup, ctx) => {
          const transform = d3.zoomTransform(ctx.layout.svg.node()!);
          renderLineLabels(
            zoomGroup,
            placeLabels(
              transform.rescaleX(ctx.xScale as ContinuousScale),
              transform.rescaleY(ctx.yScale as ContinuousScale),
              zoomGroup,
            ),
            {
              seriesAttribute: 'data-graph-id',
              opacity: showLineLabels ? 0.95 : 0,
            },
          );
          zoomGroup.selectAll('.line-label').raise();
        },
        onZoom: (zoomGroup, ctx) => {
          updateRenderedLineLabels(
            zoomGroup,
            placeLabels(
              ctx.newXScale as ContinuousScale,
              ctx.newYScale as ContinuousScale,
              zoomGroup,
            ),
            { opacity: showLineLabels ? 0.95 : 0 },
          );
        },
      };
    }, [
      showLineLabels,
      rooflines,
      isRooflineVisible,
      getRooflineColor,
      chartDefinition.chartType,
      runNumbering,
      paletteIdentity,
      seriesIdOf,
      overlayPointSet,
      overlayRunOf,
      unofficialRunInfos,
    ]);

    // Dismiss tooltip when pinned point's series is hidden
    useEffect(() => {
      const handle = chartRef.current;
      const pp = handle?.getPinnedPoint() as InferenceData | null;
      if (!pp) return;
      const visible = handle?.getPinnedPointIsOverlay()
        ? activeOverlayHwTypes.has(String(pp.hwKey))
        : activeDates.has(`${pp.date}_${pp.hwKey}`);
      if (!visible) handle?.dismissTooltip();
    }, [activeDates, activeOverlayHwTypes]);

    // Dismiss on filter changes
    useEffect(() => {
      chartRef.current?.dismissTooltip();
    }, [
      selectedPrecisions,
      selectedYAxisMetric,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      showAllMeasurements,
      overlayData,
    ]);

    // One legend group per unofficial run (grouped legends split on the first
    // word of `name`), one row per chip config the run draws. Runs are
    // dismissed from the banner, not the legend.
    const overlayLegendItems = useMemo(() => {
      const bySeries = new Map<string, InferenceData[]>();
      for (const point of overlayPoints) {
        const id = overlaySeriesId(point);
        bySeries.set(id, [...(bySeries.get(id) ?? []), point]);
      }
      return [...bySeries].map(([id, points]) => {
        const runIndex = overlayRunOf(points[0]);
        const info = unofficialRunInfos[runIndex];
        const branch = info?.branch || (info ? `run ${info.id}` : id);
        return {
          name: `unofficial-run-${info?.id ?? runIndex} ${points[0].hwKey}`,
          hw: id,
          label: getInferenceRunLabel(`✕ ${hardwareLabelFor(points)}`, points),
          color: overlayRunColor(runIndex),
          title: legendT.unofficialTitle(branch),
          isActive: true,
          isRemovable: false,
          onClick: () => {},
        };
      });
    }, [overlayPoints, overlaySeriesId, overlayRunOf, unofficialRunInfos, legendT]);

    // ── Unofficial-run points: ScatterGraph's X markers in the run color. The
    // run curves go through the roofline layer; index keys let repeated
    // observations of one config all draw. ──
    const attachPowerTraceAction = usePowerTraceAction(chartRef);
    const overlayPointsLayer: CustomLayerConfig = useMemo(() => {
      const updateLabels = (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        zoomGroup
          .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
          .each(function (d) {
            const lines = pointLabelText(d, useAdvancedLabels, showConcurrencyLabels).split('\n');
            d3.select(this)
              .selectAll<SVGTextElement, boolean>('.overlay-label')
              .data([true])
              .join('text')
              .attr('class', 'overlay-label')
              .attr('text-anchor', 'middle')
              .attr('font-size', px(CHART_TYPE.dataLabel))
              .attr('font-weight', '700')
              .attr('pointer-events', 'none')
              .style('fill', 'var(--foreground)')
              .style('display', showPointLabels ? '' : 'none')
              .selectAll<SVGTSpanElement, string>('tspan')
              .data(lines)
              .join('tspan')
              .attr('x', 0)
              .attr('dy', (_line, i) =>
                i === 0 ? `${-(1 + (lines.length - 1) * 1.1)}em` : '1.1em',
              )
              .text((line) => line);
          });
      };
      return {
        type: 'custom',
        key: 'overlay-points',
        displayIdentity: `labels:${showPointLabels}`,
        render: (zoomGroup, ctx) => {
          const xScale = ctx.xScale as ContinuousScale;
          const yScale = ctx.yScale as ContinuousScale;
          const marks = zoomGroup
            .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
            .data(visibleOverlayPoints, (_d, i) => String(i))
            .join((enter) => {
              const g = enter.append('g').attr('class', 'unofficial-overlay-pt');
              g.append('circle')
                .attr('r', HIT_AREA_RADIUS)
                .attr('fill', 'transparent')
                .attr('cursor', 'pointer');
              g.append('path')
                .attr('class', 'visible-shape overlay-x')
                .attr('d', xMarkerPath(5, 0.7))
                .attr('fill', 'none')
                .attr('stroke-width', 2.5)
                .attr('stroke-linecap', 'round')
                .attr('cursor', 'pointer');
              return g;
            });
          marks.attr('transform', (d) => `translate(${xScale(d.x)},${yScale(d.y)})`);
          marks.select('.overlay-x').attr('stroke', (d) => overlayRunColor(overlayRunOf(d)));
          marks.each(function (d) {
            renderOffloadHalo(d3.select(this), d, overlayRunColor(overlayRunOf(d)));
          });
          updateLabels(zoomGroup);

          const container = ctx.layout.svg.node()!.parentElement as HTMLDivElement;
          const tooltip = d3.select(ctx.tooltipElement);
          attachOverlayXMarkerHandlers(marks, {
            markerSelector: '.overlay-x',
            normalPath: xMarkerPath(5, 0.7),
            hoverPath: xMarkerPath(7, 0.7),
            tooltip,
            handle: chartRef.current,
            content: (point, pinned) =>
              overlayData
                ? generateOverlayTooltipContent({
                    data: point,
                    isPinned: pinned,
                    xLabel,
                    yLabel,
                    selectedYAxisMetric,
                    hardwareConfig: overlayData.hardwareConfig,
                    overlayData,
                    locale,
                  })
                : '',
            position: (event) => {
              const [mouseX, mouseY] = d3.pointer(event, container);
              return computeTooltipPosition(mouseX, mouseY, tooltip, container);
            },
            rulers: {
              show: (point, marker) => {
                const position = overlayMarkerPosition(marker) ?? {
                  x: xScale(point.x),
                  y: yScale(point.y),
                };
                zoomGroup.select('.ruler-group').style('display', 'block');
                zoomGroup.select('.vertical-ruler').attr('x1', position.x).attr('x2', position.x);
                zoomGroup.select('.horizontal-ruler').attr('y1', position.y).attr('y2', position.y);
              },
              hide: () => zoomGroup.select('.ruler-group').style('display', 'none'),
            },
            onClick: (point) => {
              track('gpu_timeseries_data_point_clicked', {
                hw: String(point.hwKey),
                x: point.x,
                y: point.y,
                overlay: true,
              });
              attachPowerTraceAction(ctx.tooltipElement, point, true);
            },
          });
        },
        onDisplayUpdate: updateLabels,
        onZoom: (zoomGroup, ctx) => {
          const xScale = ctx.newXScale as ContinuousScale;
          const yScale = ctx.newYScale as ContinuousScale;
          zoomGroup
            .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
            .attr('transform', (d) => `translate(${xScale(d.x)},${yScale(d.y)})`);
        },
      };
    }, [
      visibleOverlayPoints,
      overlayRunOf,
      overlayData,
      showPointLabels,
      useAdvancedLabels,
      showConcurrencyLabels,
      xLabel,
      yLabel,
      selectedYAxisMetric,
      locale,
      attachPowerTraceAction,
    ]);

    // Hover dimming animates via the inline `transition: opacity 150ms ease`
    // onRender puts on dots and rooflines — a single style write per node. A
    // d3 `.transition()` here would re-write opacity every animation frame,
    // each write restarting the CSS transition (transitionrun/cancel per node
    // per frame). Same rationale as ScatterGraph's hover handlers.
    const handleLegendHover = useCallback(
      (seriesId: string) => {
        const svg = chartRef.current?.getSvgElement?.();
        if (!svg) return;
        const root = d3.select(svg);
        root
          .selectAll<SVGGElement, InferenceData>('.dot-group')
          .style('opacity', (d) => (`${d.date}_${d.hwKey}` === seriesId ? 1 : 0.15));
        root
          .selectAll<SVGGElement, InferenceData>('.unofficial-overlay-pt')
          .style('opacity', (d) => (overlaySeriesId(d) === seriesId ? 1 : 0.15));
        root.selectAll<SVGPathElement, unknown>('.roofline-path').style('opacity', function () {
          const point = (d3.select(this).datum() as { points: InferenceData[] } | null)?.points[0];
          const series = point ? seriesIdOf(point) : '';
          return series === seriesId ? null : '0.15';
        });
      },
      [overlaySeriesId, seriesIdOf],
    );

    const handleLegendHoverEnd = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root.selectAll('.dot-group, .unofficial-overlay-pt').style('opacity', null);
      root.selectAll('.roofline-path').style('opacity', null);
    }, []);

    if (data.length === 0 && overlayPoints.length === 0) {
      return (
        <div className="relative w-full p-3">
          <div className="flex flex-col items-center justify-center min-h-100 text-center">
            <div className="text-muted-foreground">
              <svg
                className="mx-auto size-12 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-sm font-medium mb-1">{legendT.noData}</h3>
              <p className="text-xs">{noDataHint}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4"
                data-testid="gpu-empty-quick-filters"
                onClick={() => {
                  setQuickFiltersOpen(true);
                  track('inference_quick_filters_dialog_opened', { source: 'timeline_empty' });
                }}
              >
                {legendT.quickFilters(quickFilterCount)}
              </Button>
            </div>
          </div>
          <QuickFiltersDialog open={quickFiltersOpen} onOpenChange={setQuickFiltersOpen} />
        </div>
      );
    }

    const chart = (
      <D3Chart<InferenceData>
        ref={chartRef}
        // Embeds drop the zoom/pan hint line; the host page has its own caption.
        instructions={minimalChrome ? '' : undefined}
        chartId={chartId}
        dataIdentity={dataIdentity}
        metricIdentity={metricIdentity}
        displayIdentity={`${showPointLabels}:${paletteIdentity}:${selectedPrecisions.join(',')}`}
        data={officialPoints}
        margin={CHART_MARGIN}
        watermark={getChartWatermark()}
        testId="gpu-graph"
        grabCursor={true}
        caption={caption}
        xScale={{ type: 'linear', domain: xExtent, nice: true }}
        yScale={{ type: logScale ? 'log' : 'linear', domain: yDomain, nice: true }}
        xAxis={{
          label: xLabel,
          tickFormat: (d) => formatNumber(d as number),
          tickCount: 10,
        }}
        yAxis={{
          label: yLabel,
          tickFormat: logScale ? undefined : (d) => formatLargeNumber(d as number),
          tickCount: 10,
        }}
        layers={[
          {
            type: 'roofline',
            key: 'rooflines',
            rooflines: rooflines as Record<string, { x: number; y: number }[]>,
            config: {
              getColor: getRooflineColor,
              isVisible: isRooflineVisible,
              getDasharray: getRooflineDasharray,
              // Load sweeps join measured points; they are not fitted curves.
              curve: isConcurrencyAxis ? d3.curveLinear : d3.curveMonotoneX,
            },
          },
          {
            type: 'scatter',
            key: 'points',
            data: officialPoints,
            config: {
              getColor,
              hideLabels: !showPointLabels,
              // Match ScatterGraph: concurrency (C=) is appended only when the
              // advanced "# Concurrent Sessions" toggle is on, so compare-mode
              // points are annotated the same way as the single-run scatter
              // chart.
              getLabelText: (d) => pointLabelText(d, useAdvancedLabels, showConcurrencyLabels),
              foreground: 'var(--foreground)',
              dataAttrs: {
                series: (d) => `${d.date}_${d.hwKey}`,
              },
              selectedPrecisions,
            },
            keyFn: (point) => `${point.date}:${scatterPointConfigId(point)}`,
          },
          overlayPointsLayer,
          lineLabelLayer,
          knownIssueLayer,
        ]}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [1, 20],
          resetEventName: `gpu_timeseries_zoom_reset_${chartId}`,
          onReset: () => {
            track('interactivity_zoom_reset');
          },
          onZoom: (_event, ctx: ZoomContext) => {
            if (logScale) {
              const newYScale = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
              ctx.layout.yAxisGroup.call(
                d3.axisLeft(newYScale).ticks(10).tickFormat(logTickFormat(newYScale)) as any,
              );
            }
            // Zoom moves points toward the plot edges; keep their labels inside.
            if (showPointLabels) keepPointLabelsInPlot(ctx.layout.zoomGroup);
          },
        }}
        tooltip={{
          rulerType: 'crosshair',
          content: (d: InferenceData, isPinned: boolean) =>
            generateGPUGraphTooltipContent({
              data: d,
              isPinned,
              xLabel,
              yLabel,
              selectedYAxisMetric,
              hardwareConfig,
              showPowerTelemetry: showPowerTelemetryRef.current,
              runUrl: d.run_url ? updateRepoUrl(d.run_url) : undefined,
              hasTrace: isPersistedBenchmarkId(d.id)
                ? traceAvailabilityRef.current?.[d.id] === true
                : false,
              hasLog: isPersistedBenchmarkId(d.id)
                ? logAvailabilityRef.current?.[d.id] === true
                : false,
              locale,
            }),
          getRulerX: (d, xScale) => (xScale as d3.ScaleLinear<number, number>)(d.x),
          getRulerY: (d, yScale) => (yScale as d3.ScaleLinear<number, number>)(d.y),
          onHoverStart: (sel, d) =>
            applyHoverState(
              sel.select('.visible-shape') as any,
              getShapeKeyForPrecision(d.precision, selectedPrecisions),
            ),
          onHoverEnd: (sel, d) =>
            applyNormalState(
              sel.select('.visible-shape') as any,
              getShapeKeyForPrecision(d.precision, selectedPrecisions),
            ),
          onPointClick: (d: InferenceData) => {
            track('gpu_timeseries_data_point_clicked', {
              id: d.id,
              hw: String(d.hwKey),
              x: d.x,
              y: d.y,
            });
            const tooltipEl = chartRef.current?.getTooltipElement();
            if (!tooltipEl) return;
            const viewBtn = tooltipEl.querySelector('[data-action="view-charts"]');
            if (viewBtn && isPersistedBenchmarkId(d.id)) {
              viewBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                // Full-document navigation: stamp the chart state onto THIS
                // history entry first, or Back returns to a bare /inference
                // that rebuilds from defaults. Skipped in ephemeral scopes
                // (/model embeds): the store holds the primary dashboard's
                // state there, not this chart's.
                if (!ephemeralUrlState) rememberChartStateInUrl();
                track('gpu_timeseries_view_charts_opened', {
                  id: d.id,
                  hwKey: String(d.hwKey),
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
                track('inference_power_telemetry_opened', {
                  id: d.id,
                  hwKey: d.hwKey,
                  conc: d.conc,
                });
              });
            }
            const logsBtn = tooltipEl.querySelector('[data-action="view-logs"]');
            if (logsBtn && typeof d.id === 'number') {
              logsBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (d.benchmark_type !== 'agentic_traces') {
                  event.preventDefault();
                  setFixedLogPointId(d.id!);
                  chartRef.current?.dismissTooltip();
                }
                track('gpu_timeseries_view_logs_opened', {
                  id: d.id,
                  hwKey: String(d.hwKey),
                  conc: d.conc,
                  benchmarkType: d.benchmark_type ?? 'single_turn',
                });
              });
            }
            attachPowerTraceAction(tooltipEl, d, false);
            // Pinning updates D3Chart's React state. GPU comparison rebuilds
            // several inline layer configs on that render, whose cleanup can
            // briefly hide the otherwise-pinned portal tooltip. Restore its
            // pinned visibility after that render settles.
            requestAnimationFrame(() => {
              const pinnedTooltip = chartRef.current?.getTooltipElement();
              if (!pinnedTooltip || chartRef.current?.getPinnedPoint() !== d) return;
              pinnedTooltip.style.opacity = '1';
              pinnedTooltip.style.display = 'block';
              pinnedTooltip.style.pointerEvents = 'auto';
            });
          },
          attachToLayer: 1,
        }}
        onDisplayUpdate={(ctx: RenderContext) => {
          // Point labels are laid out only while visible (a hidden label has
          // no measurable box), so re-run the plot-bounds constraint once the
          // display phase has turned them back on.
          if (showPointLabels) keepPointLabelsInPlot(ctx.layout.zoomGroup);
        }}
        onRender={(ctx: RenderContext) => {
          // Apply log tick format on initial render (needs the built scale)
          if (logScale) {
            const yScale = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLogarithmic<
              number,
              number
            >;
            ctx.layout.yAxisGroup.call(
              d3.axisLeft(yScale).ticks(10).tickFormat(logTickFormat(yScale)) as any,
            );
          }
          // Set foreground color on scatter point labels
          ctx.layout.zoomGroup.selectAll('.point-label').style('fill', 'var(--foreground)');
          // Strict plot bounding box: a label that would be sliced by the clip
          // path flips to the other side of its point or slides inward.
          if (showPointLabels) keepPointLabelsInPlot(ctx.layout.zoomGroup);

          // CSS transitions for smooth opacity animation on legend hover —
          // the hover handlers write opacity once and let these animate.
          ctx.layout.zoomGroup
            .selectAll('.dot-group, .unofficial-overlay-pt, .roofline-path')
            .style('transition', 'opacity 150ms ease');

          // The offload halo stays inside the point group, so normal zoom
          // transforms carry it without a separate update pass.
          ctx.layout.zoomGroup
            .selectAll<SVGGElement, InferenceData>('.dot-group')
            .each(function (point) {
              renderOffloadHalo(d3.select(this), point, 'var(--foreground)');
            });
        }}
        legendElement={
          <ChartLegend
            variant="sidebar"
            grouped={true}
            disableActiveSort={true}
            onItemHover={handleLegendHover}
            onItemHoverEnd={handleLegendHoverEnd}
            onItemRemove={handleLegendRemove}
            legendItems={[
              ...overlayLegendItems,
              ...allGraphs
                .filter(({ id }) => idsWithData.has(id))
                .map(({ date, color, hwKey, id }) => ({
                  name: `${hwKey} ${comparisonEntryLabel(date, runNumbering)}`,
                  hw: id,
                  label: comparisonEntryLabel(date, runNumbering),
                  color,
                  title: getDisplayLabel(getHardwareConfig(hwKey, modelLabel)),
                  isActive: activeDates.has(id),
                  onClick: () => {
                    toggleActiveDate(id);
                    track('interactivity_date_toggled', { date, hw: hwKey });
                  },
                })),
            ]}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('interactivity_legend_expanded', { expanded });
            }}
            switches={[
              {
                id: 'gpu-log-scale',
                label: legendT.logScale,
                advanced: true,
                checked: logScale,
                onCheckedChange: (c) => {
                  setLogScale(c);
                  track('interactivity_log_scale_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-high-contrast',
                label: legendT.highContrast,
                advanced: true,
                checked: highContrast,
                onCheckedChange: (c) => {
                  setHighContrast(c);
                  track('interactivity_high_contrast_toggled', { enabled: c });
                },
              },
              ...(frontierDirection
                ? [
                    {
                      id: 'gpu-hide-non-optimal',
                      label: legendT.optimalOnly,
                      checked: hideNonOptimal,
                      ...(isMeasuredPowerAxis ? { infoTooltip: legendT.powerBoundaryInfo } : {}),
                      onCheckedChange: (c: boolean) => {
                        setHideNonOptimal(c);
                        track('interactivity_hide_non_optimal_toggled', { enabled: c });
                      },
                    },
                  ]
                : []),
              ...(powerEnvelopeMode && !isMeasuredPowerAxis
                ? [
                    {
                      id: 'gpu-show-all-measurements',
                      label: legendT.showAllMeasurements,
                      checked: showAllMeasurements,
                      onCheckedChange: (c: boolean) => {
                        setShowAllMeasurements(c);
                        track('gpu_timeseries_show_all_measurements_toggled', { enabled: c });
                      },
                    },
                  ]
                : []),
              {
                id: 'gpu-point-labels',
                label: legendT.labels,
                advanced: true,
                checked: showPointLabels,
                onCheckedChange: (c) => {
                  setShowPointLabels(c);
                  track('interactivity_point_labels_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-parallelism-labels',
                label: legendT.parallelismLabels,
                advanced: true,
                checked: useAdvancedLabels,
                onCheckedChange: (c) => {
                  setUseAdvancedLabels(c);
                  track('interactivity_advanced_labels_toggled', { enabled: c });
                  // Parallelism labels are point labels; turning them on is
                  // pointless if labels are hidden, so auto-enable Labels.
                  if (c && !showPointLabels) setShowPointLabels(true);
                },
              },
              {
                id: 'gpu-line-labels',
                label: legendT.lineLabels,
                advanced: true,
                checked: showLineLabels,
                onCheckedChange: (c) => {
                  setShowLineLabels(c);
                  track('interactivity_line_labels_toggled', { enabled: c });
                },
              },
              {
                id: 'gpu-concurrency-labels',
                label: legendT.concurrencyLabels,
                advanced: true,
                checked: showConcurrencyLabels,
                onCheckedChange: (c) => {
                  setShowConcurrencyLabels(c);
                  track('interactivity_concurrency_labels_toggled', { enabled: c });
                  // Concurrency is a point-label annotation; turning it on is
                  // pointless if labels are hidden, so auto-enable Labels.
                  if (c && !showPointLabels) setShowPointLabels(true);
                },
              },
            ]}
            actions={[
              {
                id: 'gpu-reset-filter',
                label: legendT.resetFilter,
                onClick: () => {
                  selectAllActiveDates();
                  clearQuickFilters();
                  track('gpu_timeseries_reset_filter');
                },
              },
              {
                id: 'gpu-quick-filters',
                label: legendT.quickFilters(quickFilterCount),
                onClick: () => {
                  setQuickFiltersOpen(true);
                  track('inference_quick_filters_dialog_opened', { source: 'timeline_legend' });
                },
              },
            ]}
            hideAtomFootnote
            readOnly={minimalChrome}
            keyIndicators={
              <>
                {fixedLogPointId === null ? null : (
                  <FixedSequenceLogDialog
                    pointId={fixedLogPointId}
                    onOpenChange={(open) => {
                      if (!open) setFixedLogPointId(null);
                    }}
                  />
                )}
                <QuickFiltersDialog open={quickFiltersOpen} onOpenChange={setQuickFiltersOpen} />
              </>
            }
          />
        }
      />
    );

    return (
      <>
        {powerTelemetryPoint === null ? null : (
          <PowerTelemetryDialog
            key={powerTelemetryPoint.id}
            point={powerTelemetryPoint}
            onOpenChange={(open) => {
              if (!open) setPowerTelemetryPoint(null);
            }}
          />
        )}
        {chart}
      </>
    );
  },
);

GPUGraph.displayName = 'GPUGraph';
export default GPUGraph;

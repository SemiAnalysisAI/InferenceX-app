'use client';

import { track } from '@/lib/analytics';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { useEphemeralUrlState } from '@/hooks/useUrlState';
import { rememberChartStateInUrl } from '@/lib/url-state';
import * as d3 from 'd3';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import ChartLegend from '@/components/ui/chart-legend';
import { Button } from '@/components/ui/button';
import { OFFICIAL_PREVIEW_SERIES } from '@/components/official-preview-notice';
import { getHardwareConfig, getModelSortIndex, hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { getChartWatermark, Sequence } from '@/lib/data-mappings';
import { generateGpuDateColors, generateHighContrastGpuDateColors } from '@/lib/dynamic-colors';
import { useLocale } from '@/lib/use-locale';
import { formatNumber, getDisplayLabel, updateRepoUrl } from '@/lib/utils';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTraceAvailability } from '@/hooks/api/use-trace-availability';
import { useLogAvailability } from '@/hooks/api/use-log-availability';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
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
  logTickFormat,
} from '@/lib/chart-rendering';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';
import { canonicalParetoIntersection } from '@/components/inference/utils/canonicalFrontier';
import type {
  ChartDefinition,
  InferenceData,
  ScatterGraphProps,
} from '@/components/inference/types';
import {
  buildRunNumbering,
  comparisonEntryLabel,
  comparisonEntrySortValue,
  resolveComparisonEntries,
} from '@/components/inference/utils/comparisonEntry';
import { generateGPUGraphTooltipContent } from '@/components/inference/utils/tooltipUtils';
import { pointLabelText } from '@/components/inference/ui/point-label';
import { scatterPointConfigId } from '@/components/inference/utils/point-identity';
import {
  type KnownIssueAnnotation,
  createKnownIssueLayer,
} from '@/components/inference/utils/knownIssueAnnotations';
import { matchKnownConfigIssues, pointMatchesIssue } from '@/lib/known-issues';
import { renderOffloadHalo } from '@/components/inference/utils/offload-halo';
import {
  parallelismLabelBoxes,
  placeLineLabels,
  placeEndpointLineLabels,
  renderLineLabels,
  updateRenderedLineLabels,
  type LineLabelSeries,
} from '@/components/inference/ui/line-label-layer';
import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';

const FixedSequenceLogDialog = dynamic(() =>
  import('@/components/inference/log-viewer/fixed-sequence-log-dialog').then(
    (module) => module.FixedSequenceLogDialog,
  ),
);

const CHART_MARGIN = { top: 24, right: 10, bottom: 60, left: 60 };

// Label text combines the hw config (display label) and the date so
// both dimensions of the GPU comparison view are legible on the chart,
// not only the legend. Falls back to the raw hwKey if the config
// lookup misses (legacy data).
function labelTextFor(pts: InferenceData[], numbering: Map<string, number>): string {
  const hwKey = String(pts[0].hwKey);
  const cfg = getHardwareConfig(hwKey, pts[0].model);
  const hwLabel = cfg ? getDisplayLabel(cfg) : hwKey;
  return `${hwLabel} • ${comparisonEntryLabel(String(pts[0].date), numbering)}`;
}

const GPU_STRINGS = {
  en: {
    logScale: 'Log Scale',
    highContrast: 'High Contrast',
    optimalOnly: 'Optimal Only',
    labels: 'Labels',
    parallelismLabels: 'Parallelism Labels',
    concurrencyLabels: '# Concurrent Sessions',
    lineLabels: 'Line Labels',
    resetFilter: 'Reset filter',
    quickFilters: (count: number) => (count > 0 ? `Quick Filters (${count})` : 'Quick Filters'),
    noData: 'No data available',
    noDataHint: 'Please change the model, sequence, precision, date range or chip selection.',
  },
  zh: {
    logScale: '对数缩放',
    highContrast: '高对比度',
    optimalOnly: '仅最优',
    labels: '标签',
    parallelismLabels: '并行配置标签',
    concurrencyLabels: '并发会话数',
    lineLabels: '曲线标签',
    resetFilter: '重置筛选',
    quickFilters: (count: number) => (count > 0 ? `快捷筛选（${count}）` : '快捷筛选'),
    noData: '暂无数据',
    noDataHint: '请调整模型、序列长度、精度、日期范围或芯片选项。',
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
    } = useInferenceFilters();
    const {
      selectedYAxisMetric,
      hideNonOptimal,
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
    } = useInferenceActions();
    const locale = useLocale();
    const legendT = GPU_STRINGS[locale];
    const ephemeralUrlState = useEphemeralUrlState();
    const { resolvedTheme } = useTheme();
    const chartRef = useRef<D3ChartHandle>(null);
    const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
    const quickFilterCount =
      quickFilters.vendors.length +
      quickFilters.frameworks.length +
      quickFilters.deployment.length +
      (selectedSequence === Sequence.AgenticTraces ? 0 : quickFilters.spec.length);
    const clearQuickFilters = useCallback(() => {
      setQuickFilterVendors([]);
      setQuickFilterFrameworks([]);
      setQuickFilterDeployment([]);
      setQuickFilterSpec([]);
    }, [
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDeployment,
      setQuickFilterSpec,
    ]);

    // Shared date+GPU pairs. `dates` holds comparison-series entries (plain dates
    // and/or specific-run entries); a same-day range endpoint is dropped when that
    // date also has run entries (resolveComparisonEntries), then sorted earliest →
    // latest so a day's runs read #1 → #N.
    const gpuDatePairs = useMemo(() => {
      const deduplicated = resolveComparisonEntries(selectedDates, selectedDateRange);
      deduplicated.sort((a, b) => {
        const [ta, ia] = comparisonEntrySortValue(a);
        const [tb, ib] = comparisonEntrySortValue(b);
        return ta - tb || ia - ib;
      });
      const sortedGPUs = [...selectedGPUs].toSorted(
        (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
      );
      return { dates: deduplicated, sortedGPUs };
    }, [selectedDateRange, selectedDates, selectedGPUs]);

    // Run numbers for legend/line labels. Prefer the stable numbering passed by
    // the parent (shared with the changelog, so labels match it and removed runs
    // leave a gap); fall back to gap-free numbering of the on-chart series.
    const runNumbering = useMemo(
      () => providedRunNumbering ?? buildRunNumbering(gpuDatePairs.dates),
      [providedRunNumbering, gpuDatePairs.dates],
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

    const graphIdentifiers = useMemo(() => {
      const ids: string[] = [];
      gpuDatePairs.sortedGPUs.forEach((gpu) =>
        gpuDatePairs.dates.forEach((date) => ids.push(`${date}_${gpu}`)),
      );
      return ids;
    }, [gpuDatePairs]);

    // High contrast keys off the GPU (not `date_gpu`) so each hardware config
    // gets exactly one hue; the dates within a config are separated by the
    // lightness ramp built below rather than by unrelated hues.
    const { resolveColor, getCssColor } = useThemeColors({
      highContrast,
      identifiers: graphIdentifiers,
      hcKeys: gpuDatePairs.sortedGPUs,
    });

    // Dynamic GPU×date color map
    const gpuDateColorMap = useMemo(() => {
      const { dates, sortedGPUs } = gpuDatePairs;
      if (sortedGPUs.length === 0 || dates.length === 0) return {};
      const theme = resolvedTheme === 'dark' || resolvedTheme === 'minecraft' ? 'dark' : 'light';
      return generateGpuDateColors(sortedGPUs, dates.length, theme);
    }, [gpuDatePairs, resolvedTheme]);

    // High-contrast GPU×date color map: one iwanthue hue per GPU, ramped across
    // the compared dates so a config's runs stay recognisably the same color
    // while still reading oldest → newest.
    const hcGpuDateColorMap = useMemo(() => {
      const { dates, sortedGPUs } = gpuDatePairs;
      if (!highContrast || sortedGPUs.length === 0 || dates.length === 0) return {};
      const theme = resolvedTheme === 'dark' || resolvedTheme === 'minecraft' ? 'dark' : 'light';
      const baseColors: Record<string, string> = {};
      for (const gpu of sortedGPUs) baseColors[gpu] = getCssColor(resolveColor(gpu));
      return generateHighContrastGpuDateColors(baseColors, dates.length, theme);
    }, [gpuDatePairs, highContrast, resolvedTheme, resolveColor, getCssColor]);

    const allGraphs = useMemo(() => {
      const { dates, sortedGPUs } = gpuDatePairs;
      const result: { date: string; color: string; hwKey: string; id: string }[] = [];
      sortedGPUs.forEach((gpu) => {
        dates.forEach((date, dateIndex) => {
          const id = `${date}_${gpu}`;
          const compositeKey = `${dateIndex}_${gpu}`;
          const dynamicColor = gpuDateColorMap[compositeKey];
          result.push({
            date,
            hwKey: gpu,
            id,
            color: highContrast
              ? hcGpuDateColorMap[compositeKey] || getCssColor(resolveColor(gpu))
              : dynamicColor || 'var(--foreground)',
          });
        });
      });
      return result;
    }, [gpuDatePairs, gpuDateColorMap, hcGpuDateColorMap, highContrast, resolveColor, getCssColor]);

    const paletteIdentity = useMemo(
      () =>
        [
          resolvedTheme ?? 'system',
          highContrast ? 'high-contrast' : 'standard',
          ...allGraphs.map(({ id, color }) => `${id}:${color}`),
        ].join('|'),
      [resolvedTheme, highContrast, allGraphs],
    );

    const groupedData = useMemo(
      () =>
        data.reduce(
          (acc, point) => {
            if (!selectedPrecisions.includes(point.precision)) return acc;
            const key = `${point.date}_${point.hwKey}_${point.precision}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(point);
            return acc;
          },
          {} as Record<string, InferenceData[]>,
        ),
      [data, selectedPrecisions],
    );

    // Track which date+GPU combos have actual data points
    const idsWithData = useMemo(() => {
      const ids = new Set<string>();
      for (const key of Object.keys(groupedData)) {
        // key = "date_hwKey_precision" — strip last segment
        const lastUnderscore = key.lastIndexOf('_');
        ids.add(key.slice(0, lastUnderscore));
      }
      return ids;
    }, [groupedData]);

    const rooflines = useMemo(() => {
      const result: Record<string, InferenceData[]> = {};
      const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
      const dir = chartDefinition[rooflineKey] as ParetoDirection | undefined;
      const frontier = paretoFrontForDirection(dir ?? 'lower_right');
      for (const key of Object.keys(groupedData)) {
        const canonicalPoints = canonicalParetoIntersection(groupedData[key], dir ?? 'lower_right');
        result[key] = (
          canonicalPoints ?? frontier(groupedData[key].filter(isFrontierEligible))
        ).toSorted((a, b) => a.x - b.x);
      }
      return result;
    }, [groupedData, selectedYAxisMetric, chartDefinition]);

    const optimalPointKeys = useMemo(() => {
      const keys = new Set<string>();
      Object.values(rooflines).forEach((pts) =>
        pts.forEach((p) => keys.add(`${p.date}_${p.hwKey}_${p.precision}-${p.x}-${p.y}`)),
      );
      return keys;
    }, [rooflines]);

    const filteredData = useMemo(() => {
      let pts = Object.values(groupedData)
        .flat()
        .filter((p) => activeDates.has(`${p.date}_${p.hwKey}`));
      if (hideNonOptimal)
        pts = pts.filter((p) =>
          optimalPointKeys.has(`${p.date}_${p.hwKey}_${p.precision}-${p.x}-${p.y}`),
        );
      return pts;
    }, [groupedData, activeDates, hideNonOptimal, optimalPointKeys]);

    // GPU comparison currently renders official DB-backed points only. Unofficial
    // overlays have no benchmark_results id or persisted trace, so they cannot
    // open the dedicated per-point charts route.
    const agenticIds = useMemo(
      () =>
        filteredData.flatMap((point) =>
          point.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(point.id)
            ? [point.id]
            : [],
        ),
      [filteredData],
    );
    const { data: traceAvailability } = useTraceAvailability(agenticIds);
    const traceAvailabilityRef = useRef(traceAvailability);
    traceAvailabilityRef.current = traceAvailability;

    // Log availability applies to every persisted official point in the
    // comparison, including fixed-sequence runs.
    const persistedPointIds = useMemo(
      () => filteredData.flatMap((point) => (isPersistedBenchmarkId(point.id) ? [point.id] : [])),
      [filteredData],
    );
    const { data: logAvailability } = useLogAvailability(persistedPointIds);
    const logAvailabilityRef = useRef(logAvailability);
    logAvailabilityRef.current = logAvailability;
    const [fixedLogPointId, setFixedLogPointId] = useState<number | null>(null);

    // Warning annotations for visible series with known upstream issues —
    // same treatment the scatter view gets, applied to the date-comparison view.
    // Lines here are colored per (gpu, date) pair, so take the first active
    // pair's color as the series swatch.
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
        const previewPoints = filteredData.filter((point) =>
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
    }, [modelLabel, filteredData, allGraphs, activeDates, resolveColor, getCssColor, locale]);

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
      if (filteredData.length === 0) return [0, 100] as [number, number];
      const ext = d3.extent(filteredData, (d) => d.x) as [number, number];
      return [0, ext[1] * 1.05] as [number, number];
    }, [filteredData]);

    const yDomain = useMemo(() => {
      if (filteredData.length === 0) return [0, 100] as [number, number];
      const yExtent = d3.extent(filteredData, (d) => d.y) as [number, number];
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
    }, [filteredData, logScale]);

    const dataIdentity = useMemo(
      () =>
        filteredData
          .map((point) => `${point.date}:${scatterPointConfigId(point)}`)
          .toSorted()
          .join('|'),
      [filteredData],
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
          `linear:${xExtent.join(',')}`,
          `${logScale ? 'log' : 'linear'}:${yDomain.join(',')}`,
          ...filteredData.map(
            (point) => `${point.date}:${scatterPointConfigId(point)}:${point.x}:${point.y}`,
          ),
        ]
          .toSorted()
          .join('|'),
      [
        selectedYAxisMetric,
        useAdvancedLabels,
        showConcurrencyLabels,
        xExtent,
        logScale,
        yDomain,
        filteredData,
      ],
    );

    // Color resolver for points/rooflines
    const getColor = useMemo(
      () => (d: InferenceData) => {
        const graphIndex = allGraphs.findIndex(
          ({ date, hwKey }) => d.date === date && d.hwKey === hwKey,
        );
        return graphIndex === -1 ? '#6b7280' : allGraphs[graphIndex].color;
      },
      [allGraphs],
    );

    const getRooflineColor = useMemo(
      () => (key: string) => {
        const graphId = key.split('_').slice(0, -1).join('_');
        const graphIndex = allGraphs.findIndex((d) => d.id === graphId);
        return graphIndex === -1 ? '#6b7280' : allGraphs[graphIndex].color;
      },
      [allGraphs],
    );

    const isRooflineVisible = useMemo(
      () => (key: string) => {
        const graphId = key.split('_').slice(0, -1).join('_');
        return activeDates.has(graphId);
      },
      [activeDates],
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
          const graphId = key.slice(0, key.lastIndexOf('_'));
          const previous = bestByGraph.get(graphId);
          if (!previous || points.length > previous.points.length) {
            bestByGraph.set(graphId, { key, graphId, points });
          }
        }
        return [...bestByGraph.values()].map(({ key, graphId, points }) => ({
          key,
          seriesId: graphId,
          label: labelTextFor(points, runNumbering),
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
        return chartDefinition.chartType === 'interactivity'
          ? placeLineLabels(series, xScale, yScale, {
              collisionWidth: 160,
              obstacles: parallelismLabelBoxes(zoomGroup.node()),
            })
          : placeEndpointLineLabels(series, xScale, yScale);
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
    ]);

    // Dismiss tooltip when pinned point's combo is hidden
    useEffect(() => {
      const pp = chartRef.current?.getPinnedPoint() as InferenceData | null;
      if (pp && !activeDates.has(`${pp.date}_${pp.hwKey}`)) chartRef.current?.dismissTooltip();
    }, [activeDates]);

    // Dismiss on filter changes
    useEffect(() => {
      chartRef.current?.dismissTooltip();
    }, [selectedPrecisions, selectedYAxisMetric, selectedGPUs, selectedDates, selectedDateRange]);

    // Hover dimming animates via the inline `transition: opacity 150ms ease`
    // onRender puts on dots and rooflines — a single style write per node. A
    // d3 `.transition()` here would re-write opacity every animation frame,
    // each write restarting the CSS transition (transitionrun/cancel per node
    // per frame). Same rationale as ScatterGraph's hover handlers.
    const handleLegendHover = useCallback((seriesId: string) => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root
        .selectAll<SVGGElement, InferenceData>('.dot-group')
        .style('opacity', (d) => (`${d.date}_${d.hwKey}` === seriesId ? 1 : 0.15));
      root.selectAll<SVGPathElement, unknown>('.roofline-path').style('opacity', function () {
        const key = (d3.select(this).datum() as { key: string } | null)?.key ?? '';
        const series = key.slice(0, key.lastIndexOf('_'));
        return series === seriesId ? null : '0.15';
      });
    }, []);

    const handleLegendHoverEnd = useCallback(() => {
      const svg = chartRef.current?.getSvgElement?.();
      if (!svg) return;
      const root = d3.select(svg);
      root.selectAll('.dot-group').style('opacity', null);
      root.selectAll('.roofline-path').style('opacity', null);
    }, []);

    if (data.length === 0) {
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
              <p className="text-xs">{legendT.noDataHint}</p>
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

    return (
      <D3Chart<InferenceData>
        ref={chartRef}
        chartId={chartId}
        dataIdentity={dataIdentity}
        metricIdentity={metricIdentity}
        displayIdentity={`${showPointLabels}:${paletteIdentity}:${selectedPrecisions.join(',')}`}
        data={filteredData}
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
            },
          },
          {
            type: 'scatter',
            key: 'points',
            data: filteredData,
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

          // CSS transitions for smooth opacity animation on legend hover —
          // the hover handlers write opacity once and let these animate.
          ctx.layout.zoomGroup
            .selectAll('.dot-group, .roofline-path')
            .style('transition', 'opacity 150ms ease');

          // The halo stays inside the point group, so normal zoom transforms
          // carry it without a separate update pass.
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
            legendItems={allGraphs
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
              }))}
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
              {
                id: 'gpu-hide-non-optimal',
                label: legendT.optimalOnly,
                checked: hideNonOptimal,
                onCheckedChange: (c) => {
                  setHideNonOptimal(c);
                  track('interactivity_hide_non_optimal_toggled', { enabled: c });
                },
              },
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
            precisionIndicators={selectedPrecisions}
            hideAtomFootnote
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
  },
);

GPUGraph.displayName = 'GPUGraph';
export default GPUGraph;

'use client';
import {
  DISPLAY_MODEL_TO_DB,
  NORMALIZED_E2E_OUTPUT_TOKENS,
} from '@semianalysisai/inferencex-constants';
import { track } from '@/lib/analytics';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Table2, X } from 'lucide-react';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { useInference } from '@/components/inference/InferenceContext';
import type {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  OverlayData,
  TrendDataPoint,
} from '@/components/inference/types';
import {
  processOverlayChartData,
  selectUnofficialOverlayForMode,
} from '@/components/inference/utils';
import {
  isRunComparisonEntry,
  makeRunComparisonEntry,
} from '@/components/inference/utils/comparisonEntry';
import { dataRunsForDate } from '@/components/inference/utils/runEnumeration';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { exportToCsv } from '@/lib/csv-export';
import { inferenceChartToCsv } from '@/lib/csv-export-helpers';
import { knownIssueCsvNote, matchKnownConfigIssues } from '@/lib/known-issues';
import { getDisplayLabel } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import {
  type Model,
  type Precision,
  type Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
  sequenceKind,
} from '@/lib/data-mappings';
import { useComparisonChangelogs } from '@/hooks/api/use-comparison-changelogs';
import {
  useDerivedAgenticMetrics,
  type DerivedAgenticMetric,
} from '@/hooks/api/use-derived-agentic-metrics';
import { isAgenticOnlyXAxisMode, type XAxisMode } from '@/components/inference/hooks/useChartData';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import { useTrendData } from '@/components/inference/hooks/useTrendData';
import { getHardwareConfig, hardwareKeyMatchesAnyBase } from '@/lib/constants';

import ChartControls from './ChartControls';
import ComparisonChangelog from './ComparisonChangelog';
import CustomCosts from './CustomCosts';
import CustomPowers from './CustomPowers';
import GPUGraph from './GPUGraph';
import ReplayLauncher, { type ReplayLauncherHandle } from '../replay/ReplayLauncher';
import TrendChart from './TrendChart';

const ModelArchitectureDiagram = dynamic(() => import('./ModelArchitectureDiagram'), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});
import WorkflowInfoDisplay from './WorkflowInfoDisplay';

type InferenceViewMode = 'chart' | 'table';

const X_AXIS_MODE_BUTTONS: { value: XAxisMode; label: string }[] = [
  { value: 'ttft', label: 'TTFT' },
  { value: 'e2e', label: 'E2E Latency' },
  { value: 'normalized-e2e', label: 'Normalized E2E' },
  { value: 'interactivity', label: 'Interactivity' },
  { value: 'session-time', label: 'Session Time' },
  { value: 'prefill-tps', label: 'Prefill TPS / user' },
];

/**
 * Presentation + data plumbing for the trace-derived x-axis modes (the
 * agentic-only modes). One spec per mode keeps the x-label, chart heading,
 * roofline corner, and derived-metric accessor in sync instead of scattering
 * `selectedXAxisMode === …` conditionals through the render.
 */
interface DerivedXModeSpec {
  xLabel: (percentileLabel: string) => string;
  /** Chart heading suffix ("vs. …") shown above the plot. */
  heading: (percentileLabel: string) => string;
  rooflineCorner: 'upper_right' | 'upper_left';
  /** Pull the raw metric for this mode off the derived-metrics payload. */
  value: (m: DerivedAgenticMetric | undefined, percentile: string) => number | null | undefined;
  /** Convert the raw metric to the plotted x value. */
  toX: (raw: number) => number;
}

const DERIVED_X_MODE_SPECS: Partial<Record<XAxisMode, DerivedXModeSpec>> = {
  'session-time': {
    xLabel: () => 'Mean Normalized Session Time (min)',
    heading: () => 'vs. Mean Normalized Session Time',
    rooflineCorner: 'upper_right',
    value: (m) => m?.normalized_session_time_s,
    toX: (raw) => raw / 60,
  },
  'normalized-e2e': {
    xLabel: (pctl) => `${pctl} Normalized E2E @ ${NORMALIZED_E2E_OUTPUT_TOKENS} output tokens (s)`,
    heading: (pctl) => `vs. ${pctl} Normalized E2E @ ${NORMALIZED_E2E_OUTPUT_TOKENS} output tokens`,
    rooflineCorner: 'upper_right',
    value: (m, percentile) =>
      percentile === 'p75' ? m?.p75_normalized_e2e_400_s : m?.p90_normalized_e2e_400_s,
    toX: (raw) => raw,
  },
  'prefill-tps': {
    xLabel: () => 'P90 Prefill TPS per user (tok/s)',
    heading: () => 'vs. P90 Prefill TPS / user',
    rooflineCorner: 'upper_left',
    value: (m) => m?.p90_prefill_tps_per_user,
    toX: (raw) => raw,
  },
};

const VIEW_MODE_OPTIONS: SegmentedToggleOption<InferenceViewMode>[] = [
  {
    value: 'chart',
    label: 'Chart',
    icon: <BarChart3 className="size-3.5" />,
    testId: 'inference-chart-view-btn',
  },
  {
    value: 'table',
    label: 'Table',
    icon: <Table2 className="size-3.5" />,
    testId: 'inference-table-view-btn',
  },
];

/**
 * Renders the inference chart cards, captions, overlay controls, and trend drill-down dialog for
 * the current filtered benchmark data.
 */
export default function ChartDisplay() {
  const {
    graphs,
    loading,
    error,
    workflowInfo,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedGPUs,
    selectedPrecisions,
    selectedDates,
    setSelectedDates,
    selectedDateRange,
    dateRangeAvailableDates,
    selectedModel,
    selectedSequence,
    selectedRunDate,
    setIsLegendExpanded,
    trackedConfigs,
    removeTrackedConfig,
    clearTrackedConfigs,
    logScale,
    activeHwTypes,
    activeDates,
    selectedPercentile,
    compareGpuPair,
    selectedXAxisMode,
    setSelectedXAxisMode,
  } = useInference();

  const {
    changelogs,
    loading: changelogsLoading,
    totalDatesQueried,
  } = useComparisonChangelogs(selectedGPUs, selectedDateRange, dateRangeAvailableDates);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modelDbKeys = useMemo(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );

  // Stable run numbering shared by the changelog and the chart legend: each of a
  // date's runs gets a fixed 1-based number (by start time) regardless of which
  // are on the chart, so the two surfaces always show the same #N for a run and a
  // removed run leaves a matching gap. Built from the same data-run enumeration
  // the changelog uses.
  const runNumbering = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of changelogs) {
      dataRunsForDate(c.runConfigs, { modelDbKeys, selectedGPUs, selectedPrecisions }).forEach(
        (run, idx) => {
          map.set(makeRunComparisonEntry(c.date, run.runId), idx + 1);
        },
      );
    }
    return map;
  }, [changelogs, modelDbKeys, selectedGPUs, selectedPrecisions]);

  // Expand a plain-date selection into one entry per run once that date's runs are
  // known. Picking a date that has multiple runs shows each run as its own series
  // (matching the changelog, which renders a block per run) instead of a single
  // merged "latest" line with no changelog row — keeping the legend and changelog
  // in sync. Idempotent: after expansion no expandable plain date remains.
  useEffect(() => {
    const runConfigsByDate = new Map(changelogs.map((c) => [c.date, c.runConfigs]));
    const scope = { modelDbKeys, selectedGPUs, selectedPrecisions };
    setSelectedDates((prev) => {
      let changed = false;
      const out: string[] = [];
      for (const entry of prev) {
        if (isRunComparisonEntry(entry)) {
          out.push(entry);
          continue;
        }
        const rc = runConfigsByDate.get(entry);
        const runs = rc ? dataRunsForDate(rc, scope) : [];
        if (runs.length > 1) {
          changed = true;
          for (const run of runs) out.push(makeRunComparisonEntry(entry, run.runId));
        } else {
          out.push(entry);
        }
      }
      if (!changed) return prev;
      return [...new Set(out)];
    });
  }, [changelogs, modelDbKeys, selectedGPUs, selectedPrecisions, selectedDates, setSelectedDates]);

  const [viewModes, setViewModes] = useState<Record<number, InferenceViewMode>>({});
  const replayHandlesRef = useRef<Record<number, ReplayLauncherHandle | null>>({});
  const getViewMode = (index: number): InferenceViewMode => viewModes[index] ?? 'chart';
  const handleViewModeChange = (index: number, value: InferenceViewMode) => {
    setViewModes((prev) => ({ ...prev, [index]: value }));
    track('inference_view_changed', { view: value, chartIndex: index });
  };

  const {
    unofficialRunInfo,
    unofficialRunInfos,
    runIndexByUrl,
    getOverlayData,
    isUnofficialRun,
    activeOverlayHwTypes,
  } = useUnofficialRun();

  // Compute overlay data for each chart type — must match useChartData processing
  const overlayDataByChartType = useMemo(() => {
    if (!unofficialRunInfo || !getOverlayData) {
      return { e2e: null, interactivity: null };
    }

    const e2eRaw = getOverlayData(selectedModel, selectedSequence, 'e2e');
    const interactivityRaw = getOverlayData(selectedModel, selectedSequence, 'interactivity');

    // Per-row run lookup used by the overlay tooltip so hovering a point shows
    // its OWN run's branch, not the banner-level first-run fallback.
    const getRunForRow = (row: InferenceData) => {
      const url = row.run_url ?? null;
      if (!url) return undefined;
      if (url in runIndexByUrl) {
        const info = unofficialRunInfos[runIndexByUrl[url]];
        return info ? { branch: info.branch, url: info.url } : undefined;
      }
      const idMatch = url.match(/\/runs\/(?<runId>\d+)/u);
      if (idMatch && idMatch[1] in runIndexByUrl) {
        const info = unofficialRunInfos[runIndexByUrl[idMatch[1]]];
        return info ? { branch: info.branch, url: info.url } : undefined;
      }
      return undefined;
    };

    const processData = (
      rawData: { data: InferenceData[]; hardwareConfig: any } | null,
      chartType: 'e2e' | 'interactivity',
    ): OverlayData | null => {
      if (!rawData || rawData.data.length === 0) return null;

      const effectiveXMetric = chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;
      const processed = processOverlayChartData(
        rawData.data,
        chartType,
        selectedYAxisMetric,
        effectiveXMetric,
        { isAgentic: sequenceKind(selectedSequence) === 'agentic' },
      );

      let overlayPoints = processed;
      if (compareGpuPair?.length === 2) {
        overlayPoints = processed.filter((p) =>
          hardwareKeyMatchesAnyBase(String(p.hwKey), compareGpuPair),
        );
      }

      if (overlayPoints.length === 0) return null;

      const keySet = new Set(overlayPoints.map((p) => String(p.hwKey)));
      const hardwareConfigFiltered = Object.fromEntries(
        Object.entries(rawData.hardwareConfig).filter(([k]) => keySet.has(k)),
      ) as HardwareConfig;

      return {
        data: overlayPoints,
        hardwareConfig: hardwareConfigFiltered,
        label: unofficialRunInfo.branch,
        runUrl: unofficialRunInfo.url,
        getRunForRow,
      };
    };

    return {
      e2e: processData(e2eRaw, 'e2e'),
      interactivity: processData(interactivityRaw, 'interactivity'),
    };
  }, [
    unofficialRunInfo,
    unofficialRunInfos,
    runIndexByUrl,
    getOverlayData,
    selectedModel,
    selectedSequence,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    compareGpuPair,
  ]);

  // Resolve x-axis field per chart type for trend data
  const xAxisFieldByChartType = useMemo(() => {
    const result: Record<string, string> = {};
    for (const g of graphs) {
      const ct = g.chartDefinition.chartType;
      if (ct === 'e2e' && selectedE2eXAxisMetric) {
        result[ct] = selectedE2eXAxisMetric;
      }
      // interactivity uses chart-config defaults; no override needed here
    }
    return result;
  }, [graphs, selectedE2eXAxisMetric]);

  // Trend data for "Performance Over Time" drill-down
  const { trendLines } = useTrendData(
    trackedConfigs,
    selectedModel as Model,
    selectedSequence as Sequence,
    selectedYAxisMetric,
    xAxisFieldByChartType,
  );

  // Get the current Y-axis label from the first graph's chart definition
  const currentYLabel = useMemo(() => {
    if (graphs.length === 0) return '';
    const yLabelKey = `${selectedYAxisMetric}_label` as keyof (typeof graphs)[0]['chartDefinition'];
    return (graphs[0].chartDefinition[yLabelKey] as string) || '';
  }, [graphs, selectedYAxisMetric]);

  // Derive x-axis trend lines by swapping each point's x → value
  const xTrendLines = useMemo(() => {
    const result = new Map<string, TrendDataPoint[]>();
    for (const [configId, points] of trendLines) {
      result.set(
        configId,
        points.map((p) => ({ ...p, value: p.x })),
      );
    }
    return result;
  }, [trendLines]);

  // Get the current X-axis label from the chart definition matching the tracked config's chart type
  const currentXLabel = useMemo(() => {
    if (trackedConfigs.length === 0 || graphs.length === 0) return '';
    const chartType = trackedConfigs[0].chartType;
    const matchingGraph = graphs.find((g) => g.chartDefinition.chartType === chartType);
    return matchingGraph?.chartDefinition.x_label || '';
  }, [trackedConfigs, graphs]);

  if (!loading && error) {
    console.error(error);
    throw new Error('Something went wrong.');
  }

  // Show skeletons only on first load (no data yet). During refetch, keepPreviousData
  // keeps old graphs visible so we never flash skeletons when switching filters.
  const isFirstLoad = loading && graphs.length === 0;

  // When the selected model has no DB data but an unofficial run provides overlay
  // data for this (model, sequence), synthesize empty-data stub graphs from the
  // chart-config so the overlay has a base chart to render on.
  const effectiveGraphs = useMemo(() => {
    if (graphs.length > 0) return graphs;
    const hasOverlay =
      (overlayDataByChartType.e2e?.data.length ?? 0) > 0 ||
      (overlayDataByChartType.interactivity?.data.length ?? 0) > 0;
    if (!hasOverlay) return graphs;
    return (chartDefinitions as ChartDefinition[]).map((chartDefinition) => ({
      model: selectedModel,
      sequence: selectedSequence,
      chartDefinition,
      data: [] as InferenceData[],
    }));
  }, [graphs, overlayDataByChartType, selectedModel, selectedSequence]);

  const visibleGraphs = useMemo(() => {
    const wantedType = selectedXAxisMode === 'interactivity' ? 'interactivity' : 'e2e';
    const filtered = effectiveGraphs.filter((g) => g.chartDefinition.chartType === wantedType);
    return filtered.length > 0 ? filtered : effectiveGraphs;
  }, [effectiveGraphs, selectedXAxisMode]);

  const isAgenticSequence = sequenceKind(selectedSequence) === 'agentic';
  const useDerived = isAgenticSequence && isAgenticOnlyXAxisMode(selectedXAxisMode);
  const derivedTargetIds = useMemo(() => {
    if (!useDerived) return [] as number[];
    const ids = new Set<number>();
    for (const graph of visibleGraphs) {
      for (const point of graph.data) {
        // Overlay-only agentic points carry no persisted id — skip them so we
        // never request `?ids=0`/`?ids=NaN` (which 400s and errors the chart).
        if (point.benchmark_type === 'agentic_traces' && isPersistedBenchmarkId(point.id)) {
          ids.add(point.id);
        }
      }
    }
    return [...ids];
  }, [useDerived, visibleGraphs]);
  const derivedQuery = useDerivedAgenticMetrics(derivedTargetIds, useDerived);
  const derivedMetrics = derivedQuery.data;
  const isDerivedLoading =
    useDerived &&
    derivedTargetIds.length > 0 &&
    (derivedQuery.isPending || derivedQuery.isFetching) &&
    !derivedMetrics;

  // Set only when the user is on a derived (agentic-only) x-axis mode; the
  // specs are module constants so this is referentially stable per mode.
  const derivedSpec = useDerived ? DERIVED_X_MODE_SPECS[selectedXAxisMode] : undefined;

  const renderableGraphs = useMemo(() => {
    if (!derivedSpec) return visibleGraphs;
    if (!derivedMetrics) return visibleGraphs.map((graph) => ({ ...graph, data: [] }));
    const xLabel = derivedSpec.xLabel(selectedPercentile.toUpperCase());
    return visibleGraphs.map((graph) => {
      const chartDefinition = {
        ...graph.chartDefinition,
        x_label: xLabel,
        y_latency_limit: undefined,
        [`${selectedYAxisMetric}_roofline` as keyof typeof graph.chartDefinition]:
          derivedSpec.rooflineCorner,
      };
      const data = graph.data
        .map((point) => {
          if (!isPersistedBenchmarkId(point.id)) return null;
          const raw = derivedSpec.value(derivedMetrics[point.id], selectedPercentile);
          if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
          return { ...point, x: derivedSpec.toX(raw) };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null);
      return { ...graph, chartDefinition, data };
    });
  }, [derivedSpec, visibleGraphs, derivedMetrics, selectedYAxisMetric, selectedPercentile]);

  const displayGraphs =
    isFirstLoad || isDerivedLoading
      ? [
          <Card key="skeleton-0">
            <Skeleton className="h-7 w-2/4 mb-1" />
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-[600px] w-full" />
          </Card>,
        ]
      : renderableGraphs.length === 0
        ? []
        : renderableGraphs.map((graph, graphIndex) => {
            const isTimelineMode = Boolean(
              selectedDateRange.startDate && selectedDateRange.endDate && selectedGPUs.length > 0,
            );
            const replayAvailable = getViewMode(graphIndex) === 'chart' && !isTimelineMode;
            return (
              <section key={graphIndex} className="pt-8 md:pt-0">
                <figure data-testid="chart-figure" className="relative rounded-lg">
                  <ChartButtons
                    chartId={`chart-${graphIndex}`}
                    analyticsPrefix={
                      isTimelineMode
                        ? 'gpu_timeseries'
                        : graph.chartDefinition.chartType === 'e2e'
                          ? 'latency'
                          : 'interactivity'
                    }
                    leadingControls={
                      <SegmentedToggle
                        value={getViewMode(graphIndex)}
                        options={VIEW_MODE_OPTIONS}
                        onValueChange={(v) => handleViewModeChange(graphIndex, v)}
                        ariaLabel="View mode"
                        testId={`inference-view-toggle-${graphIndex}`}
                      />
                    }
                    hideImageExport={getViewMode(graphIndex) === 'table'}
                    setIsLegendExpanded={setIsLegendExpanded}
                    exportFileName={`InferenceX_${selectedModel}_${graph.chartDefinition.chartType}`}
                    onExportMp4={
                      replayAvailable
                        ? () => replayHandlesRef.current[graphIndex]?.open()
                        : undefined
                    }
                    onExportCsv={() => {
                      const visibleData = graph.data.filter((d) =>
                        isTimelineMode
                          ? activeDates.has(`${d.date}_${d.hwKey}`)
                          : activeHwTypes.has(d.hwKey as string) &&
                            selectedPrecisions.includes(d.precision),
                      );
                      const { headers, rows } = inferenceChartToCsv(
                        visibleData,
                        graph.model,
                        graph.sequence,
                      );
                      // Match warnings against the same series the chart annotates,
                      // including visible unofficial-run overlay series.
                      const overlay = selectUnofficialOverlayForMode(
                        selectedXAxisMode,
                        graph.chartDefinition.chartType,
                        overlayDataByChartType,
                      );
                      const visibleOverlayRows = isTimelineMode
                        ? []
                        : (overlay?.data ?? []).filter(
                            (p) =>
                              activeOverlayHwTypes.has(p.hwKey as string) &&
                              selectedPrecisions.includes(p.precision),
                          );
                      const issueNotes = matchKnownConfigIssues(graph.model, [
                        ...visibleData,
                        ...visibleOverlayRows,
                      ]).map((issue) =>
                        knownIssueCsvNote(issue, getDisplayLabel(getHardwareConfig(issue.hwKey))),
                      );
                      exportToCsv(
                        `InferenceX_${selectedModel}_${graph.chartDefinition.chartType}`,
                        headers,
                        rows,
                        issueNotes,
                      );
                    }}
                  />
                  <Card>
                    {(() => {
                      const chartCaption = (
                        <>
                          <h2 className="text-lg font-semibold">
                            {
                              graph.chartDefinition[
                                `${selectedYAxisMetric}_title` as keyof typeof graph.chartDefinition
                              ]
                            }{' '}
                            {(() => {
                              // For Input metrics with dynamic x-axis, use dynamic heading
                              const metricTitle =
                                (graph.chartDefinition[
                                  `${selectedYAxisMetric}_title` as keyof typeof graph.chartDefinition
                                ] as string) || '';
                              const isInputMetric = metricTitle.toLowerCase().includes('input');
                              if (
                                graph.chartDefinition.chartType === 'interactivity' &&
                                isInputMetric &&
                                selectedXAxisMetric
                              ) {
                                if (selectedXAxisMetric === 'p99_ttft') {
                                  return 'vs. P99 Time To First Token';
                                } else if (selectedXAxisMetric === 'median_ttft') {
                                  return 'vs. Median Time To First Token';
                                }
                              }

                              // The e2e chart heading follows the branch-level x-axis mode
                              // selector, including agentic-only derived metrics.
                              if (graph.chartDefinition.chartType === 'e2e') {
                                const modeSpec = DERIVED_X_MODE_SPECS[selectedXAxisMode];
                                if (modeSpec) {
                                  return modeSpec.heading(selectedPercentile.toUpperCase());
                                }
                                if (selectedE2eXAxisMetric?.endsWith('_ttft')) {
                                  const percentile = selectedE2eXAxisMetric.replace(/_ttft$/u, '');
                                  const word =
                                    percentile === 'median' ? 'Median' : percentile.toUpperCase();
                                  return `vs. ${word} Time To First Token`;
                                }
                                return isAgenticSequence
                                  ? `vs. ${selectedPercentile.toUpperCase()} End-to-end Latency`
                                  : 'vs. End-to-end Latency';
                              }

                              // Fall back to configured heading
                              return (
                                graph.chartDefinition[
                                  `${selectedYAxisMetric}_heading` as keyof typeof graph.chartDefinition
                                ] || graph.chartDefinition.heading
                              );
                            })()}
                          </h2>
                          <p className="text-sm text-muted-foreground mb-2">
                            {getModelLabel(graph.model as Model)} •{' '}
                            {selectedPrecisions
                              .map((prec) => getPrecisionLabel(prec as Precision))
                              .join(', ')}{' '}
                            • {getSequenceLabel(graph.sequence as Sequence)} •{' '}
                            {isUnofficialRun
                              ? 'Source: UNOFFICIAL'
                              : 'Source: SemiAnalysis InferenceX™'}
                            {selectedRunDate && (
                              <>
                                {' '}
                                • Updated:{' '}
                                {new Date(`${selectedRunDate}T00:00:00Z`).toLocaleDateString(
                                  'en-US',
                                  {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    timeZone: 'UTC',
                                  },
                                )}
                              </>
                            )}
                          </p>
                          <MetricAssumptionNotes selectedYAxisMetric={selectedYAxisMetric} />
                          {isUnofficialRun && selectedXAxisMode === 'normalized-e2e' && (
                            <p className="mb-2 text-xs text-muted-foreground">
                              Normalized E2E requires persisted per-request traces, so
                              unofficial-run overlays are unavailable for this experimental view.
                            </p>
                          )}
                          <UnofficialDomainNotice />
                        </>
                      );

                      if (getViewMode(graphIndex) === 'table') {
                        const overlay = selectUnofficialOverlayForMode(
                          selectedXAxisMode,
                          graph.chartDefinition.chartType,
                          overlayDataByChartType,
                        );
                        const overlayRows = (overlay?.data ?? []).filter((p) =>
                          selectedPrecisions.includes(p.precision),
                        );
                        return (
                          <>
                            {chartCaption}
                            <InferenceTable
                              data={
                                overlayRows.length > 0
                                  ? [...graph.data, ...overlayRows]
                                  : graph.data
                              }
                              chartDefinition={graph.chartDefinition}
                              selectedYAxisMetric={selectedYAxisMetric}
                            />
                          </>
                        );
                      }

                      return selectedGPUs.length > 0 &&
                        ((selectedDateRange.startDate && selectedDateRange.endDate) ||
                          selectedDates.length > 0) ? (
                        <GPUGraph
                          chartId={`chart-${graphIndex}`}
                          modelLabel={graph.model}
                          data={graph.data}
                          xLabel={graph.chartDefinition.x_label}
                          yLabel={`${
                            graph.chartDefinition[
                              `${selectedYAxisMetric}_label` as keyof typeof graph.chartDefinition
                            ]
                          }`}
                          chartDefinition={graph.chartDefinition}
                          caption={chartCaption}
                          runNumbering={runNumbering}
                        />
                      ) : (
                        <div className="relative">
                          <ScatterGraph
                            chartId={`chart-${graphIndex}`}
                            modelLabel={graph.model}
                            data={graph.data}
                            xLabel={graph.chartDefinition.x_label}
                            yLabel={`${
                              graph.chartDefinition[
                                `${selectedYAxisMetric}_label` as keyof typeof graph.chartDefinition
                              ]
                            }`}
                            chartDefinition={graph.chartDefinition}
                            caption={chartCaption}
                            overlayData={
                              selectUnofficialOverlayForMode(
                                selectedXAxisMode,
                                graph.chartDefinition.chartType,
                                overlayDataByChartType,
                              ) ?? undefined
                            }
                          />
                          {selectedGPUs.length > 0 &&
                            (!selectedDateRange.startDate || !selectedDateRange.endDate) &&
                            selectedDates.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg z-10">
                                <p className="text-sm font-medium text-muted-foreground bg-background/90 border border-border rounded-md px-4 py-2 shadow-sm">
                                  Select a date range or add a run to view GPU comparison
                                </p>
                              </div>
                            )}
                        </div>
                      );
                    })()}
                    {replayAvailable && (
                      <ReplayLauncher
                        ref={(handle) => {
                          replayHandlesRef.current[graphIndex] = handle;
                        }}
                        parentChartId={`chart-${graphIndex}`}
                        chartDefinition={graph.chartDefinition}
                        yLabel={`${
                          graph.chartDefinition[
                            `${selectedYAxisMetric}_label` as keyof typeof graph.chartDefinition
                          ]
                        }`}
                        xLabel={graph.chartDefinition.x_label}
                      />
                    )}
                  </Card>
                </figure>
              </section>
            );
          });

  return (
    <div data-testid="inference-chart-display" className="flex flex-col gap-4">
      <section className="relative z-20">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">Inference Performance</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Inference performance metrics across different models, hardware configurations,
                  and serving parameters.
                </p>
              </div>
              <ChartShareActions />
            </div>
            <ChartControls />
            <ModelArchitectureDiagram model={selectedModel} />
            {selectedGPUs.length === 0 && <WorkflowInfoDisplay workflowInfo={workflowInfo} />}
            {selectedGPUs.length > 0 && (
              <ComparisonChangelog
                changelogs={changelogs}
                selectedGPUs={selectedGPUs}
                selectedPrecisions={selectedPrecisions}
                modelDbKeys={modelDbKeys}
                loading={changelogsLoading}
                totalDatesQueried={totalDatesQueried}
                selectedDates={selectedDates}
                selectedDateRange={selectedDateRange}
                onAddDate={(date) => {
                  // Functional updater: adding several runs in quick succession must
                  // each build on the latest state, not the value captured at render.
                  setSelectedDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
                }}
                onRemoveDate={(date) => {
                  setSelectedDates((prev) => prev.filter((d) => d !== date));
                }}
                onAddAllDates={(dates) => {
                  setSelectedDates((prev) => [...new Set([...prev, ...dates])]);
                }}
                firstAvailableDate={dateRangeAvailableDates[0]}
              />
            )}
          </div>
        </Card>
      </section>

      {selectedYAxisMetric === 'y_costUser' && (
        <section>
          <CustomCosts loading={loading} />
        </section>
      )}
      {selectedYAxisMetric === 'y_powerUser' && (
        <section>
          <CustomPowers loading={loading} />
        </section>
      )}
      <Tabs
        value={selectedXAxisMode}
        onValueChange={(value) => {
          setSelectedXAxisMode(value as XAxisMode);
          track('latency_x_axis_mode_selected', { mode: value });
        }}
      >
        <TabsList
          aria-label="Chart x-axis metric"
          data-testid="x-axis-mode-buttons"
          className="flex-wrap justify-center gap-x-1 gap-y-1.5 sm:gap-x-1.5"
        >
          {X_AXIS_MODE_BUTTONS.filter(({ value }) => {
            if (!isAgenticOnlyXAxisMode(value)) return true;
            // Before mount, render all buttons so SSR and first client render match.
            if (!mounted) return true;
            return isAgenticSequence;
          }).map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`x-axis-mode-${value}`}
              className="min-w-[130px] sm:min-w-[140px] flex-1 sm:flex-initial justify-center"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-4">{displayGraphs}</div>

      {/* Performance Over Time — Modal Drill-Down */}
      <Dialog
        open={
          trackedConfigs.length > 0 &&
          !(selectedDateRange.startDate && selectedDateRange.endDate && selectedGPUs.length > 0)
        }
        onOpenChange={(open) => {
          if (!open) {
            clearTrackedConfigs();
            track('inference_trend_cleared', {
              configCount: trackedConfigs.length,
              model: selectedModel,
              metric: selectedYAxisMetric,
            });
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Performance Over Time</DialogTitle>
            <DialogDescription>
              Double-click points on the scatter chart to track configurations over time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mb-4">
            {trackedConfigs.map((config) => (
              <span
                key={config.id}
                data-testid="tracked-config-badge"
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium"
                style={{ borderColor: config.color, color: config.color }}
              >
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                {config.label}
                <button
                  type="button"
                  className="ml-1 hover:opacity-70"
                  onClick={() => {
                    removeTrackedConfig(config.id);
                    track('inference_trend_point_removed', { config: config.hwKey });
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <ChartButtons
              chartId="y-trend"
              analyticsPrefix="inference"
              zoomResetEvent="d3chart_zoom_reset_y-trend"
            />
            <TrendChart
              chartId="y-trend"
              trendLines={trendLines}
              lineConfigs={trackedConfigs}
              yLabel={currentYLabel}
              logScale={logScale}
              selectedPrecisions={selectedPrecisions}
            />
          </div>
          <div className="relative">
            <ChartButtons
              chartId="x-trend"
              analyticsPrefix="inference"
              zoomResetEvent="d3chart_zoom_reset_x-trend"
            />
            <TrendChart
              chartId="x-trend"
              trendLines={xTrendLines}
              lineConfigs={trackedConfigs}
              yLabel={currentXLabel}
              logScale={logScale}
              selectedPrecisions={selectedPrecisions}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

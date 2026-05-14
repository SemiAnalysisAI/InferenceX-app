'use client';
import { track } from '@/lib/analytics';
import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, Table2, X } from 'lucide-react';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { useInference } from '@/components/inference/InferenceContext';
import type {
  ChartDefinition,
  InferenceData,
  OverlayData,
  TrendDataPoint,
} from '@/components/inference/types';
import { processOverlayChartData } from '@/components/inference/utils';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { type SegmentedToggleOption, SegmentedToggle } from '@/components/ui/segmented-toggle';
import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { exportToCsv } from '@/lib/csv-export';
import { inferenceChartToCsv } from '@/lib/csv-export-helpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import {
  type Model,
  type Precision,
  type Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
} from '@/lib/data-mappings';
import { useComparisonChangelogs } from '@/hooks/api/use-comparison-changelogs';
import { useTrendData } from '@/components/inference/hooks/useTrendData';

import ChartControls from './ChartControls';
import ComparisonChangelog from './ComparisonChangelog';
import CustomCosts from './CustomCosts';
import CustomPowers from './CustomPowers';
import GPUGraph from './GPUGraph';
import ReplayLauncher, { type ReplayLauncherHandle } from '../replay/ReplayLauncher';
import ReproduceDrawer from './ReproduceDrawer';
import TrendChart from './TrendChart';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

const ModelArchitectureDiagram = dynamic(() => import('./ModelArchitectureDiagram'), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});
import WorkflowInfoDisplay from './WorkflowInfoDisplay';

/** Controlled popover dropdown for the e2e chart x-axis toggle. */
function E2eXAxisDropdown({
  xAxisLabel,
  xAxisOptions,
  selectedValue,
  onSelect,
}: {
  xAxisLabel: string;
  xAxisOptions: { value: string | null; label: string }[];
  selectedValue: string | null;
  onSelect: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          vs. {xAxisLabel}
          <ChevronDown className="no-export size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {xAxisOptions.map((opt) => (
          <button
            key={opt.label}
            className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors ${
              (opt.value === null && !selectedValue) || opt.value === selectedValue
                ? 'font-medium'
                : ''
            }`}
            onClick={() => {
              onSelect(opt.value);
              setOpen(false);
            }}
          >
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

type InferenceViewMode = 'chart' | 'table';

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
    setSelectedE2eXAxisMetric,
    reproducePoint,
    closeReproduceDrawer,
  } = useInference();

  const reproduceSequence = useMemo(
    () => (selectedSequence ? sequenceToIslOsl(selectedSequence) : null) ?? undefined,
    [selectedSequence],
  );

  const {
    changelogs,
    loading: changelogsLoading,
    totalDatesQueried,
  } = useComparisonChangelogs(selectedGPUs, selectedDateRange, dateRangeAvailableDates);

  const [viewModes, setViewModes] = useState<Record<number, InferenceViewMode>>({});
  const replayHandlesRef = useRef<Record<number, ReplayLauncherHandle | null>>({});
  const getViewMode = (index: number): InferenceViewMode => viewModes[index] ?? 'chart';
  const handleViewModeChange = (index: number, value: InferenceViewMode) => {
    setViewModes((prev) => ({ ...prev, [index]: value }));
    track('inference_view_changed', { view: value, chartIndex: index });
  };

  const { unofficialRunInfo, unofficialRunInfos, runIndexByUrl, getOverlayData, isUnofficialRun } =
    useUnofficialRun();

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
      const idMatch = url.match(/\/runs\/(\d+)/u);
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
      );

      if (processed.length === 0) return null;

      return {
        data: processed,
        hardwareConfig: rawData.hardwareConfig,
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

  const displayGraphs = isFirstLoad
    ? Array.from({ length: 2 }).map((_, index) => (
        <Card key={`skeleton-${index}`}>
          <Skeleton className="h-7 w-2/4 mb-1" />
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-[600px] w-full" />
        </Card>
      ))
    : effectiveGraphs.length === 0
      ? []
      : effectiveGraphs.map((graph, graphIndex) => {
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
                    replayAvailable ? () => replayHandlesRef.current[graphIndex]?.open() : undefined
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
                    exportToCsv(
                      `InferenceX_${selectedModel}_${graph.chartDefinition.chartType}`,
                      headers,
                      rows,
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

                            // For e2e chart: render clickable inline dropdown for x-axis
                            if (graph.chartDefinition.chartType === 'e2e') {
                              const xAxisLabel =
                                selectedE2eXAxisMetric === 'p99_ttft'
                                  ? 'P99 TTFT'
                                  : selectedE2eXAxisMetric === 'median_ttft'
                                    ? 'Median TTFT'
                                    : 'End-to-end Latency';
                              const xAxisOptions = [
                                { value: null, label: 'End-to-end Latency' },
                                { value: 'p99_ttft', label: 'P99 TTFT' },
                                { value: 'median_ttft', label: 'Median TTFT' },
                              ];
                              const zoomPrefix =
                                selectedDateRange.startDate &&
                                selectedDateRange.endDate &&
                                selectedGPUs.length > 0
                                  ? 'gpu_timeseries'
                                  : 'latency';
                              return (
                                <E2eXAxisDropdown
                                  xAxisLabel={xAxisLabel}
                                  xAxisOptions={xAxisOptions}
                                  selectedValue={selectedE2eXAxisMetric}
                                  onSelect={(value) => {
                                    setSelectedE2eXAxisMetric(value);
                                    track('latency_x_axis_metric_selected', {
                                      metric: value ?? 'median_e2el',
                                    });
                                    window.dispatchEvent(
                                      new CustomEvent(
                                        `${zoomPrefix}_zoom_reset_chart-${graphIndex}`,
                                      ),
                                    );
                                  }}
                                />
                              );
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
                        <UnofficialDomainNotice />
                      </>
                    );

                    if (getViewMode(graphIndex) === 'table') {
                      const overlay =
                        graph.chartDefinition.chartType === 'e2e'
                          ? overlayDataByChartType.e2e
                          : overlayDataByChartType.interactivity;
                      const overlayRows = (overlay?.data ?? []).filter((p) =>
                        selectedPrecisions.includes(p.precision),
                      );
                      return (
                        <>
                          {chartCaption}
                          <InferenceTable
                            data={
                              overlayRows.length > 0 ? [...graph.data, ...overlayRows] : graph.data
                            }
                            chartDefinition={graph.chartDefinition}
                            selectedYAxisMetric={selectedYAxisMetric}
                          />
                        </>
                      );
                    }

                    return selectedDateRange.startDate &&
                      selectedDateRange.endDate &&
                      selectedGPUs.length > 0 ? (
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
                            graph.chartDefinition.chartType === 'e2e'
                              ? (overlayDataByChartType.e2e ?? undefined)
                              : (overlayDataByChartType.interactivity ?? undefined)
                          }
                        />
                        {selectedGPUs.length > 0 &&
                          (!selectedDateRange.startDate || !selectedDateRange.endDate) && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg z-10">
                              <p className="text-sm font-medium text-muted-foreground bg-background/90 border border-border rounded-md px-4 py-2 shadow-sm">
                                Select a date range to view GPU comparison
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
                loading={changelogsLoading}
                totalDatesQueried={totalDatesQueried}
                selectedDates={selectedDates}
                selectedDateRange={selectedDateRange}
                onAddDate={(date) => {
                  if (!selectedDates.includes(date)) {
                    setSelectedDates([...selectedDates, date]);
                  }
                }}
                onRemoveDate={(date) => {
                  setSelectedDates(selectedDates.filter((d) => d !== date));
                }}
                onAddAllDates={(dates) => {
                  const merged = [...new Set([...selectedDates, ...dates])];
                  setSelectedDates(merged);
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

      <ReproduceDrawer
        point={reproducePoint}
        sequence={reproduceSequence}
        model={selectedModel}
        onClose={closeReproduceDrawer}
      />
    </div>
  );
}

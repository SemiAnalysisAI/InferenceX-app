'use client';
import { track } from '@/lib/analytics';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

import { useInference } from '@/components/inference/InferenceContext';
import { InferenceData, OverlayData, TrendDataPoint } from '@/components/inference/types';
import { processOverlayChartData } from '@/components/inference/utils';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { exportToCsv } from '@/lib/csv-export';
import { inferenceChartToCsv } from '@/lib/csv-export-helpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { ShareButton } from '@/components/ui/share-button';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { GPU_SPECS } from '@/lib/constants';
import {
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
  isModelExperimental,
  Model,
  Precision,
  Sequence,
} from '@/lib/data-mappings';
import { useComparisonChangelogs } from '@/hooks/api/use-comparison-changelogs';
import { useTrendData } from '@/components/inference/hooks/useTrendData';

import ChartControls from './ChartControls';
import ComparisonChangelog from './ComparisonChangelog';
import CustomCosts from './CustomCosts';
import CustomPowers from './CustomPowers';
import GPUGraph from './GPUGraph';
import ModelArchitectureDiagram from './ModelArchitectureDiagram';
import TrendChart from './TrendChart';
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
          <ChevronDown className="no-export h-3.5 w-3.5 shrink-0 opacity-60" />
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

/**
 * Renders a display of scatter charts based on filtered graph data.
 * It maps through the filtered graphs from the InferenceChartContext and renders a Card for each,
 * containing a heading and a ScatterGraph component.
 * @returns {JSX.Element[]} An array of JSX.Element representing the chart displays.
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
    setSelectedE2eXAxisMetric,
  } = useInference();

  const {
    changelogs,
    intermediateDates,
    loading: changelogsLoading,
    totalDatesQueried,
  } = useComparisonChangelogs(selectedGPUs, selectedDateRange, dateRangeAvailableDates);

  const { unofficialRunInfo, getOverlayData, isUnofficialRun } = useUnofficialRun();

  // Compute overlay data for each chart type — must match useChartData processing
  const overlayDataByChartType = useMemo(() => {
    if (!unofficialRunInfo || !getOverlayData) {
      return { e2e: null, interactivity: null };
    }

    const e2eRaw = getOverlayData(selectedModel, selectedSequence, 'e2e');
    const interactivityRaw = getOverlayData(selectedModel, selectedSequence, 'interactivity');

    const processData = (
      rawData: { data: InferenceData[]; hardwareConfig: any } | null,
      chartType: 'e2e' | 'interactivity',
    ): OverlayData | null => {
      if (!rawData || !rawData.data.length) return null;

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
      };
    };

    return {
      e2e: processData(e2eRaw, 'e2e'),
      interactivity: processData(interactivityRaw, 'interactivity'),
    };
  }, [
    unofficialRunInfo,
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

  const displayGraphs = isFirstLoad
    ? [...Array(2)].map((_, index) => (
        <Card key={`skeleton-${index}`}>
          <Skeleton className="h-7 w-2/4 mb-1" />
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-[600px] w-full" />
        </Card>
      ))
    : graphs.length === 0
      ? []
      : graphs.map((graph, graphIndex) => (
          <section key={graphIndex} className="pt-8 md:pt-0">
            <figure data-testid="chart-figure" className="relative rounded-lg">
              <ChartButtons
                chartId={`chart-${graphIndex}`}
                analyticsPrefix={
                  selectedDateRange.startDate &&
                  selectedDateRange.endDate &&
                  selectedGPUs.length > 0
                    ? 'gpu_timeseries'
                    : graph.chartDefinition.chartType === 'e2e'
                      ? 'latency'
                      : 'interactivity'
                }
                setIsLegendExpanded={setIsLegendExpanded}
                exportFileName={`InferenceX_${selectedModel}_${graph.chartDefinition.chartType}`}
                onExportCsv={() => {
                  const visibleData = graph.data.filter(
                    (d) =>
                      activeHwTypes.has(d.hwKey as string) &&
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
                                    new CustomEvent(`${zoomPrefix}_zoom_reset_chart-${graphIndex}`),
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
                            {new Date(selectedRunDate + 'T00:00:00Z').toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              timeZone: 'UTC',
                            })}
                          </>
                        )}
                      </p>
                      {(selectedYAxisMetric === 'y_tpPerMw' ||
                        selectedYAxisMetric === 'y_inputTputPerMw' ||
                        selectedYAxisMetric === 'y_outputTputPerMw') && (
                        <>
                          <p className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
                            All in Power/GPU:{' '}
                            {Object.entries(GPU_SPECS).map(([base, specs]) => (
                              <Badge key={base} variant="outline">
                                {base.toUpperCase()}: {specs.power}kW
                              </Badge>
                            ))}
                          </p>
                          <p className="text-muted-foreground">
                            <small>
                              Source:{' '}
                              <Link
                                target="_blank"
                                className="underline hover:text-foreground"
                                href="https://semianalysis.com/datacenter-industry-model/"
                              >
                                SemiAnalysis Datacenter Industry Model
                                <ExternalLinkIcon />
                              </Link>
                            </small>
                          </p>
                        </>
                      )}
                      {(selectedYAxisMetric === 'y_costh' ||
                        selectedYAxisMetric === 'y_costn' ||
                        selectedYAxisMetric === 'y_costr') && (
                        <>
                          <p className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
                            TCO $/GPU/hr:{' '}
                            {Object.entries(GPU_SPECS).map(([base, specs]) => (
                              <Badge key={base} variant="outline">
                                {base.toUpperCase()}:{' '}
                                {selectedYAxisMetric === 'y_costh'
                                  ? specs.costh
                                  : selectedYAxisMetric === 'y_costn'
                                    ? specs.costn
                                    : specs.costr}
                              </Badge>
                            ))}
                          </p>
                          <p className="text-muted-foreground">
                            <small>
                              Source:{' '}
                              <Link
                                target="_blank"
                                className="underline hover:text-foreground"
                                href="https://semianalysis.com/ai-cloud-tco-model/"
                              >
                                SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model
                                <ExternalLinkIcon />
                              </Link>
                            </small>
                          </p>
                        </>
                      )}
                      {(selectedYAxisMetric === 'y_costhOutput' ||
                        selectedYAxisMetric === 'y_costnOutput' ||
                        selectedYAxisMetric === 'y_costrOutput') && (
                        <>
                          <p className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
                            TCO $/GPU/hr:{' '}
                            {Object.entries(GPU_SPECS).map(([base, specs]) => (
                              <Badge key={base} variant="outline">
                                {base.toUpperCase()}:{' '}
                                {selectedYAxisMetric === 'y_costhOutput'
                                  ? specs.costh
                                  : selectedYAxisMetric === 'y_costnOutput'
                                    ? specs.costn
                                    : specs.costr}
                              </Badge>
                            ))}
                          </p>
                          <p className="text-muted-foreground">
                            <small>
                              Source:{' '}
                              <Link
                                target="_blank"
                                className="underline hover:text-foreground"
                                href="https://semianalysis.com/ai-cloud-tco-model/"
                              >
                                SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model
                                <ExternalLinkIcon />
                              </Link>
                            </small>
                          </p>
                        </>
                      )}
                      {(selectedYAxisMetric === 'y_costhi' ||
                        selectedYAxisMetric === 'y_costni' ||
                        selectedYAxisMetric === 'y_costri') && (
                        <>
                          <p className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
                            TCO $/GPU/hr:{' '}
                            {Object.entries(GPU_SPECS).map(([base, specs]) => (
                              <Badge key={base} variant="outline">
                                {base.toUpperCase()}:{' '}
                                {selectedYAxisMetric === 'y_costhi'
                                  ? specs.costh
                                  : selectedYAxisMetric === 'y_costni'
                                    ? specs.costn
                                    : specs.costr}
                              </Badge>
                            ))}
                          </p>
                          <p className="text-muted-foreground">
                            <small>
                              Source:{' '}
                              <Link
                                target="_blank"
                                className="underline hover:text-foreground"
                                href="https://semianalysis.com/ai-cloud-tco-model/"
                              >
                                SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model
                                <ExternalLinkIcon />
                              </Link>
                            </small>
                          </p>
                        </>
                      )}
                      <div
                        className={`overflow-hidden transition-all duration-200 ease-in-out ${
                          selectedYAxisMetric.startsWith('y_cost')
                            ? 'max-h-20 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI
                          SGLang, Dynamo TRT) calculate cost per decode GPU or per prefill GPU,
                          rather than per total GPU count. This makes direct cost comparison with
                          aggregated configs not an apples-to-apples comparison.
                        </p>
                      </div>
                      <div
                        className={`overflow-hidden transition-all duration-200 ease-in-out ${
                          selectedYAxisMetric === 'y_inputTputPerGpu' ||
                          selectedYAxisMetric === 'y_outputTputPerGpu'
                            ? 'max-h-20 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI
                          SGLang, Dynamo TRT) calculate cost per decode GPU or per prefill GPU,
                          rather than per total GPU count. This makes direct cost comparison with
                          aggregated configs not an apples-to-apples comparison.
                        </p>
                      </div>
                      <div
                        className={`overflow-hidden transition-all duration-200 ease-in-out ${
                          selectedYAxisMetric === 'y_tpPerMw' ||
                          selectedYAxisMetric === 'y_inputTputPerMw' ||
                          selectedYAxisMetric === 'y_outputTputPerMw'
                            ? 'max-h-20 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI
                          SGLang, Dynamo TRT) calculate power per decode GPU or per prefill GPU,
                          rather than per total GPU count. This makes direct power comparison with
                          aggregated configs not an apples-to-apples comparison.
                        </p>
                      </div>
                      {selectedYAxisMetric.startsWith('y_j') && (
                        <>
                          <p className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
                            All in Power/GPU:{' '}
                            {Object.entries(GPU_SPECS).map(([base, specs]) => (
                              <Badge key={base} variant="outline">
                                {base.toUpperCase()}: {specs.power}kW
                              </Badge>
                            ))}
                          </p>
                          <p className="text-muted-foreground">
                            <small>
                              Source:{' '}
                              <Link
                                target="_blank"
                                className="underline hover:text-foreground"
                                href="https://semianalysis.com/datacenter-industry-model/"
                              >
                                SemiAnalysis Datacenter Industry Model
                                <ExternalLinkIcon />
                              </Link>
                            </small>
                          </p>
                        </>
                      )}
                      <div
                        className={`overflow-hidden transition-all duration-200 ease-in-out ${
                          selectedYAxisMetric.startsWith('y_j')
                            ? 'max-h-20 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI
                          SGLang, Dynamo TRT) calculate Joules per decode GPU or per prefill GPU,
                          rather than per total GPU count. This makes direct Joules per token
                          comparison with aggregated configs not an apples-to-apples comparison.
                        </p>
                      </div>
                      <div
                        className={`overflow-hidden transition-all duration-200 ease-in-out ${
                          isModelExperimental(selectedModel)
                            ? 'max-h-20 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                          <strong>Note:</strong> At SemiAnalysis InferenceX™, we're still in the
                          early stages of adding support for this model. Please note that these
                          InferenceX™ results are experimental. If a GPU SKU is currently missing,
                          it does not necessarily mean the model is unsupported; it simply means
                          InferenceX™ has not added that SKU yet. Additional support is coming soon.
                        </p>
                      </div>
                    </>
                  );

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
              </Card>
            </figure>
          </section>
        ));

  return (
    <div data-testid="inference-chart-display" className="flex flex-col gap-4">
      <section className="relative z-10">
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
              <div className="flex items-center gap-1.5">
                <ShareButton />
                <div className="hidden sm:flex items-center gap-1.5">
                  <ShareTwitterButton />
                  <ShareLinkedInButton />
                </div>
              </div>
            </div>
            <ChartControls intermediateDates={intermediateDates} />
            <ModelArchitectureDiagram model={selectedModel} />
            {selectedGPUs.length === 0 && <WorkflowInfoDisplay workflowInfo={workflowInfo} />}
            {selectedGPUs.length > 0 && (
              <ComparisonChangelog
                changelogs={changelogs}
                selectedGPUs={selectedGPUs}
                selectedPrecisions={selectedPrecisions}
                loading={changelogsLoading}
                totalDatesQueried={totalDatesQueried}
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
                  className="inline-block w-2 h-2 rounded-full"
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
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

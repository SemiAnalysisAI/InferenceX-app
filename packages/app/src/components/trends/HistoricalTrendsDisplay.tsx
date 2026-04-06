'use client';

import { track } from '@/lib/analytics';
import React, { useCallback, useMemo, useState } from 'react';

import { useInference } from '@/components/inference/InferenceContext';
import { useInterpolatedTrendData } from '@/components/inference/hooks/useInterpolatedTrendData';
import { TrendLineConfig } from '@/components/inference/types';
import ChartControls from '@/components/inference/ui/ChartControls';
import TrendChart from '@/components/inference/ui/TrendChart';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { exportToCsv } from '@/lib/csv-export';
import { historicalTrendToCsv } from '@/lib/csv-export-helpers';
import ChartLegend from '@/components/ui/chart-legend';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getModelSortIndex } from '@/lib/constants';
import {
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
  isModelExperimental,
  Model,
  Precision,
  Sequence,
} from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function HistoricalTrendsDisplay() {
  const {
    graphs,
    loading,
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedYAxisMetric,
    hardwareConfig,
    activeHwTypes,
    hwTypesWithData,
    toggleHwType,
    removeHwType,
    selectAllHwTypes,
    availableDates,
    logScale,
    setLogScale,
    isLegendExpanded,
    setIsLegendExpanded,
    workflowInfo,
    highContrast,
    setHighContrast,
  } = useInference();

  // Check if interactivity chart data exists
  const hasInteractivityChart = graphs.some((g) => g.chartDefinition.chartType === 'interactivity');

  // Get Y-axis label and title from chart definition
  const currentYLabel = useMemo(() => {
    if (graphs.length === 0) return '';
    const yLabelKey = `${selectedYAxisMetric}_label` as keyof (typeof graphs)[0]['chartDefinition'];
    return (graphs[0].chartDefinition[yLabelKey] as string) || '';
  }, [graphs, selectedYAxisMetric]);

  const currentYTitle = useMemo(() => {
    if (graphs.length === 0) return '';
    const yTitleKey = `${selectedYAxisMetric}_title` as keyof (typeof graphs)[0]['chartDefinition'];
    return (graphs[0].chartDefinition[yTitleKey] as string) || '';
  }, [graphs, selectedYAxisMetric]);

  // Interactivity range from current chart data
  const interactivityRange = useMemo(() => {
    const g = graphs.find((g) => g.chartDefinition.chartType === 'interactivity');
    if (!g || g.data.length === 0) return { min: 0, max: 200 };
    const xs = g.data.map((d) => d.x);
    return { min: Math.ceil(Math.min(...xs)), max: Math.floor(Math.max(...xs)) };
  }, [graphs]);

  // Slider state (dual: numeric value + string for input display)
  const [targetInteractivity, setTargetInteractivity] = useState(35);
  const [interactivityInput, setInteractivityInput] = useState('35');

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setTargetInteractivity(val);
    setInteractivityInput(String(val));
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInteractivityInput(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed) && parsed >= 0) {
      setTargetInteractivity(parsed);
    }
  }, []);

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(interactivityInput);
    if (isNaN(parsed) || parsed < 0) {
      setInteractivityInput(String(targetInteractivity));
    } else {
      const { min, max } = interactivityRange;
      const clamped = Math.max(min, Math.min(max, parsed));
      setTargetInteractivity(clamped);
      setInteractivityInput(String(clamped));
    }
    track('historical_trend_target_input', { value: targetInteractivity });
  }, [interactivityInput, targetInteractivity, interactivityRange]);

  // Interpolated trend data
  const { trendLines, loading: trendLoading } = useInterpolatedTrendData({
    selectedModel: selectedModel as Model,
    selectedSequence: selectedSequence as Sequence,
    selectedPrecisions,
    selectedYAxisMetric,
    targetInteractivity,
    availableDates,
    enabled: hasInteractivityChart,
  });

  // High contrast color support
  const activeHwKeys = useMemo(() => [...activeHwTypes], [activeHwTypes]);
  const { resolveColor } = useThemeColors({
    highContrast,
    identifiers: activeHwKeys,
    activeKeys: activeHwKeys,
  });

  // Line configs for TrendChart — one per visible GPU+precision combo
  const lineConfigs = useMemo(
    (): TrendLineConfig[] =>
      Array.from(trendLines.keys())
        .filter((groupKey) => {
          const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
          return activeHwTypes.has(baseHwKey);
        })
        .map((groupKey) => {
          const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
          const precision = groupKey.includes('__') ? groupKey.split('__')[1] : null;
          const baseLabel = hardwareConfig[baseHwKey]
            ? getDisplayLabel(hardwareConfig[baseHwKey])
            : baseHwKey;
          return {
            id: groupKey,
            hwKey: baseHwKey,
            label: precision
              ? `${baseLabel} (${getPrecisionLabel(precision as Precision)})`
              : baseLabel,
            color: resolveColor(baseHwKey),
            precision: precision ?? selectedPrecisions[0],
          };
        }),
    [trendLines, activeHwTypes, hardwareConfig, selectedPrecisions, resolveColor],
  );

  if (loading || graphs.length === 0 || trendLoading) {
    return (
      <section data-testid="historical-trends-display">
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Historical Trends</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Interpolated performance metrics over time at a fixed interactivity operating point.
              </p>
            </div>
            <ChartControls hideGpuComparison />
            <div className="space-y-2">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        </Card>
        <Card className="mt-4">
          <Skeleton className="h-7 w-2/4 mb-1" />
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-[600px] w-full" />
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="historical-trends-display" className="flex flex-col gap-4">
      {/* Controls card — same selectors as Inference Performance tab */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">Historical Trends</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Interpolated performance metrics over time at a fixed interactivity operating point.
              </p>
            </div>
            <ChartShareActions />
          </div>
          <ChartControls hideGpuComparison />

          {/* Target interactivity slider */}
          {!loading && hasInteractivityChart && (
            <TooltipProvider delayDuration={0}>
              <div className="space-y-2">
                <LabelWithTooltip
                  htmlFor="historical-target"
                  label="Target Interactivity (tok/s/user)"
                  tooltip="The interactivity operating point used for interpolation. Move the slider to see how each GPU's performance changes at different interactivity levels."
                />
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input
                      type="range"
                      min={interactivityRange.min}
                      max={interactivityRange.max}
                      step={1}
                      value={targetInteractivity}
                      onChange={handleSliderChange}
                      onPointerUp={() =>
                        track('historical_trend_target_set', { value: targetInteractivity })
                      }
                      className="w-full h-2 appearance-none rounded-full bg-secondary cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                      [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary
                      [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                    />
                    <div
                      className="relative h-4 text-xs text-muted-foreground"
                      style={{ marginLeft: 8, marginRight: 8 }}
                    >
                      {Array.from({ length: 6 }, (_, i) => (
                        <span
                          key={i}
                          className="absolute -translate-x-1/2"
                          style={{ left: `${(i / 5) * 100}%` }}
                        >
                          {Math.round(
                            interactivityRange.min +
                              (interactivityRange.max - interactivityRange.min) * (i / 5),
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={interactivityInput}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    className="w-24 h-9"
                    min={0}
                  />
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>
      </Card>

      {/* Chart card */}
      {!hasInteractivityChart ? (
        <Card>
          <p className="text-muted-foreground text-sm">
            No interactivity chart data available for the selected model and sequence.
          </p>
        </Card>
      ) : (
        <section>
          <figure data-testid="historical-trend-figure" className="relative rounded-lg">
            <ChartButtons
              chartId="historical-trend"
              analyticsPrefix="historical"
              zoomResetEvent="d3chart_zoom_reset_historical-trend"
              setIsLegendExpanded={setIsLegendExpanded}
              exportFileName={`InferenceX_historical_${selectedModel}`}
              onExportCsv={() => {
                const { headers, rows } = historicalTrendToCsv(
                  trendLines,
                  lineConfigs,
                  currentYLabel,
                  targetInteractivity,
                );
                exportToCsv(`InferenceX_historical_${selectedModel}`, headers, rows);
              }}
            />
            <Card>
              <TrendChart
                chartId="historical-trend"
                caption={
                  <>
                    <h2 className="text-lg font-semibold">
                      {currentYTitle} Over Time at {targetInteractivity} tok/s/user Interactivity
                    </h2>
                    <p className="text-sm text-muted-foreground mb-2">
                      {getModelLabel(selectedModel as Model)} •{' '}
                      {selectedPrecisions
                        .map((prec: string) => getPrecisionLabel(prec as Precision))
                        .join(', ')}{' '}
                      • {getSequenceLabel(selectedSequence as Sequence)} • Source: SemiAnalysis
                      InferenceX™
                      {workflowInfo && workflowInfo.length > 0 && workflowInfo[0]?.run_date && (
                        <> • Updated: {workflowInfo[0].run_date.split(',')[0]}</>
                      )}
                    </p>
                    <MetricAssumptionNotes
                      selectedYAxisMetric={selectedYAxisMetric}
                      includeAllPowerThroughputMetrics={false}
                      includePowerThroughputCaveat={false}
                    />
                    <div
                      className={`overflow-hidden transition-all duration-200 ease-in-out ${
                        isModelExperimental(selectedModel)
                          ? 'max-h-20 opacity-100'
                          : 'max-h-0 opacity-0'
                      }`}
                    >
                      <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                        <strong>Note:</strong> At SemiAnalysis InferenceX™, we're still in the early
                        stages of adding support for this model. Please note that these InferenceX™
                        results are experimental. If a GPU SKU is currently missing, it does not
                        necessarily mean the model is unsupported; it simply means InferenceX™ has
                        not added that SKU yet. Additional support is coming soon.
                      </p>
                    </div>
                  </>
                }
                trendLines={trendLines}
                lineConfigs={lineConfigs}
                yLabel={currentYLabel}
                logScale={logScale}
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    onItemRemove={removeHwType}
                    legendItems={Object.entries(hardwareConfig)
                      .filter(([key]) => hwTypesWithData.has(key))
                      .sort(
                        ([a], [b]) =>
                          getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
                      )
                      .map(([key, hwConfig]) => ({
                        name: hwConfig.name,
                        label: getDisplayLabel(hwConfig),
                        color: resolveColor(key),
                        title: hwConfig.gpu,
                        hw: key,
                        isActive: activeHwTypes.has(key),
                        onClick: () => {
                          toggleHwType(key);
                          track('historical_hw_type_toggled', { hw: key });
                        },
                      }))}
                    isLegendExpanded={isLegendExpanded}
                    onExpandedChange={(expanded) => {
                      setIsLegendExpanded(expanded);
                      track('historical_legend_expanded', { expanded });
                    }}
                    switches={[
                      {
                        id: 'historical-log-scale',
                        label: 'Log Scale',
                        checked: logScale,
                        onCheckedChange: (checked: boolean) => {
                          setLogScale(checked);
                          track('historical_log_scale_toggled', { enabled: checked });
                        },
                      },
                      {
                        id: 'historical-high-contrast',
                        label: 'High Contrast',
                        checked: highContrast,
                        onCheckedChange: (checked: boolean) => {
                          setHighContrast(checked);
                          track('historical_high_contrast_toggled', { enabled: checked });
                        },
                      },
                    ]}
                    actions={
                      activeHwTypes.size < hwTypesWithData.size
                        ? [
                            {
                              id: 'historical-reset-filter',
                              label: 'Reset filter',
                              onClick: () => {
                                selectAllHwTypes();
                                track('historical_legend_filter_reset');
                              },
                            },
                          ]
                        : []
                    }
                    enableTooltips={true}
                    showFpShapeIndicators={true}
                  />
                }
              />
            </Card>
          </figure>
        </section>
      )}
    </section>
  );
}

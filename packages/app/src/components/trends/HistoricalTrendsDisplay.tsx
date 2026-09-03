'use client';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import React, { useCallback, useMemo, useState } from 'react';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { useInterpolatedTrendData } from '@/components/inference/hooks/useInterpolatedTrendData';
import type { TrendLineConfig } from '@/components/inference/types';
import ChartControls from '@/components/inference/ui/ChartControls';
import TrendChart from '@/components/inference/ui/TrendChart';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { ResultContext } from '@/components/ui/result-context';
import { exportToCsv } from '@/lib/csv-export';
import { historicalTrendToCsv } from '@/lib/csv-export-helpers';
import ChartLegend from '@/components/ui/chart-legend';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getModelSortIndex } from '@/lib/constants';
import {
  type Model,
  type Precision,
  type Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
} from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  includesJalapenoResult,
  includesVeraRubinResult,
  JalapenoOfficialPreviewNotice,
  VeraRubinOfficialPreviewNotice,
} from '@/components/official-preview-notice';
import { metricChartTitle, metricLabel } from '@/lib/chart-utils';
import {
  costTierLabel,
  metricCostTier,
  type MetricKey,
} from '@/components/inference/metric-registry';
import { Button } from '@/components/ui/button';

const STRINGS = {
  en: {
    heading: 'Historical Trends',
    description:
      'Interpolated performance metrics over time at a fixed interactivity operating point.',
    targetLabel: 'Target Interactivity (tok/s/user)',
    targetTooltip:
      "The interactivity operating point used for interpolation. Move the slider to see how each chip's performance changes at different interactivity levels.",
    captionTitle: (yTitle: string, target: number) =>
      `${yTitle} Over Time at ${target} tok/s/user Interactivity`,
    source: 'Source: SemiAnalysis InferenceX™',
    updated: 'Updated:',
    logScale: 'Log Scale',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
    noData: 'No interactivity chart data available for the selected model and sequence.',
    loadError: 'Historical benchmark data could not be loaded.',
    retry: 'Reload page',
    trendLoadError: 'Historical trend data could not be loaded.',
    trendRetry: 'Retry loading trend data',
    targetHint: 'Adjust the operating point used by the trend interpolation.',
  },
  zh: {
    heading: '历史趋势',
    description: '将交互性固定在指定水平后，展示各项性能指标随时间的变化；数据经插值计算。',
    targetLabel: '目标交互性（tok/s/user）',
    targetTooltip: '设置插值计算采用的交互性水平。移动滑块可比较不同交互性水平下的芯片性能。',
    captionTitle: (yTitle: string, target: number) =>
      `${yTitle} 随时间变化（交互性 ${target} tok/s/user）`,
    source: '来源：SemiAnalysis InferenceX™',
    updated: '更新时间：',
    logScale: '对数缩放',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
    noData: '所选模型和序列暂无交互性图表数据。',
    loadError: '历史基准测试数据加载失败。',
    retry: '重新加载页面',
    trendLoadError: '历史趋势数据加载失败。',
    trendRetry: '重试加载趋势数据',
    targetHint: '调整趋势插值所使用的交互性水平。',
  },
};

function historicalRunDate(date: string, locale: 'en' | 'zh'): string {
  if (locale !== 'zh') return date;
  const [year, month, day] = date.split('-').map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
    ? `${year}年${month}月${day}日`
    : date;
}

export default function HistoricalTrendsDisplay() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { graphs, loading, error, hardwareConfig, hwTypesWithData, availableDates } =
    useInferenceData();
  const { selectedModel, selectedSequence, selectedPrecisions, activeHwTypes, selectedRunDate } =
    useInferenceFilters();
  const { selectedYAxisMetric, tokenRevenuePricing, logScale, isLegendExpanded, highContrast } =
    useInferenceDisplay();
  const {
    toggleHwType,
    removeHwType,
    selectAllHwTypes,
    setLogScale,
    setIsLegendExpanded,
    setHighContrast,
  } = useInferenceActions();

  // Check if interactivity chart data exists
  const hasInteractivityChart = graphs.some((g) => g.chartDefinition.chartType === 'interactivity');

  // Get Y-axis label and title from chart definition
  const currentYLabel = useMemo(() => {
    if (graphs.length === 0) return '';
    return metricLabel(graphs[0].chartDefinition, selectedYAxisMetric, locale);
  }, [graphs, locale, selectedYAxisMetric]);

  const currentYTitle = useMemo(() => {
    if (graphs.length === 0) return '';
    return metricChartTitle(graphs[0].chartDefinition, selectedYAxisMetric, locale);
  }, [graphs, locale, selectedYAxisMetric]);

  // Interactivity range from current chart data
  const interactivityRange = useMemo(() => {
    const g = graphs.find((graph) => graph.chartDefinition.chartType === 'interactivity');
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
  const {
    trendLines,
    loading: trendLoading,
    error: trendError,
    refetch: refetchTrendData,
  } = useInterpolatedTrendData({
    selectedModel: selectedModel as Model,
    selectedSequence: selectedSequence as Sequence,
    selectedPrecisions,
    selectedYAxisMetric,
    targetInteractivity,
    availableDates,
    tokenRevenuePricing,
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
      [...trendLines.keys()]
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
  const showsJalapenoPreview = includesJalapenoResult(lineConfigs.map((config) => config.hwKey));
  const showsVeraRubinPreview = includesVeraRubinResult(lineConfigs.map((config) => config.hwKey));

  // Check `error` before the loading skeleton: a failed benchmark query never
  // produces rows, so `loading` (which includes "no rows yet") would otherwise
  // pin the page on the skeleton forever instead of surfacing the error card.
  if (error) {
    return (
      <section data-testid="historical-trends-display">
        <Card>
          <DashboardSectionHeader
            title={t.heading}
            description={t.loadError}
            descriptionClassName="text-destructive"
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  track('historical_reload_clicked');
                  window.location.reload();
                }}
              >
                {t.retry}
              </Button>
            }
          />
        </Card>
      </section>
    );
  }

  if (loading || trendLoading) {
    return (
      <section data-testid="historical-trends-display">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader title={t.heading} description={t.description} />
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

  if (trendError) {
    return (
      <section data-testid="historical-trends-display">
        <Card data-testid="historical-trend-error">
          <DashboardSectionHeader
            title={t.heading}
            description={t.trendLoadError}
            descriptionClassName="text-destructive"
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  track('historical_trend_retry_clicked');
                  void refetchTrendData();
                }}
              >
                {t.trendRetry}
              </Button>
            }
          />
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="historical-trends-display" className="flex flex-col gap-4">
      {/* Controls card — same selectors as Inference Performance tab */}
      <Card className="relative z-30">
        <div className="flex flex-col gap-4">
          <DashboardSectionHeader
            title={t.heading}
            description={t.description}
            actions={<ChartShareActions />}
          />
          <ChartControls hideGpuComparison />

          {/* Target interactivity slider */}
          {!loading && hasInteractivityChart && (
            <TooltipProvider delayDuration={0}>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                <LabelWithTooltip
                  htmlFor="historical-target"
                  label={t.targetLabel}
                  tooltip={t.targetTooltip}
                />
                <p className="text-xs text-muted-foreground">{t.targetHint}</p>
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <input
                      type="range"
                      min={interactivityRange.min}
                      max={interactivityRange.max}
                      step={1}
                      value={targetInteractivity}
                      aria-label={t.targetLabel}
                      data-testid="historical-target-slider"
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
                    className="w-24 shrink-0"
                    min={0}
                    aria-label={t.targetLabel}
                    data-testid="historical-target-input"
                  />
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>
      </Card>

      {/* Chart card */}
      {hasInteractivityChart ? (
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
                    <Heading as="h2" level="card">
                      {t.captionTitle(currentYTitle, targetInteractivity)}
                    </Heading>
                    <ResultContext
                      locale={locale}
                      model={getModelLabel(selectedModel as Model)}
                      workload={getSequenceLabel(selectedSequence as Sequence, locale)}
                      precision={selectedPrecisions
                        .map((prec: string) => getPrecisionLabel(prec as Precision))
                        .join(', ')}
                      metric={currentYLabel}
                      costTier={(() => {
                        const tier = metricCostTier(
                          selectedYAxisMetric.replace(/^y_/u, '') as MetricKey,
                        );
                        return tier ? costTierLabel(tier, locale) : undefined;
                      })()}
                      target={`${targetInteractivity} tok/s/user`}
                      date={
                        selectedRunDate ? historicalRunDate(selectedRunDate, locale) : undefined
                      }
                      source="SemiAnalysis InferenceX™"
                    />
                    {showsJalapenoPreview && <JalapenoOfficialPreviewNotice />}
                    {showsVeraRubinPreview && <VeraRubinOfficialPreviewNotice />}
                    <MetricAssumptionNotes
                      selectedYAxisMetric={selectedYAxisMetric}
                      activeHwKeys={activeHwTypes}
                      includeAllPowerThroughputMetrics={false}
                      includePowerThroughputCaveat={false}
                    />
                    <UnofficialDomainNotice />
                  </>
                }
                trendLines={trendLines}
                lineConfigs={lineConfigs}
                yLabel={currentYLabel}
                logScale={logScale}
                selectedPrecisions={selectedPrecisions}
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    onItemRemove={removeHwType}
                    legendItems={Object.entries(hardwareConfig)
                      .filter(([key]) => hwTypesWithData.has(key))
                      .toSorted(
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
                        label: t.logScale,
                        checked: logScale,
                        onCheckedChange: (checked: boolean) => {
                          setLogScale(checked);
                          track('historical_log_scale_toggled', { enabled: checked });
                        },
                      },
                      {
                        id: 'historical-high-contrast',
                        label: t.highContrast,
                        checked: highContrast,
                        onCheckedChange: (checked: boolean) => {
                          setHighContrast(checked);
                          track('historical_high_contrast_toggled', { enabled: checked });
                        },
                      },
                    ]}
                    actions={
                      [...hwTypesWithData].some((key) => !activeHwTypes.has(key))
                        ? [
                            {
                              id: 'historical-reset-filter',
                              label: t.resetFilter,
                              onClick: () => {
                                selectAllHwTypes();
                                track('historical_legend_filter_reset');
                              },
                            },
                          ]
                        : []
                    }
                    enableTooltips={true}
                  />
                }
              />
            </Card>
          </figure>
        </section>
      ) : (
        <Card>
          <p className="text-muted-foreground text-sm">{t.noData}</p>
        </Card>
      )}
    </section>
  );
}

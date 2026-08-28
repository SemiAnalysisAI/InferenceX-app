'use client';

import { useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { replaceRouterPathname } from '@/lib/client-navigation';
import { AGENTX_NEW_MODEL_DISPLAY_NAMES } from '@/lib/compare-agentx';
import { inferenceModelRouteForSelection } from '@/lib/inference-model-slug';
import { useFeatureGate } from '@/lib/use-feature-gate';

import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import {
  ModelSelector,
  ScenarioSelector,
  PercentileSelector,
  PrecisionSelector,
} from '@/components/ui/chart-selectors';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { METRIC_CONTROL_GROUPS, METRIC_REGISTRY } from '@/components/inference/metric-registry';
import { formatTokenPrice } from '@/components/inference/token-revenue';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { ModelArchitectureInfoLink } from './ModelArchitectureInfoLink';
import { Sequence, type Model, type Percentile } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    yAxisMetric: 'Y-Axis Metric',
    yAxisMetricTooltip:
      "The performance metric displayed on the chart's Y-axis. Options include throughput, token revenue per GPU hour, cost per million tokens, tokens per $1 USD or ¥1 CNY, and custom user-defined values.",
    xAxisMetric: 'X-Axis Metric',
    xAxisMetricTooltip:
      "The latency metric displayed on the chart's X-axis: P90 Time To First Token.",
    xAxisScale: 'X-Axis Scale',
    xAxisScaleTooltip:
      'The scale type for the X-axis. Auto automatically chooses between linear and logarithmic based on the data range. Linear uses a linear scale. Logarithmic uses a log scale for better visualization of wide-ranging values.',
    scaleAuto: 'Auto',
    scaleLinear: 'Linear',
    scaleLog: 'Logarithmic',
    gpuConfig: 'Chip Config',
    gpuConfigTooltip:
      'Select up to 4 chip configurations to compare their historical performance over time. This allows for tracking how software updates may affect specific hardware.',
    gpuConfigPlaceholder: 'Select a Chip Config for comparison',
    comparisonDateRange: 'Comparison Date Range',
    comparisonDateRangeTooltip:
      'Select the start and end dates for the historical comparison. The chart will show performance data for the selected chip configs across this time range.',
    dateRangePlaceholder: 'Select date range',
    revenuePriceSource: 'Revenue Price Source',
    revenuePriceSourceTooltip:
      'Choose the token sale prices used for revenue. Normalized prices input and output at $1/M tok. OpenRouter reads the selected model’s current public input and output prices.',
    normalizedPrice: 'Normalized ($1/M input + output)',
    openRouterPrice: 'OpenRouter current pricing',
    openRouterLoading: 'Loading OpenRouter pricing…',
    openRouterUnavailable: 'OpenRouter pricing is unavailable for this model.',
    openRouterSummary: (input: string, output: string) =>
      `Input $${input}/M tok · Output $${output}/M tok`,
    viewOpenRouter: 'View OpenRouter pricing',
  },
  zh: {
    yAxisMetric: 'Y 轴指标',
    yAxisMetricTooltip:
      '图表 Y 轴显示的性能指标，包括吞吐量、每 GPU 小时 token 收入、每百万 token 成本、每 1 美元可购买的 token 数以及自定义值。',
    xAxisMetric: 'X 轴指标',
    xAxisMetricTooltip: '图表 X 轴显示的延迟指标：P90 Time To First Token。',
    xAxisScale: 'X 轴刻度',
    xAxisScaleTooltip:
      'X 轴的刻度类型。自动模式根据数据范围自动选择线性或对数刻度。线性使用线性刻度。对数使用对数刻度，更适合展示范围较大的数据。',
    scaleAuto: '自动',
    scaleLinear: '线性',
    scaleLog: '对数',
    gpuConfig: '芯片配置',
    gpuConfigTooltip:
      '最多选择 4 个芯片配置以对比其历史性能趋势。可用于追踪软件更新对特定硬件的影响。',
    gpuConfigPlaceholder: '选择芯片配置进行对比',
    comparisonDateRange: '对比日期范围',
    comparisonDateRangeTooltip:
      '选择历史对比的起止日期。图表将展示所选芯片配置在此时间范围内的性能数据。',
    dateRangePlaceholder: '选择日期范围',
    revenuePriceSource: '收入计价来源',
    revenuePriceSourceTooltip:
      '选择计算 token 收入所用的售价。标准化模式将输入和输出 token 均按 $1/百万计价；OpenRouter 模式读取所选模型当前公开的输入和输出价格。',
    normalizedPrice: '标准化（输入和输出均为 $1/百万）',
    openRouterPrice: 'OpenRouter 当前价格',
    openRouterLoading: '正在加载 OpenRouter 价格…',
    openRouterUnavailable: 'OpenRouter 暂无该模型的价格。',
    openRouterSummary: (input: string, output: string) =>
      `输入 $${input}/百万 token · 输出 $${output}/百万 token`,
    viewOpenRouter: '查看 OpenRouter 定价',
  },
} as const;

const METRIC_GROUPS = METRIC_CONTROL_GROUPS;

const METRIC_TITLE_MAP = new Map(
  Object.entries(METRIC_REGISTRY).map(([key, metric]) => [`y_${key}`, metric.title]),
);

const METRIC_TITLE_ZH_MAP = new Map(
  Object.entries(METRIC_REGISTRY).map(([key, metric]) => [`y_${key}`, metric.titleZh]),
);

interface ChartControlsProps {
  /** Hide GPU Config selector and related date pickers (used by Historical Trends tab) */
  hideGpuComparison?: boolean;
}

export default function ChartControls({ hideGpuComparison = false }: ChartControlsProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  // The percentile selector is rendered conditionally on `selectedSequence`,
  // which on the client is hydrated from URL params. SSR doesn't see the URL,
  // so deferring the conditional until after mount keeps the initial DOM
  // identical between server and client (avoids hydration warnings).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown<string>();

  const { selectedModel, selectedSequence, selectedPrecisions, selectedGPUs, selectedDateRange } =
    useInferenceFilters();
  const {
    graphs,
    availableGPUs,
    dateRangeAvailableDates,
    isCheckingAvailableDates,
    availablePrecisions,
    availableSequences,
    availableModels,
  } = useInferenceData();
  const {
    selectedYAxisMetric,
    tokenRevenuePriceSource,
    tokenRevenuePricing,
    openRouterModelId,
    openRouterPricingLoading,
    openRouterPricingError,
    selectedPercentile,
    selectedXAxisMetric,
    scaleType,
  } = useInferenceDisplay();
  const {
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedYAxisMetric,
    setTokenRevenuePriceSource,
    setSelectedPercentile,
    setSelectedGPUs,
    setSelectedDateRange,
    setSelectedXAxisMetric,
    setScaleType,
  } = useInferenceActions();

  // Y-axis options come from the canonical registry and need no API data.
  // Gated groups appear only after the feature gate unlocks.
  const featureGateUnlocked = useFeatureGate();
  const visibleGroups = useMemo(
    () => METRIC_GROUPS.filter((g) => !g.gated || featureGateUnlocked),
    [featureGateUnlocked],
  );
  const metricGroupMap = useMemo(
    () =>
      new Map<string, string>(
        visibleGroups.flatMap((g) => g.metrics.map((m) => [m, g.label] as const)),
      ),
    [visibleGroups],
  );
  const groupedYAxisOptions = useMemo(
    () =>
      visibleGroups
        .map((group) => ({
          groupLabel: locale === 'zh' ? group.labelZh : group.label,
          options: group.metrics
            .filter((m) => METRIC_TITLE_MAP.has(m))
            .map((m) => ({
              value: m,
              label:
                (locale === 'zh' ? METRIC_TITLE_ZH_MAP.get(m) : undefined) ??
                METRIC_TITLE_MAP.get(m)!,
            })),
        }))
        .filter((g) => g.options.length > 0),
    [visibleGroups, locale],
  );

  const trackCombinedFilters = () => {
    if (selectedModel && selectedSequence && selectedPrecisions.length > 0 && selectedYAxisMetric) {
      track('inference_filters_changed', {
        model: selectedModel,
        sequence: selectedSequence,
        precision: selectedPrecisions.join(','),
        yAxisMetric: selectedYAxisMetric,
        yAxisMetricLabel: METRIC_TITLE_MAP.get(selectedYAxisMetric) ?? selectedYAxisMetric,
        yAxisMetricGroup: metricGroupMap.get(selectedYAxisMetric) ?? 'Unknown',
      });
    }
  };

  const handleModelChange = (value: Model) => {
    setSelectedModel(value);
    // A deliberate pick moves the URL onto the model's indexable subroute in
    // place — no reload, RSC refetch, or scroll reset. Kept out of the model
    // state effects on purpose: programmatic changes (back-nav restore,
    // config load, auto-switch) must not rewrite the URL, and event handlers
    // are immune to Strict Mode's double-invoked effects. `g_model` is
    // dropped because the path now carries the model — a lingering share
    // param would override it on the next snapshot read.
    const target = inferenceModelRouteForSelection(window.location.pathname, value);
    if (target !== null) replaceRouterPathname(target, ['g_model']);
    track('inference_model_selected', {
      model: value,
    });
    // Track combined after state update
    setTimeout(trackCombinedFilters, 0);
  };

  const handleSequenceChange = (value: Sequence) => {
    setSelectedSequence(value);
    track('inference_sequence_selected', {
      sequence: value,
    });
    setTimeout(trackCombinedFilters, 0);
  };

  const handlePrecisionChange = (value: string[]) => {
    setSelectedPrecisions(value);
    track('inference_precision_selected', {
      precision: value.join(','),
    });
    setTimeout(trackCombinedFilters, 0);
  };

  const handleYAxisMetricChange = (value: string) => {
    setSelectedYAxisMetric(value);
    track('inference_y_axis_metric_selected', {
      metric: value,
      metric_label: METRIC_TITLE_MAP.get(value) ?? value,
      metric_group: metricGroupMap.get(value) ?? 'Unknown',
    });
    setTimeout(trackCombinedFilters, 0);
  };

  const handleGPUChange = (value: string[]) => {
    setSelectedGPUs(value);
    track('inference_gpu_selected', {
      gpus: value.join(','),
    });
    setTimeout(trackCombinedFilters, 0);
  };

  const handleXAxisMetricChange = (value: string) => {
    setSelectedXAxisMetric(value);
    track('inference_x_axis_metric_selected', {
      metric: value,
    });
  };

  const handleScaleTypeChange = (value: 'auto' | 'linear' | 'log') => {
    setScaleType(value);
    track('inference_scale_type_selected', {
      scaleType: value,
    });
  };

  const isInputMetric = (() => {
    const chartDef = graphs[0]?.chartDefinition;
    if (!chartDef) return false;
    const titleKey = `${selectedYAxisMetric}_title` as keyof typeof chartDef;
    const title = (chartDef[titleKey] as string) || '';
    return title.toLowerCase().includes('input');
  })();

  const handleDateRangeChange = (range: { startDate: string; endDate: string }) => {
    setSelectedDateRange(range);
    track('inference_date_range_changed', {
      startDate: range.startDate,
      endDate: range.endDate,
    });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <ModelSelector
            value={selectedModel}
            onChange={handleModelChange}
            open={openDropdown === 'model'}
            onOpenChange={handleDropdownOpenChange('model')}
            availableModels={availableModels}
            data-testid="model-selector"
            trailing={<ModelArchitectureInfoLink model={selectedModel} locale={locale} />}
            newModels={AGENTX_NEW_MODEL_DISPLAY_NAMES}
          />
          <ScenarioSelector
            value={selectedSequence}
            onChange={handleSequenceChange}
            open={openDropdown === 'sequence'}
            onOpenChange={handleDropdownOpenChange('sequence')}
            availableSequences={availableSequences}
            data-testid="scenario-selector"
          />
          {/* AgentX publishes on P90, so the percentile control is an insider
              affordance rather than a normal chart filter: it stays behind the
              ↑↑↓↓ feature gate and the chart defaults to P90 without it. */}
          {mounted && selectedSequence === Sequence.AgenticTraces && featureGateUnlocked && (
            <PercentileSelector
              value={selectedPercentile}
              onChange={(p: Percentile) => setSelectedPercentile(p)}
              data-testid="percentile-selector"
            />
          )}
          <PrecisionSelector
            value={selectedPrecisions}
            onChange={handlePrecisionChange}
            open={openDropdown === 'precision'}
            onOpenChange={handleDropdownOpenChange('precision')}
            availablePrecisions={availablePrecisions}
            data-testid="precision-multiselect"
          />
          <div className="flex flex-col space-y-1.5 lg:col-span-2">
            <LabelWithTooltip
              htmlFor="y-axis-select"
              label={t.yAxisMetric}
              tooltip={t.yAxisMetricTooltip}
            />
            <SearchableSelect
              triggerId="y-axis-select"
              triggerTestId="yaxis-metric-selector"
              value={selectedYAxisMetric}
              onValueChange={handleYAxisMetricChange}
              placeholder={t.yAxisMetric}
              trackPrefix="yaxis_metric"
              groups={groupedYAxisOptions.map((g) => ({
                label: g.groupLabel,
                options: g.options,
              }))}
              searchPlaceholder={locale === 'zh' ? '搜索…' : undefined}
              searchAriaLabel={locale === 'zh' ? '搜索指标选项' : undefined}
              noResultsLabel={locale === 'zh' ? '无结果' : undefined}
              clearSearchLabel={locale === 'zh' ? '清除搜索' : undefined}
            />
          </div>

          {mounted && selectedYAxisMetric === 'y_tokenRevenuePerGpuHour' && (
            <div className="flex flex-col space-y-1.5 lg:col-span-2">
              <LabelWithTooltip
                htmlFor="token-revenue-price-source"
                label={t.revenuePriceSource}
                tooltip={t.revenuePriceSourceTooltip}
              />
              <Select
                value={tokenRevenuePriceSource}
                onValueChange={(value) => {
                  setTokenRevenuePriceSource(value as 'normalized' | 'openrouter');
                  track('inference_token_revenue_price_source_selected', { source: value });
                }}
              >
                <SelectTrigger
                  id="token-revenue-price-source"
                  data-testid="token-revenue-price-source"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectItem value="normalized">{t.normalizedPrice}</SelectItem>
                  <SelectItem value="openrouter">{t.openRouterPrice}</SelectItem>
                </SelectContent>
              </Select>
              {tokenRevenuePriceSource === 'openrouter' && (
                <p data-testid="openrouter-price-summary" className="text-xs text-muted-foreground">
                  {openRouterPricingLoading
                    ? t.openRouterLoading
                    : openRouterPricingError || !tokenRevenuePricing
                      ? t.openRouterUnavailable
                      : t.openRouterSummary(
                          formatTokenPrice(tokenRevenuePricing.inputPerMillion),
                          formatTokenPrice(tokenRevenuePricing.outputPerMillion),
                        )}{' '}
                  {openRouterModelId && (
                    <a
                      href={`https://openrouter.ai/${openRouterModelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                      data-testid="openrouter-pricing-link"
                      onClick={() => {
                        track('inference_openrouter_pricing_opened', {
                          model: selectedModel,
                          openRouterModelId,
                        });
                      }}
                    >
                      {t.viewOpenRouter}
                    </a>
                  )}
                </p>
              )}
            </div>
          )}

          {graphs.some((g) => g.chartDefinition?.chartType === 'interactivity') &&
            isInputMetric &&
            selectedSequence !== Sequence.AgenticTraces && (
              <div className="flex flex-col space-y-1.5 lg:col-span-1">
                <LabelWithTooltip
                  htmlFor="x-axis-select"
                  label={t.xAxisMetric}
                  tooltip={t.xAxisMetricTooltip}
                />
                <Select
                  onValueChange={handleXAxisMetricChange}
                  value={selectedXAxisMetric ?? 'p90_ttft'}
                >
                  <SelectTrigger
                    id="x-axis-select"
                    data-testid="xaxis-metric-selector"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portalled={false}>
                    <SelectItem value="p90_ttft">P90 TTFT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          {graphs.some((g) => g.chartDefinition?.chartType === 'interactivity') &&
            isInputMetric && (
              <div className="flex flex-col space-y-1.5 lg:col-span-1">
                <LabelWithTooltip
                  htmlFor="scale-type-select"
                  label={t.xAxisScale}
                  tooltip={t.xAxisScaleTooltip}
                />
                <Select onValueChange={handleScaleTypeChange} value={scaleType}>
                  <SelectTrigger
                    id="scale-type-select"
                    data-testid="scale-type-selector"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portalled={false}>
                    <SelectItem value="auto">{t.scaleAuto}</SelectItem>
                    <SelectItem value="linear">{t.scaleLinear}</SelectItem>
                    <SelectItem value="log">{t.scaleLog}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          {!hideGpuComparison && (
            <div className="flex flex-col space-y-1.5 lg:col-span-2">
              <LabelWithTooltip
                htmlFor="gpu-config-select"
                label={t.gpuConfig}
                tooltip={t.gpuConfigTooltip}
              />
              <div data-testid="gpu-multiselect">
                <MultiSelect
                  options={availableGPUs}
                  value={selectedGPUs}
                  onChange={handleGPUChange}
                  open={openDropdown === 'gpu'}
                  onOpenChange={handleDropdownOpenChange('gpu')}
                  placeholder={t.gpuConfigPlaceholder}
                  maxSelections={4}
                  searchPlaceholder={locale === 'zh' ? '搜索…' : undefined}
                  noResultsLabel={locale === 'zh' ? '无结果' : undefined}
                  clearSearchLabel={locale === 'zh' ? '清除搜索' : undefined}
                  selectedSuffix={locale === 'zh' ? ' 已选' : undefined}
                />
              </div>
            </div>
          )}

          {!hideGpuComparison && selectedGPUs.length > 0 && (
            <div className="flex flex-col space-y-1.5 lg:col-span-2">
              <LabelWithTooltip
                htmlFor="date-picker"
                label={t.comparisonDateRange}
                tooltip={t.comparisonDateRangeTooltip}
              />
              <DateRangePicker
                dateRange={selectedDateRange}
                onChange={handleDateRangeChange}
                placeholder={t.dateRangePlaceholder}
                availableDates={dateRangeAvailableDates}
                isCheckingAvailableDates={isCheckingAvailableDates}
              />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

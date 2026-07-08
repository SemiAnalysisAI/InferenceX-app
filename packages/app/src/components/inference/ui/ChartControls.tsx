'use client';

import { useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { cn } from '@/lib/utils';

import { useInference } from '@/components/inference/InferenceContext';
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
import { Button } from '@/components/ui/button';
import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type { ChartDefinition, DisaggMode, SpecMode } from '@/components/inference/types';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { Sequence, type Model, type Percentile } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    yAxisMetric: 'Y-Axis Metric',
    yAxisMetricTooltip:
      "The performance metric displayed on the chart's Y-axis. Options include throughput (tokens/sec), cost per million tokens, and custom user-defined values.",
    xAxisMetric: 'X-Axis Metric',
    xAxisMetricTooltip:
      "The latency metric displayed on the chart's X-axis: P90 Time To First Token.",
    xAxisScale: 'X-Axis Scale',
    xAxisScaleTooltip:
      'The scale type for the X-axis. Auto automatically chooses between linear and logarithmic based on the data range. Linear uses a linear scale. Logarithmic uses a log scale for better visualization of wide-ranging values.',
    scaleAuto: 'Auto',
    scaleLinear: 'Linear',
    scaleLog: 'Logarithmic',
    gpuConfig: 'GPU Config',
    gpuConfigTooltip:
      'Select up to 4 GPU configurations to compare their historical performance over time. This allows for tracking how software updates may affect specific hardware.',
    gpuConfigPlaceholder: 'Select a GPU Config for comparison',
    comparisonDateRange: 'Comparison Date Range',
    comparisonDateRangeTooltip:
      'Select the start and end dates for the historical comparison. The chart will show performance data for the selected GPU configs across this time range.',
    dateRangePlaceholder: 'Select date range',
    quickFilters: 'Quick Filters',
    quickFiltersTooltip:
      'Narrow the chart to any combination of GPU vendor, serving framework, aggregation mode (aggregated vs disaggregated serving), and speculative decoding (MTP vs standard). Selecting none in a group shows all.',
    filterVendor: 'Vendor',
    filterFramework: 'Framework',
    filterAggregation: 'Aggregation',
    filterSpecDecoding: 'Spec Decoding',
    noData: 'No data for the current selection',
  },
  zh: {
    yAxisMetric: 'Y 轴指标',
    yAxisMetricTooltip:
      '图表 Y 轴显示的性能指标。包括吞吐量（token/秒）、每百万 token 成本以及自定义用户值。',
    xAxisMetric: 'X 轴指标',
    xAxisMetricTooltip: '图表 X 轴显示的延迟指标：P90 Time To First Token。',
    xAxisScale: 'X 轴刻度',
    xAxisScaleTooltip:
      'X 轴的刻度类型。自动模式根据数据范围自动选择线性或对数刻度。线性使用线性刻度。对数使用对数刻度，更适合展示范围较大的数据。',
    scaleAuto: '自动',
    scaleLinear: '线性',
    scaleLog: '对数',
    gpuConfig: 'GPU 配置',
    gpuConfigTooltip:
      '最多选择 4 个 GPU 配置以对比其历史性能趋势。可用于追踪软件更新对特定硬件的影响。',
    gpuConfigPlaceholder: '选择 GPU 配置进行对比',
    comparisonDateRange: '对比日期范围',
    comparisonDateRangeTooltip:
      '选择历史对比的起止日期。图表将展示所选 GPU 配置在此时间范围内的性能数据。',
    dateRangePlaceholder: '选择日期范围',
    quickFilters: '快捷筛选',
    quickFiltersTooltip:
      '按 GPU 厂商、推理框架、聚合模式（聚合 vs 分离式）和投机解码（MTP vs 标准）的任意组合筛选图表。某组不选则显示全部。',
    filterVendor: '厂商',
    filterFramework: '框架',
    filterAggregation: '聚合模式',
    filterSpecDecoding: '投机解码',
    noData: '当前选择无可用数据',
  },
} as const;

/**
 * Y-axis metric options from static chart config JSON — available immediately, no API wait.
 *
 * Groups marked `gated: true` are hidden unless the konami-code feature gate is unlocked
 * (see useFeatureGate). Use this for surfaces that are wired but whose underlying data
 * pipeline is in the rollout phase (e.g. measured-power telemetry waiting on a runner-
 * side aggregation PR to start populating the DB).
 */
const METRIC_GROUPS: {
  label: string;
  labelZh: string;
  metrics: string[];
  gated?: boolean;
}[] = [
  {
    label: 'Throughput',
    labelZh: '吞吐量',
    metrics: [
      'y_tpPerGpu',
      'y_inputTputPerGpu',
      'y_outputTputPerGpu',
      'y_tpPerMw',
      'y_inputTputPerMw',
      'y_outputTputPerMw',
    ],
  },
  {
    label: 'Cost per Million Total Tokens',
    labelZh: '每百万总 token 成本',
    metrics: ['y_costh', 'y_costn', 'y_costr'],
  },
  {
    label: 'Cost per Million Output Tokens',
    labelZh: '每百万输出 token 成本',
    metrics: ['y_costhOutput', 'y_costnOutput', 'y_costrOutput'],
  },
  {
    label: 'Cost per Million Input Tokens',
    labelZh: '每百万输入 token 成本',
    metrics: ['y_costhi', 'y_costni', 'y_costri'],
  },
  {
    label: 'All-in Provisioned Energy per Token',
    labelZh: '每 token 全电源配置能耗',
    metrics: ['y_jTotal', 'y_jOutput', 'y_jInput'],
  },
  {
    label: 'Measured Energy',
    labelZh: '实测能耗',
    metrics: [
      'y_measuredPrefillAvgPower',
      'y_measuredDecodeAvgPower',
      'y_measuredAvgPower',
      'y_measuredJPerInputToken',
      'y_measuredJPerOutputToken',
      'y_measuredJPerTotalToken',
    ],
    gated: true,
  },
  { label: 'Custom User Values', labelZh: '自定义值', metrics: ['y_costUser', 'y_powerUser'] },
];

/** Map from metric key → human-readable title (e.g. "Token Throughput per GPU") */
const METRIC_TITLE_MAP = (() => {
  const chartDef = (chartDefinitions as ChartDefinition[])[0];
  const map = new Map<string, string>();
  for (const key of Object.keys(chartDef)) {
    if (key.startsWith('y_') && key.endsWith('_title')) {
      map.set(key.replace('_title', ''), chartDef[key as keyof ChartDefinition] as string);
    }
  }
  return map;
})();

const METRIC_TITLE_ZH_MAP = (() => {
  const chartDef = (chartDefinitions as ChartDefinition[])[0];
  const map = new Map<string, string>();
  for (const key of Object.keys(chartDef)) {
    if (key.startsWith('y_') && key.endsWith('_titleZh')) {
      const metricKey = key.replace('_titleZh', '');
      map.set(metricKey, chartDef[key] as string);
    }
  }
  return map;
})();

/** Quick-filter pill groups: vendor, aggregation mode, spec-decoding method. */
const QUICK_FILTER_VENDORS: { value: string; label: string }[] = [
  { value: 'NVIDIA', label: 'NVIDIA' },
  { value: 'AMD', label: 'AMD' },
];
const QUICK_FILTER_DISAGG: { value: DisaggMode; label: string }[] = [
  { value: 'agg', label: 'Aggregated' },
  { value: 'disagg', label: 'Disaggregated' },
];
const QUICK_FILTER_SPEC: { value: SpecMode; label: string }[] = [
  { value: 'mtp', label: 'MTP' },
  { value: 'stp', label: 'STP' },
];

/** Toggle a value in/out of a quick-filter selection array. */
function toggleValue<T extends string>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

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

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const handleDropdownOpenChange = (dropdownKey: string) => (open: boolean) => {
    if (open) {
      setOpenDropdown(dropdownKey);
      return;
    }
    setOpenDropdown((current) => (current === dropdownKey ? null : current));
  };

  const {
    selectedModel,
    setSelectedModel,
    selectedSequence,
    setSelectedSequence,
    selectedPrecisions,
    setSelectedPrecisions,
    selectedYAxisMetric,
    setSelectedYAxisMetric,
    selectedPercentile,
    setSelectedPercentile,
    graphs,
    selectedGPUs,
    setSelectedGPUs,
    availableGPUs,
    selectedDateRange,
    setSelectedDateRange,
    dateRangeAvailableDates,
    isCheckingAvailableDates,
    availablePrecisions,
    availableSequences,
    availableModels,
    selectedXAxisMetric,
    setSelectedXAxisMetric,
    scaleType,
    setScaleType,
    quickFilters,
    availableQuickFilters,
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDisagg,
    setQuickFilterSpec,
  } = useInference();

  // Y-axis metric options — built from static chart config JSON (no API dependency).
  // Hidden groups (Measured Energy) appear only after the ↑↑↓↓ feature gate unlocks.
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

  const handleQuickFilterToggle = (
    category: 'vendor' | 'framework' | 'disagg' | 'spec',
    value: string,
  ) => {
    const wasActive =
      category === 'vendor'
        ? quickFilters.vendors.includes(value)
        : category === 'framework'
          ? quickFilters.frameworks.includes(value)
          : category === 'disagg'
            ? quickFilters.disagg.includes(value as DisaggMode)
            : quickFilters.spec.includes(value as SpecMode);
    if (category === 'vendor') setQuickFilterVendors(toggleValue(quickFilters.vendors, value));
    else if (category === 'framework')
      setQuickFilterFrameworks(toggleValue(quickFilters.frameworks, value));
    else if (category === 'disagg')
      setQuickFilterDisagg(toggleValue(quickFilters.disagg, value as DisaggMode));
    else setQuickFilterSpec(toggleValue(quickFilters.spec, value as SpecMode));
    // `active` is the state *after* this toggle.
    track('inference_quick_filter_toggled', { category, value, active: !wasActive });
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

  // Quick-filter pill groups. Each option carries an `available` flag (has data
  // for the current model); the render disables unavailable options unless they
  // are currently selected, so a selection can always be toggled back off. The
  // Framework group is data-driven — only families present (or selected) are
  // offered, so it's omitted entirely when none resolve (e.g. while data loads).
  const fwSelected = quickFilters.frameworks;
  const frameworkOptions = FRAMEWORK_FAMILIES.filter(
    (f) => availableQuickFilters.frameworks.includes(f.key) || fwSelected.includes(f.key),
  ).map((f) => ({
    value: f.key,
    label: f.label,
    available: availableQuickFilters.frameworks.includes(f.key),
  }));
  const quickFilterGroups: {
    key: 'vendor' | 'framework' | 'disagg' | 'spec';
    label: string;
    options: readonly { value: string; label: string; available: boolean }[];
    selected: readonly string[];
  }[] = [
    {
      key: 'vendor',
      label: t.filterVendor,
      options: QUICK_FILTER_VENDORS.map((o) => ({
        ...o,
        available: availableQuickFilters.vendors.includes(o.value),
      })),
      selected: quickFilters.vendors,
    },
    ...(frameworkOptions.length > 0
      ? [
          {
            key: 'framework' as const,
            label: t.filterFramework,
            options: frameworkOptions,
            selected: quickFilters.frameworks,
          },
        ]
      : []),
    {
      key: 'disagg',
      label: t.filterAggregation,
      options: QUICK_FILTER_DISAGG.map((o) => ({
        ...o,
        available: availableQuickFilters.disagg.includes(o.value),
      })),
      selected: quickFilters.disagg,
    },
    {
      key: 'spec',
      label: t.filterSpecDecoding,
      options: QUICK_FILTER_SPEC.map((o) => ({
        ...o,
        available: availableQuickFilters.spec.includes(o.value),
      })),
      selected: quickFilters.spec,
    },
  ];

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
          />
          <ScenarioSelector
            value={selectedSequence}
            onChange={handleSequenceChange}
            open={openDropdown === 'sequence'}
            onOpenChange={handleDropdownOpenChange('sequence')}
            availableSequences={availableSequences}
            data-testid="scenario-selector"
          />
          {mounted && selectedSequence === Sequence.AgenticTraces && (
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
              noResultsLabel={locale === 'zh' ? '无结果' : undefined}
              clearSearchLabel={locale === 'zh' ? '清除搜索' : undefined}
            />
          </div>

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
                className={
                  selectedGPUs.length > 0 &&
                  (!selectedDateRange.startDate || !selectedDateRange.endDate)
                    ? 'border-red-500 ring-4 ring-red-500/40 animate-pulse'
                    : ''
                }
              />
            </div>
          )}
        </div>

        {!hideGpuComparison && (
          <div className="flex flex-col space-y-1.5" data-testid="quick-filters">
            <LabelWithTooltip
              htmlFor="quick-filters"
              label={t.quickFilters}
              tooltip={t.quickFiltersTooltip}
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {quickFilterGroups.map((group) => (
                <div key={group.key} className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{group.label}:</span>
                  <div className="flex flex-wrap gap-1">
                    {group.options.map((option) => {
                      const active = (group.selected as readonly string[]).includes(option.value);
                      // Disable options with no data, but keep a selected one
                      // clickable so it can always be toggled back off.
                      const disabled = !option.available && !active;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          aria-pressed={active}
                          disabled={disabled}
                          title={disabled ? t.noData : undefined}
                          // Active pills use the brand color (blue in light, amber in dark)
                          // rather than the amber primary fill.
                          className={cn(
                            'h-7 rounded-full px-3 text-xs',
                            active && 'bg-brand hover:bg-brand/90',
                          )}
                          data-testid={`quick-filter-${group.key}-${option.value}`}
                          onClick={() => handleQuickFilterToggle(group.key, option.value)}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

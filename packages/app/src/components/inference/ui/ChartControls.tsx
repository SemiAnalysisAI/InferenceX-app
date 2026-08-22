'use client';

import { useEffect, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { useFeatureGate } from '@/lib/use-feature-gate';

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
import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type { ChartDefinition } from '@/components/inference/types';
import { Sequence, type Model, type Percentile } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    yAxisMetric: 'Y-Axis Metric',
    yAxisMetricTooltip:
      "The performance metric displayed on the chart's Y-axis. Options include throughput, cost per million tokens, tokens per $1 USD or ¥1 CNY, and custom user-defined values.",
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
  },
  zh: {
    yAxisMetric: 'Y 轴指标',
    yAxisMetricTooltip:
      '图表 Y 轴显示的性能指标，包括吞吐量、每百万 token 成本、每 1 美元可购买的 token 数以及自定义用户值。',
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
    label: 'Total Tokens per $1 USD',
    labelZh: '每 1 美元可购买的总 token 数',
    metrics: ['y_tokensPerDollarH', 'y_tokensPerDollarN', 'y_tokensPerDollarR'],
  },
  {
    label: 'Total Tokens per ¥1 CNY',
    labelZh: '每 1 元人民币可购买的总 token 数',
    metrics: ['y_tokensPerRmbH', 'y_tokensPerRmbN', 'y_tokensPerRmbR'],
  },
  {
    label: 'Output Tokens per $1 USD',
    labelZh: '每 1 美元可购买的输出 token 数',
    metrics: ['y_outputTokensPerDollarH', 'y_outputTokensPerDollarN', 'y_outputTokensPerDollarR'],
  },
  {
    label: 'Output Tokens per ¥1 CNY',
    labelZh: '每 1 元人民币可购买的输出 token 数',
    metrics: ['y_outputTokensPerRmbH', 'y_outputTokensPerRmbN', 'y_outputTokensPerRmbR'],
  },
  {
    label: 'Input Tokens per $1 USD',
    labelZh: '每 1 美元可购买的输入 token 数',
    metrics: ['y_inputTokensPerDollarH', 'y_inputTokensPerDollarN', 'y_inputTokensPerDollarR'],
  },
  {
    label: 'Input Tokens per ¥1 CNY',
    labelZh: '每 1 元人民币可购买的输入 token 数',
    metrics: ['y_inputTokensPerRmbH', 'y_inputTokensPerRmbN', 'y_inputTokensPerRmbR'],
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
      'y_measuredJPerSuccessfulQuery',
      'y_measuredWhPerSuccessfulQuery',
      'y_measuredPowerPercentTdp',
    ],
  },
  {
    label: 'Custom User Values',
    labelZh: '自定义值',
    metrics: ['y_tokensPerDollarUser', 'y_costUser', 'y_powerUser'],
  },
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
              />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

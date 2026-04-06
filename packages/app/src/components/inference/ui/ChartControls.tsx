'use client';

import { track } from '@/lib/analytics';

import { useInference } from '@/components/inference/InferenceContext';
import {
  ModelSelector,
  SequenceSelector,
  PrecisionSelector,
} from '@/components/ui/chart-selectors';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type { ChartDefinition } from '@/components/inference/types';
import { Model, Sequence } from '@/lib/data-mappings';

// Build Y-axis metric options from static chart config JSON — available immediately, no API wait
const METRIC_GROUPS = [
  {
    label: 'Throughput',
    metrics: [
      'y_tpPerGpu',
      'y_inputTputPerGpu',
      'y_outputTputPerGpu',
      'y_tpPerMw',
      'y_inputTputPerMw',
      'y_outputTputPerMw',
    ],
  },
  { label: 'Cost per Million Total Tokens', metrics: ['y_costh', 'y_costn', 'y_costr'] },
  {
    label: 'Cost per Million Output Tokens',
    metrics: ['y_costhOutput', 'y_costnOutput', 'y_costrOutput'],
  },
  { label: 'Cost per Million Input Tokens', metrics: ['y_costhi', 'y_costni', 'y_costri'] },
  { label: 'All-in Provisioned Energy per Token', metrics: ['y_jTotal', 'y_jOutput', 'y_jInput'] },
  { label: 'Custom User Values', metrics: ['y_costUser', 'y_powerUser'] },
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

/** Map from metric key → group label (e.g. "Throughput", "Cost per Million Total Tokens") */
const METRIC_GROUP_MAP = new Map<string, string>(
  METRIC_GROUPS.flatMap((g) => g.metrics.map((m) => [m, g.label] as const)),
);

const GROUPED_Y_AXIS_OPTIONS = METRIC_GROUPS.map((group) => ({
  groupLabel: group.label,
  options: group.metrics
    .filter((m) => METRIC_TITLE_MAP.has(m))
    .map((m) => ({ value: m, label: METRIC_TITLE_MAP.get(m)! })),
})).filter((g) => g.options.length > 0);

interface ChartControlsProps {
  /** Hide GPU Config selector and related date pickers (used by Historical Trends tab) */
  hideGpuComparison?: boolean;
}

export default function ChartControls({ hideGpuComparison = false }: ChartControlsProps) {
  const {
    selectedModel,
    setSelectedModel,
    selectedSequence,
    setSelectedSequence,
    selectedPrecisions,
    setSelectedPrecisions,
    selectedYAxisMetric,
    setSelectedYAxisMetric,
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

  // Y-axis metric options — built from static chart config JSON (no API dependency)
  const groupedYAxisOptions = GROUPED_Y_AXIS_OPTIONS;

  const trackCombinedFilters = () => {
    if (selectedModel && selectedSequence && selectedPrecisions.length > 0 && selectedYAxisMetric) {
      track('inference_filters_changed', {
        model: selectedModel,
        sequence: selectedSequence,
        precision: selectedPrecisions.join(','),
        yAxisMetric: selectedYAxisMetric,
        yAxisMetricLabel: METRIC_TITLE_MAP.get(selectedYAxisMetric) ?? selectedYAxisMetric,
        yAxisMetricGroup: METRIC_GROUP_MAP.get(selectedYAxisMetric) ?? 'Unknown',
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
      metric_group: METRIC_GROUP_MAP.get(value) ?? 'Unknown',
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
            availableModels={availableModels}
            data-testid="model-selector"
          />
          <SequenceSelector
            value={selectedSequence}
            onChange={handleSequenceChange}
            availableSequences={availableSequences}
            data-testid="sequence-selector"
          />
          <PrecisionSelector
            value={selectedPrecisions}
            onChange={handlePrecisionChange}
            availablePrecisions={availablePrecisions}
            data-testid="precision-multiselect"
          />
          <div className="flex flex-col space-y-1.5 lg:col-span-2">
            <LabelWithTooltip
              htmlFor="y-axis-select"
              label="Y-Axis Metric"
              tooltip="The performance metric displayed on the chart's Y-axis. Options include throughput (tokens/sec), cost per million tokens, and custom user-defined values."
            />
            <Select onValueChange={handleYAxisMetricChange} value={selectedYAxisMetric}>
              <SelectTrigger
                id="y-axis-select"
                data-testid="yaxis-metric-selector"
                className="w-full"
              >
                <SelectValue placeholder="Y-Axis Metric" />
              </SelectTrigger>
              <SelectContent>
                {groupedYAxisOptions.map((group) => (
                  <SelectGroup key={group.groupLabel}>
                    <SelectLabel>{group.groupLabel}</SelectLabel>
                    {group.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {graphs.some((g) => g.chartDefinition?.chartType === 'interactivity') &&
            isInputMetric && (
              <div className="flex flex-col space-y-1.5 lg:col-span-1">
                <LabelWithTooltip
                  htmlFor="x-axis-select"
                  label="X-Axis Metric"
                  tooltip="The latency metric displayed on the chart's X-axis. Options include P99 Time To First Token and Median Time To First Token."
                />
                <Select
                  onValueChange={handleXAxisMetricChange}
                  value={selectedXAxisMetric ?? 'p99_ttft'}
                >
                  <SelectTrigger
                    id="x-axis-select"
                    data-testid="xaxis-metric-selector"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p99_ttft">P99 TTFT</SelectItem>
                    <SelectItem value="median_ttft">Median TTFT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          {graphs.some((g) => g.chartDefinition?.chartType === 'interactivity') &&
            isInputMetric && (
              <div className="flex flex-col space-y-1.5 lg:col-span-1">
                <LabelWithTooltip
                  htmlFor="scale-type-select"
                  label="X-Axis Scale"
                  tooltip="The scale type for the X-axis. Auto automatically chooses between linear and logarithmic based on the data range. Linear uses a linear scale. Logarithmic uses a log scale for better visualization of wide-ranging values."
                />
                <Select onValueChange={handleScaleTypeChange} value={scaleType}>
                  <SelectTrigger
                    id="scale-type-select"
                    data-testid="scale-type-selector"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="log">Logarithmic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          {!hideGpuComparison && (
            <div className="flex flex-col space-y-1.5 lg:col-span-2">
              <LabelWithTooltip
                htmlFor="gpu-config-select"
                label="GPU Config"
                tooltip="Select up to 4 GPU configurations to compare their historical performance over time. This allows for tracking how software updates may affect specific hardware."
              />
              <div data-testid="gpu-multiselect">
                <MultiSelect
                  options={availableGPUs}
                  value={selectedGPUs}
                  onChange={handleGPUChange}
                  placeholder="Select a GPU Config for comparison"
                  maxSelections={4}
                />
              </div>
            </div>
          )}

          {!hideGpuComparison && selectedGPUs.length > 0 && (
            <div className="flex flex-col space-y-1.5 lg:col-span-2">
              <LabelWithTooltip
                htmlFor="date-picker"
                label="Comparison Date Range"
                tooltip="Select the start and end dates for the historical comparison. The chart will show performance data for the selected GPU configs across this time range."
              />
              <DateRangePicker
                dateRange={selectedDateRange}
                onChange={handleDateRangeChange}
                placeholder="Select date range"
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
      </div>
    </TooltipProvider>
  );
}

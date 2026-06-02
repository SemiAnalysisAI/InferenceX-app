'use client';

import { track } from '@/lib/analytics';
import Link from 'next/link';
import { BarChart3, Table2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import CalculatorTable from '@/components/calculator/CalculatorTable';
import { useGlobalFilters } from '@/components/GlobalFilterContext';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import {
  ModelSelector,
  SequenceSelector,
  PrecisionSelector,
} from '@/components/ui/chart-selectors';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type Model,
  type Precision,
  type Sequence,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
} from '@/lib/data-mappings';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { useThemeColors } from '@/hooks/useThemeColors';

import { getDisplayLabel } from '@/lib/utils';
import { exportToCsv } from '@/lib/csv-export';
import { calculatorChartToCsv } from '@/lib/csv-export-helpers';

import type { HardwareConfig } from '@/components/inference/types';

import ThroughputBarChart from './ThroughputBarChart';
import { buildComparisonText, getResultLabel } from './calculator-comparison';
import { useCalculatorSelections } from './useCalculatorSelections';
import { getChartTitle } from './throughput-bar-chart-utils';
import type { BarMetric, CostProvider, CostType, InterpolatedResult } from './types';
import { useThroughputData } from './useThroughputData';

const COST_PROVIDER_OPTIONS: { value: CostProvider; label: string }[] = [
  { value: 'costh', label: 'Hyperscaler' },
  { value: 'costn', label: 'Neocloud' },
  { value: 'costr', label: '3yr Rental' },
];

const COST_TYPE_OPTIONS: { value: CostType; label: string }[] = [
  { value: 'total', label: 'Total Tokens' },
  { value: 'input', label: 'Input Tokens' },
  { value: 'output', label: 'Output Tokens' },
];

const BAR_METRIC_OPTIONS: { value: BarMetric; label: string }[] = [
  { value: 'throughput', label: 'Throughput' },
  { value: 'power', label: 'tok/s/MW' },
  { value: 'cost', label: 'Cost' },
];

const getBarMetricLabel = (metric: BarMetric) => {
  if (metric === 'throughput') return 'Throughput';
  if (metric === 'cost') return 'Cost';
  return 'tok/s/MW';
};

type CalculatorViewMode = 'chart' | 'table';

const CALCULATOR_VIEW_MODE_OPTIONS: SegmentedToggleOption<CalculatorViewMode>[] = [
  {
    value: 'chart',
    label: 'Chart',
    icon: <BarChart3 className="size-3.5" />,
    testId: 'calculator-chart-view-btn',
  },
  {
    value: 'table',
    label: 'Table',
    icon: <Table2 className="size-3.5" />,
    testId: 'calculator-table-view-btn',
  },
];

const CALCULATOR_MOBILE_VIEW_MODE_OPTIONS: SegmentedToggleOption<CalculatorViewMode>[] =
  CALCULATOR_VIEW_MODE_OPTIONS.map(({ testId: _testId, ...option }) => option);

interface CalculatorChartSectionProps {
  loading: boolean;
  viewMode: CalculatorViewMode;
  results: InterpolatedResult[];
  hardwareConfig: HardwareConfig;
  mode: 'interactivity_to_throughput';
  barMetric: BarMetric;
  costType: CostType;
  costProvider: CostProvider;
  targetValue: number;
  runUrl: string | undefined;
  selectedModel: Model;
  selectedPrecisions: string[];
  selectedSequence: Sequence;
  selectedRunDate: string | null;
  selectedBars: Set<string>;
  isLegendExpanded: boolean;
  highContrast: boolean;
  availableHwKeys: string[];
  visibleHwKeys: Set<string>;
  legendItems: React.ComponentProps<typeof ChartLegend>['legendItems'];
  resolveColor: (hwKey: string) => string;
  onExportCsv: () => void;
  setIsLegendExpanded: (expanded: boolean) => void;
  onViewModeChange: (value: CalculatorViewMode) => void;
  onBarSelect: (resultKey: string) => void;
  onItemRemove: (hwKey: string) => void;
  onToggleHighContrast: (checked: boolean) => void;
  onResetGpus: () => void;
}

// Chart/table figure: export buttons + view toggle, then either the throughput
// bar chart (with its sidebar legend) or the calculator table, both sharing the
// same caption.
function CalculatorChartSection({
  loading,
  viewMode,
  results,
  hardwareConfig,
  mode,
  barMetric,
  costType,
  costProvider,
  targetValue,
  runUrl,
  selectedModel,
  selectedPrecisions,
  selectedSequence,
  selectedRunDate,
  selectedBars,
  isLegendExpanded,
  highContrast,
  availableHwKeys,
  visibleHwKeys,
  legendItems,
  resolveColor,
  onExportCsv,
  setIsLegendExpanded,
  onViewModeChange,
  onBarSelect,
  onItemRemove,
  onToggleHighContrast,
  onResetGpus,
}: CalculatorChartSectionProps) {
  const captionContent = (
    <CalculatorCaption
      barMetric={barMetric}
      mode={mode}
      targetValue={targetValue}
      costType={costType}
      costProvider={costProvider}
      selectedModel={selectedModel}
      selectedPrecisions={selectedPrecisions}
      selectedSequence={selectedSequence}
      selectedRunDate={selectedRunDate}
      resultsCount={results.length}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
    />
  );

  return (
    <section data-testid="calculator-chart-section">
      <figure data-testid="calculator-figure" className="relative rounded-lg">
        <ChartButtons
          chartId="calculator-chart"
          analyticsPrefix="calculator"
          zoomResetEvent="d3chart_zoom_reset_calculator-chart"
          onExportCsv={onExportCsv}
          setIsLegendExpanded={setIsLegendExpanded}
          exportFileName={`InferenceX_calculator_${selectedModel}`}
          leadingControls={
            <SegmentedToggle
              value={viewMode}
              options={CALCULATOR_VIEW_MODE_OPTIONS}
              onValueChange={onViewModeChange}
              ariaLabel="View mode"
              testId="calculator-view-toggle"
              className="shrink-0"
            />
          }
        />
        <Card>
          {loading ? (
            <Skeleton className="h-125 w-full" />
          ) : viewMode === 'chart' ? (
            <ThroughputBarChart
              caption={captionContent}
              results={results}
              hardwareConfig={hardwareConfig}
              mode={mode}
              targetValue={targetValue}
              barMetric={barMetric}
              costType={costType}
              runUrl={runUrl}
              selectedBars={selectedBars}
              onBarSelect={onBarSelect}
              colorResolver={resolveColor}
              legendElement={
                availableHwKeys.length > 0 ? (
                  <CalculatorLegend
                    legendItems={legendItems}
                    isLegendExpanded={isLegendExpanded}
                    highContrast={highContrast}
                    showResetFilter={visibleHwKeys.size < availableHwKeys.length}
                    onItemRemove={onItemRemove}
                    onExpandedChange={(expanded) => {
                      setIsLegendExpanded(expanded);
                      track('calculator_legend_expanded', { expanded });
                    }}
                    onToggleHighContrast={onToggleHighContrast}
                    onResetGpus={onResetGpus}
                  />
                ) : undefined
              }
            />
          ) : (
            <>
              <figcaption>{captionContent}</figcaption>
              <CalculatorTable
                results={results}
                costType={costType}
                hardwareConfig={hardwareConfig}
              />
            </>
          )}
        </Card>
      </figure>
    </section>
  );
}

interface CalculatorLegendProps {
  legendItems: React.ComponentProps<typeof ChartLegend>['legendItems'];
  isLegendExpanded: boolean;
  highContrast: boolean;
  showResetFilter: boolean;
  onItemRemove: (hwKey: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  onToggleHighContrast: (checked: boolean) => void;
  onResetGpus: () => void;
}

// Sidebar legend for the calculator chart with the high-contrast switch and the
// conditional reset-filter action.
function CalculatorLegend({
  legendItems,
  isLegendExpanded,
  highContrast,
  showResetFilter,
  onItemRemove,
  onExpandedChange,
  onToggleHighContrast,
  onResetGpus,
}: CalculatorLegendProps) {
  return (
    <ChartLegend
      variant="sidebar"
      legendItems={legendItems}
      onItemRemove={onItemRemove}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={onExpandedChange}
      switches={[
        {
          id: 'calc-high-contrast',
          label: 'High Contrast',
          checked: highContrast,
          onCheckedChange: onToggleHighContrast,
        },
      ]}
      actions={
        showResetFilter
          ? [
              {
                id: 'calc-reset-filter',
                label: 'Reset filter',
                onClick: onResetGpus,
              },
            ]
          : []
      }
      enableTooltips={true}
    />
  );
}

interface CalculatorComparisonBannerProps {
  selectedBars: Set<string>;
  results: InterpolatedResult[];
  hardwareConfig: HardwareConfig;
  comparisonText: string[] | null;
  onClear: () => void;
}

// Banner below the chart: single-selection hint or the pairwise comparison
// lines, plus a clear-selection button.
function CalculatorComparisonBanner({
  selectedBars,
  results,
  hardwareConfig,
  comparisonText,
  onClear,
}: CalculatorComparisonBannerProps) {
  return (
    <section data-testid="calculator-comparison-banner">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {selectedBars.size === 1 && (
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const resultKey = [...selectedBars][0];
                  const r = results.find((res) => res.resultKey === resultKey);
                  if (!r) return resultKey;
                  return getResultLabel(r, hardwareConfig);
                })()}{' '}
                selected. Click another bar to compare.
              </p>
            )}
            {comparisonText && comparisonText.length > 0 && (
              <div className="space-y-1">
                {comparisonText.map((text) => (
                  <p key={text} className="text-sm font-medium">
                    {text}
                  </p>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
          >
            Clear selection
          </button>
        </div>
      </Card>
    </section>
  );
}

interface CalculatorControlsProps {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  availableModels: Model[];
  availableSequences: Sequence[];
  availablePrecisions: string[];
  costProvider: CostProvider;
  costType: CostType;
  barMetric: BarMetric;
  loading: boolean;
  hasData: boolean;
  currentRange: { min: number; max: number };
  targetValue: number;
  inputValue: string;
  openDropdown: string | null;
  onDropdownOpenChange: (dropdownKey: string) => (isOpen: boolean) => void;
  onModelChange: (value: string) => void;
  onSequenceChange: (value: string) => void;
  onPrecisionChange: (value: string[]) => void;
  onCostProviderChange: (value: string) => void;
  onCostTypeChange: (value: string) => void;
  onBarMetricChange: (value: BarMetric) => void;
  onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputBlur: () => void;
}

// Controls card: title + share, the model/sequence/precision/cost/token-type
// selectors, the metric toggle, and the target-interactivity slider.
function CalculatorControls({
  selectedModel,
  selectedSequence,
  selectedPrecisions,
  availableModels,
  availableSequences,
  availablePrecisions,
  costProvider,
  costType,
  barMetric,
  loading,
  hasData,
  currentRange,
  targetValue,
  inputValue,
  openDropdown,
  onDropdownOpenChange,
  onModelChange,
  onSequenceChange,
  onPrecisionChange,
  onCostProviderChange,
  onCostTypeChange,
  onBarMetricChange,
  onSliderChange,
  onInputChange,
  onInputBlur,
}: CalculatorControlsProps) {
  return (
    <Card className="relative z-30">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-2">TCO Calculator</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Set a target interactivity (tokens/sec/user) and compare the throughput and cost
              across all GPUs. Values are interpolated from real benchmark data.
            </p>
          </div>
          <ChartShareActions />
        </div>

        {/* Controls — grid layout matching inference chart controls */}
        <TooltipProvider delayDuration={0}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <ModelSelector
              id="calc-model"
              data-testid="calc-model-selector"
              value={selectedModel}
              onChange={onModelChange}
              open={openDropdown === 'model'}
              onOpenChange={onDropdownOpenChange('model')}
              availableModels={availableModels}
            />
            <SequenceSelector
              id="calc-sequence"
              data-testid="calc-sequence-selector"
              value={selectedSequence}
              onChange={onSequenceChange}
              open={openDropdown === 'sequence'}
              onOpenChange={onDropdownOpenChange('sequence')}
              availableSequences={availableSequences}
            />
            <PrecisionSelector
              id="calc-precision"
              data-testid="calc-precision-selector"
              value={selectedPrecisions}
              onChange={onPrecisionChange}
              open={openDropdown === 'precision'}
              onOpenChange={onDropdownOpenChange('precision')}
              availablePrecisions={availablePrecisions}
            />

            <div className="flex flex-col gap-1.5 lg:col-span-1">
              <LabelWithTooltip
                htmlFor="calc-cost"
                label="Cost Provider"
                tooltip="The pricing tier used to calculate cost per million tokens. Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental."
              />
              <div id="calc-cost" data-testid="calc-cost-selector">
                <MultiSelect
                  options={COST_PROVIDER_OPTIONS.map((c) => ({
                    value: c.value,
                    label: c.label,
                  }))}
                  value={[costProvider]}
                  onChange={(values) => {
                    const next = values[0];
                    if (!next) return;
                    onCostProviderChange(next);
                  }}
                  open={openDropdown === 'costProvider'}
                  onOpenChange={onDropdownOpenChange('costProvider')}
                  placeholder="Cost provider"
                  minSelections={1}
                  maxSelections={1}
                  showClearAll={false}
                  searchable={false}
                  plainSelectedText
                  showSelectionSummary={false}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 lg:col-span-1">
              <LabelWithTooltip
                htmlFor="calc-cost-type"
                label="Token Type"
                tooltip="Whether to show costs for total tokens, input tokens only, or output tokens only."
              />
              <div id="calc-cost-type" data-testid="calc-cost-type-selector">
                <MultiSelect
                  options={COST_TYPE_OPTIONS.map((ct) => ({
                    value: ct.value,
                    label: ct.label,
                  }))}
                  value={[costType]}
                  onChange={(values) => {
                    const next = values[0];
                    if (!next) return;
                    onCostTypeChange(next);
                  }}
                  open={openDropdown === 'costType'}
                  onOpenChange={onDropdownOpenChange('costType')}
                  placeholder="Token type"
                  minSelections={1}
                  maxSelections={1}
                  showClearAll={false}
                  searchable={false}
                  plainSelectedText
                  showSelectionSummary={false}
                />
              </div>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <LabelWithTooltip
                htmlFor="calc-metric"
                label="Metric"
                tooltip="The comparison metric shown in the chart. Throughput (tok/s/gpu), power efficiency (tok/s/MW), or cost per million tokens."
              />
              <div className="flex rounded-lg border border-border overflow-hidden h-9">
                {BAR_METRIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`calculator-metric-${opt.value}`}
                    className={`px-3 text-xs font-medium transition-colors ${
                      barMetric === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => onBarMetricChange(opt.value)}
                  >
                    {getBarMetricLabel(opt.value)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Target value slider + input */}
          {!loading && hasData && (
            <div className="space-y-2">
              <LabelWithTooltip
                htmlFor="calc-target"
                label="Target Interactivity (tok/s/user)"
                tooltip="The interactivity operating point used for interpolation. Adjust the slider to compare GPU throughput, cost, and power efficiency at different interactivity levels."
              />
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <input
                    id="calc-target"
                    type="range"
                    aria-label="Target Interactivity (tok/s/user)"
                    min={currentRange.min}
                    max={currentRange.max}
                    step={1}
                    value={targetValue}
                    onChange={onSliderChange}
                    onPointerUp={() =>
                      track('calculator_target_slider_set', {
                        mode: 'interactivity_to_throughput',
                        value: targetValue,
                      })
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
                          currentRange.min + (currentRange.max - currentRange.min) * (i / 5),
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <Input
                  type="number"
                  value={inputValue}
                  onChange={onInputChange}
                  onBlur={onInputBlur}
                  className="w-24 h-9"
                  min={0}
                />
              </div>
            </div>
          )}
        </TooltipProvider>
      </div>
    </Card>
  );
}

interface CalculatorCaptionProps {
  barMetric: BarMetric;
  mode: 'interactivity_to_throughput';
  targetValue: number;
  costType: CostType;
  costProvider: CostProvider;
  selectedModel: Model;
  selectedPrecisions: string[];
  selectedSequence: Sequence;
  selectedRunDate: string | null;
  resultsCount: number;
  viewMode: CalculatorViewMode;
  onViewModeChange: (value: CalculatorViewMode) => void;
}

// Chart caption: title + view toggle (mobile), metadata line, per-metric source
// badges, the animated disagg caveat banners, and the unofficial-domain notice.
function CalculatorCaption({
  barMetric,
  mode,
  targetValue,
  costType,
  costProvider,
  selectedModel,
  selectedPrecisions,
  selectedSequence,
  selectedRunDate,
  resultsCount,
  viewMode,
  onViewModeChange,
}: CalculatorCaptionProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">
          {getChartTitle(barMetric, mode, targetValue, costType, costProvider)}
        </h2>
        <SegmentedToggle
          value={viewMode}
          options={CALCULATOR_MOBILE_VIEW_MODE_OPTIONS}
          onValueChange={onViewModeChange}
          ariaLabel="View mode"
          className="md:hidden shrink-0"
        />
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        {getModelLabel(selectedModel)} •{' '}
        {selectedPrecisions.map((p) => getPrecisionLabel(p as Precision)).join(', ')} •{' '}
        {getSequenceLabel(selectedSequence)} • Source: SemiAnalysis InferenceX™
        {selectedRunDate && <> • Updated: {selectedRunDate}</>}
      </p>
      {barMetric === 'power' && resultsCount > 0 && (
        <>
          <p
            className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center"
            data-testid="calculator-cost-badges"
          >
            All in Power/GPU:{' '}
            {Object.entries(HW_REGISTRY).map(([base, specs]) => (
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
      {barMetric === 'cost' && resultsCount > 0 && (
        <>
          <p
            className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center"
            data-testid="calculator-cost-badges"
          >
            TCO $/GPU/hr:{' '}
            {Object.entries(HW_REGISTRY).map(([base, specs]) => (
              <Badge key={base} variant="outline">
                {base.toUpperCase()}: $
                {(costProvider === 'costh'
                  ? specs.costh
                  : costProvider === 'costn'
                    ? specs.costn
                    : specs.costr
                ).toFixed(2)}
                /hr
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
          barMetric === 'cost' ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
          TRT) calculate cost per decode GPU or per prefill GPU, rather than per total GPU count.
          This makes direct cost comparison with aggregated configs not an apples-to-apples
          comparison.
        </p>
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          barMetric === 'throughput' || barMetric === 'power'
            ? 'max-h-20 opacity-100'
            : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
          TRT) calculate throughput per decode GPU or per prefill GPU, rather than per total GPU
          count. This makes direct throughput comparison with aggregated configs not an
          apples-to-apples comparison.
        </p>
      </div>
      <UnofficialDomainNotice />
    </>
  );
}

export default function ThroughputCalculatorDisplay() {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const handleDropdownOpenChange = (dropdownKey: string) => (isOpen: boolean) => {
    if (isOpen) {
      setOpenDropdown(dropdownKey);
      return;
    }
    setOpenDropdown((current) => (current === dropdownKey ? null : current));
  };

  const {
    selectedModel,
    setSelectedModel,
    selectedRunDate,
    workflowInfo,
    effectiveSequence: selectedSequence,
    setSelectedSequence,
    effectivePrecisions: selectedPrecisions,
    setSelectedPrecisions,
    availablePrecisions,
    availableSequences,
    availableModels,
  } = useGlobalFilters();

  const mode = 'interactivity_to_throughput' as const;
  const [costProvider, setCostProvider] = useState<CostProvider>('costh');
  const [costType, setCostType] = useState<CostType>('total');
  const [targetValue, setTargetValue] = useState<number>(35);
  const [inputValue, setInputValue] = useState<string>('35');
  const [barMetric, setBarMetric] = useState<BarMetric>('throughput');
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [viewMode, setViewMode] = useState<CalculatorViewMode>('chart');

  const { hardwareConfig, ranges, getResults, loading, error, hasData, availableHwKeys } =
    useThroughputData(selectedModel, selectedSequence, selectedPrecisions, selectedRunDate);

  const {
    visibleHwKeys,
    selectedBars,
    setSelectedBars,
    toggleGpuVisibility,
    removeGpu,
    handleResetGpus,
    handleBarSelect,
  } = useCalculatorSelections(availableHwKeys);

  // Dynamic vendor-aware colors for visible GPUs
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({
    highContrast,
    activeKeys: visibleKeysArray,
  });

  // Clamp the (user-editable) target back into range when the data's range
  // changes. Done during render with a prev-key comparison instead of an effect
  // so the clamp commits in the same render rather than after an extra pass.
  const interactivityRangeKey = hasData
    ? `${ranges.interactivity.min},${ranges.interactivity.max}`
    : '';
  const [prevRangeKey, setPrevRangeKey] = useState(interactivityRangeKey);
  if (interactivityRangeKey !== prevRangeKey) {
    setPrevRangeKey(interactivityRangeKey);
    if (hasData) {
      const { min, max } = ranges.interactivity;
      if (targetValue < min || targetValue > max) {
        const clamped = Math.max(min, Math.min(max, targetValue));
        setTargetValue(clamped);
        setInputValue(String(clamped));
      }
    }
  }

  const results: InterpolatedResult[] = useMemo(() => {
    if (!hasData) return [];
    return getResults(targetValue, mode, costProvider, visibleHwKeys);
  }, [hasData, targetValue, mode, costProvider, getResults, visibleHwKeys]);

  const currentRange = useMemo(() => ranges.interactivity, [ranges]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setTargetValue(val);
    setInputValue(String(val));
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed) && parsed >= 0) {
      setTargetValue(parsed);
    }
  }, []);

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed < 0) {
      setInputValue(String(targetValue));
    } else {
      const { min, max } = ranges.interactivity;
      const clamped = Math.max(min, Math.min(max, parsed));
      setTargetValue(clamped);
      setInputValue(String(clamped));
    }
    track('calculator_target_set', { mode, value: targetValue });
  }, [inputValue, targetValue, mode, ranges]);

  const handleCostProviderChange = useCallback((value: string) => {
    setCostProvider(value as CostProvider);
    track('calculator_cost_provider_changed', { provider: value });
  }, []);

  const handleCostTypeChange = useCallback((value: string) => {
    setCostType(value as CostType);
    track('calculator_cost_type_changed', { costType: value });
  }, []);

  const handleModelChange = useCallback(
    (value: string) => {
      setSelectedModel(value as Model);
      track('calculator_model_selected', { model: value });
    },
    [setSelectedModel],
  );

  const handleSequenceChange = useCallback(
    (value: string) => {
      setSelectedSequence(value as Sequence);
      track('calculator_sequence_selected', { sequence: value });
    },
    [setSelectedSequence],
  );

  const handlePrecisionChange = useCallback(
    (value: string[]) => {
      setSelectedPrecisions(value);
      track('calculator_precision_selected', { precision: value.join(',') });
    },
    [setSelectedPrecisions],
  );

  const handleBarMetricChange = useCallback((value: BarMetric) => {
    setBarMetric(value);
    track('calculator_bar_metric_changed', { metric: value });
  }, []);

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = calculatorChartToCsv(results, targetValue, (hwKey) => {
      const config = hardwareConfig[hwKey] || getHardwareConfig(hwKey);
      return config ? getDisplayLabel(config) : hwKey;
    });
    exportToCsv(`InferenceX_calculator_${selectedModel}`, headers, rows);
  }, [results, targetValue, hardwareConfig, selectedModel]);

  const handleViewModeChange = useCallback((value: CalculatorViewMode) => {
    setViewMode(value);
    track('calculator_view_changed', { view: value });
  }, []);

  // Derive runUrl from workflowInfo for the selected sequence
  const runUrl = useMemo(() => {
    if (!Array.isArray(workflowInfo) || workflowInfo.length === 0) return undefined;
    const wf = workflowInfo[0];
    return wf?.runInfoBySequence?.[selectedSequence]?.runUrl;
  }, [workflowInfo, selectedSequence]);

  // Clear bar selection when results change (data/filter changes). Lives here
  // (not in useCalculatorSelections) because `results` depends on visibleHwKeys
  // produced by that hook.
  useEffect(() => {
    setSelectedBars(new Set());
  }, [results, setSelectedBars]);

  // Generate comparison text when 2+ bars are selected
  const comparisonText = useMemo(
    () => buildComparisonText(selectedBars, results, hardwareConfig, barMetric, costType),
    [selectedBars, results, hardwareConfig, barMetric, costType],
  );

  // Build legend items for ChartLegend sidebar, sorted by MODEL_ORDER (same as Inference Performance tab)
  const legendItems = useMemo(() => {
    const availableSet = new Set(availableHwKeys);
    return Object.entries(hardwareConfig)
      .filter(([key]) => availableSet.has(key))
      .toSorted(([a], [b]) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map(([key, config]) => ({
        name: config.name,
        label: getDisplayLabel(config),
        color: resolveColor(key),
        title: config.gpu,
        hw: key,
        isActive: visibleHwKeys.has(key),
        onClick: () => toggleGpuVisibility(key),
      }));
  }, [availableHwKeys, hardwareConfig, visibleHwKeys, toggleGpuVisibility, resolveColor]);

  if (!loading && error) {
    console.error(error);
    return (
      <Card>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Error loading data. Please try a different selection.
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section data-testid="calculator-controls">
        <CalculatorControls
          selectedModel={selectedModel}
          selectedSequence={selectedSequence}
          selectedPrecisions={selectedPrecisions}
          availableModels={availableModels}
          availableSequences={availableSequences}
          availablePrecisions={availablePrecisions}
          costProvider={costProvider}
          costType={costType}
          barMetric={barMetric}
          loading={loading}
          hasData={hasData}
          currentRange={currentRange}
          targetValue={targetValue}
          inputValue={inputValue}
          openDropdown={openDropdown}
          onDropdownOpenChange={handleDropdownOpenChange}
          onModelChange={handleModelChange}
          onSequenceChange={handleSequenceChange}
          onPrecisionChange={handlePrecisionChange}
          onCostProviderChange={handleCostProviderChange}
          onCostTypeChange={handleCostTypeChange}
          onBarMetricChange={handleBarMetricChange}
          onSliderChange={handleSliderChange}
          onInputChange={handleInputChange}
          onInputBlur={handleInputBlur}
        />
      </section>

      {/* Chart / Table */}
      <CalculatorChartSection
        loading={loading}
        viewMode={viewMode}
        results={results}
        hardwareConfig={hardwareConfig}
        mode={mode}
        barMetric={barMetric}
        costType={costType}
        costProvider={costProvider}
        targetValue={targetValue}
        runUrl={runUrl}
        selectedModel={selectedModel}
        selectedPrecisions={selectedPrecisions}
        selectedSequence={selectedSequence}
        selectedRunDate={selectedRunDate}
        selectedBars={selectedBars}
        isLegendExpanded={isLegendExpanded}
        highContrast={highContrast}
        availableHwKeys={availableHwKeys}
        visibleHwKeys={visibleHwKeys}
        legendItems={legendItems}
        resolveColor={resolveColor}
        onExportCsv={handleExportCsv}
        setIsLegendExpanded={setIsLegendExpanded}
        onViewModeChange={handleViewModeChange}
        onBarSelect={handleBarSelect}
        onItemRemove={removeGpu}
        onToggleHighContrast={(checked) => {
          setHighContrast(checked);
          track('calculator_high_contrast_toggled', { enabled: checked });
        }}
        onResetGpus={handleResetGpus}
      />

      {/* Comparison banner — only shown in chart view */}
      {viewMode === 'chart' && selectedBars.size > 0 && (
        <CalculatorComparisonBanner
          selectedBars={selectedBars}
          results={results}
          hardwareConfig={hardwareConfig}
          comparisonText={comparisonText}
          onClear={() => {
            track('calculator_selection_cleared', { clearedCount: selectedBars.size });
            setSelectedBars(new Set());
          }}
        />
      )}
    </div>
  );
}

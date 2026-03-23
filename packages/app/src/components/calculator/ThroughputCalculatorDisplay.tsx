'use client';

import { track } from '@/lib/analytics';
import Link from 'next/link';
import { BarChart3, Download, FileSpreadsheet, Image, RotateCcw, Table2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import { WorkflowInfo } from '@/components/inference/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartLegend from '@/components/ui/chart-legend';
import {
  ModelSelector,
  SequenceSelector,
  PrecisionSelector,
} from '@/components/ui/chart-selectors';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ShareButton } from '@/components/ui/share-button';
import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
  Model,
  Precision,
  Sequence,
} from '@/lib/data-mappings';
import { getModelSortIndex, GPU_SPECS, HARDWARE_CONFIG } from '@/lib/constants';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChartExport } from '@/hooks/useChartExport';
import { getDisplayLabel } from '@/lib/utils';
import { exportToCsv } from '@/lib/csv-export';
import { calculatorChartToCsv } from '@/lib/csv-export-helpers';

import ThroughputBarChart, {
  getChartTitle,
  getThroughputForType,
  getTpPerMwForType,
} from './ThroughputBarChart';
import { BarMetric, CostProvider, CostType, InterpolatedResult } from './types';
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

function CalculatorChartButtons({
  viewMode,
  setViewMode,
  chartId,
  onExportCsv,
  setIsLegendExpanded,
}: {
  viewMode: 'chart' | 'table';
  setViewMode: (v: 'chart' | 'table') => void;
  chartId: string;
  onExportCsv: () => void;
  setIsLegendExpanded?: (expanded: boolean) => void;
}) {
  const { isExporting, exportToImage } = useChartExport({ chartId, setIsLegendExpanded });
  const [exportPopoverOpen, setExportPopoverOpen] = useState(false);

  const handleExportPng = () => {
    setExportPopoverOpen(false);
    track('calculator_chart_exported');
    exportToImage();
  };

  const handleExportCsv = () => {
    setExportPopoverOpen(false);
    track('calculator_csv_exported');
    onExportCsv();
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  };

  return (
    <div className="hidden md:flex absolute top-6 right-6 md:top-8 md:right-8 no-export export-buttons gap-1 z-10">
      <div
        className="inline-flex items-center rounded-lg border border-border p-0.5 gap-0.5 shrink-0"
        role="tablist"
        aria-label="View mode"
        data-testid="calculator-view-toggle"
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'chart'}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            viewMode === 'chart'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            setViewMode('chart');
            track('calculator_view_changed', { view: 'chart' });
          }}
          data-testid="calculator-chart-view-btn"
        >
          <BarChart3 className="size-3.5" />
          Chart
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'table'}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            viewMode === 'table'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            setViewMode('table');
            track('calculator_view_changed', { view: 'table' });
          }}
          data-testid="calculator-table-view-btn"
        >
          <Table2 className="size-3.5" />
          Table
        </button>
      </div>
      <Popover open={exportPopoverOpen} onOpenChange={setExportPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            data-testid="export-button"
            variant="outline"
            size={isExporting ? 'default' : 'icon'}
            className={`h-7 shrink-0 ${isExporting ? '' : 'w-7'}`}
            disabled={isExporting}
          >
            <Download className={isExporting ? 'mr-2' : ''} size={16} />
            {isExporting && 'Exporting...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <button
            data-testid="export-png-button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={handleExportPng}
          >
            <Image size={14} />
            Download PNG
          </button>
          <button
            data-testid="export-csv-button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={handleExportCsv}
          >
            <FileSpreadsheet size={14} />
            Download CSV
          </button>
        </PopoverContent>
      </Popover>
      <Button
        data-testid="zoom-reset-button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          track('calculator_zoom_reset_button');
          window.dispatchEvent(new CustomEvent(`d3chart_zoom_reset_${chartId}`));
        }}
      >
        <RotateCcw size={16} />
      </Button>
    </div>
  );
}

export default function ThroughputCalculatorDisplay() {
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
  const [visibleHwKeys, setVisibleHwKeys] = useState<Set<string>>(new Set());
  const [selectedBars, setSelectedBars] = useState<Set<string>>(new Set());
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const { hardwareConfig, ranges, getResults, loading, error, hasData, availableHwKeys } =
    useThroughputData(selectedModel, selectedSequence, selectedPrecisions, selectedRunDate);

  // Track previous available keys to detect when the GPU set changes
  const prevAvailableKeyRef = useRef<string>('');

  // Reset visible GPUs when the available set changes (model/sequence/precision change or customer filter toggle)
  useEffect(() => {
    if (availableHwKeys.length === 0) return;
    const key = [...availableHwKeys].sort().join(',');
    if (key !== prevAvailableKeyRef.current) {
      prevAvailableKeyRef.current = key;
      setVisibleHwKeys(new Set(availableHwKeys));
    }
  }, [availableHwKeys]);

  // Clamp target into range when data changes
  useEffect(() => {
    if (!hasData) return;
    const { min, max } = ranges.interactivity;
    if (targetValue < min || targetValue > max) {
      const clamped = Math.max(min, Math.min(max, targetValue));
      setTargetValue(clamped);
      setInputValue(String(clamped));
    }
  }, [hasData, ranges]);

  const results: InterpolatedResult[] = useMemo(() => {
    if (!hasData) return [];
    return getResults(targetValue, mode, costProvider, visibleHwKeys);
  }, [hasData, targetValue, mode, costProvider, getResults, visibleHwKeys]);

  const currentRange = useMemo(() => {
    return ranges.interactivity;
  }, [ranges]);

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

  const toggleGpuVisibility = useCallback(
    (hwKey: string) => {
      setVisibleHwKeys((prev) => {
        const allVisible = prev.size === availableHwKeys.length;
        const isVisible = prev.has(hwKey);

        if (isVisible) {
          if (allVisible) {
            // If all visible and clicking one, solo it
            return new Set([hwKey]);
          } else if (prev.size === 1) {
            // If only one visible and clicking it, show all
            return new Set(availableHwKeys);
          } else {
            // Remove it
            const next = new Set(prev);
            next.delete(hwKey);
            return next;
          }
        } else {
          // Add it
          const next = new Set(prev);
          next.add(hwKey);
          return next;
        }
      });
      track('calculator_gpu_toggled', { gpu: hwKey });
    },
    [availableHwKeys],
  );

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = calculatorChartToCsv(results, targetValue, (hwKey) => {
      const config = hardwareConfig[hwKey] || HARDWARE_CONFIG[hwKey];
      return config ? getDisplayLabel(config) : hwKey;
    });
    exportToCsv(`calculator-${Date.now()}`, headers, rows);
  }, [results, targetValue, hardwareConfig]);

  const handleResetGpus = useCallback(() => {
    setVisibleHwKeys(new Set(availableHwKeys));
    track('calculator_gpu_reset');
  }, [availableHwKeys]);

  // Derive runUrl from workflowInfo for the selected sequence
  const runUrl = useMemo(() => {
    if (!Array.isArray(workflowInfo) || workflowInfo.length === 0) return undefined;
    const wf = workflowInfo[0] as WorkflowInfo;
    return wf?.runInfoBySequence?.[selectedSequence]?.runUrl;
  }, [workflowInfo, selectedSequence]);

  // Handle bar selection: click to toggle (uses resultKey for unique identification)
  const handleBarSelect = useCallback((resultKey: string) => {
    setSelectedBars((prev) => {
      const next = new Set(prev);
      if (next.has(resultKey)) {
        next.delete(resultKey);
      } else {
        next.add(resultKey);
      }
      return next;
    });
  }, []);

  // Clear bar selection when results change (data/filter changes)
  useEffect(() => {
    setSelectedBars(new Set());
  }, [results]);

  // Generate comparison text when 2+ bars are selected
  const comparisonText = useMemo(() => {
    if (selectedBars.size < 2) return null;

    const selectedResults = results.filter((r) => selectedBars.has(r.resultKey));
    if (selectedResults.length < 2) return null;

    const getLabel = (r: InterpolatedResult) => {
      const config = hardwareConfig[r.hwKey] || HARDWARE_CONFIG[r.hwKey];
      const baseName = config ? getDisplayLabel(config) : r.hwKey;
      if (r.precision) return `${baseName} (${r.precision.toUpperCase()})`;
      return baseName;
    };

    const metricName =
      barMetric === 'power' ? 'tok/s/MW' : barMetric === 'cost' ? 'cost efficiency' : 'throughput';

    // Generate pairwise comparisons — always use lower as denominator
    const comparisons: string[] = [];
    for (let i = 0; i < selectedResults.length; i++) {
      for (let j = i + 1; j < selectedResults.length; j++) {
        const a = selectedResults[i];
        const b = selectedResults[j];
        const aVal =
          barMetric === 'power'
            ? getTpPerMwForType(a, costType)
            : barMetric === 'cost'
              ? costType === 'input'
                ? a.costInput
                : costType === 'output'
                  ? a.costOutput
                  : a.cost
              : getThroughputForType(a, costType);
        const bVal =
          barMetric === 'power'
            ? getTpPerMwForType(b, costType)
            : barMetric === 'cost'
              ? costType === 'input'
                ? b.costInput
                : costType === 'output'
                  ? b.costOutput
                  : b.cost
              : getThroughputForType(b, costType);

        const higher = aVal >= bVal ? a : b;
        const lower = aVal >= bVal ? b : a;
        const higherVal = Math.max(aVal, bVal);
        const lowerVal = Math.min(aVal, bVal);

        if (lowerVal > 0) {
          const ratio = higherVal / lowerVal;
          comparisons.push(
            `${getLabel(higher)} is ${ratio.toFixed(1)}x more ${metricName} than ${getLabel(lower)}`,
          );
        }
      }
    }

    return comparisons;
  }, [selectedBars, results, hardwareConfig, barMetric, costType, mode]);

  // Build legend items for ChartLegend sidebar, sorted by MODEL_ORDER (same as Inference Performance tab)
  const legendItems = useMemo(() => {
    const availableSet = new Set(availableHwKeys);
    return Object.entries(hardwareConfig)
      .filter(([key]) => availableSet.has(key))
      .sort(([a], [b]) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map(([key, config]) => ({
        name: config.name,
        label: getDisplayLabel(config),
        color: config?.color || 'var(--foreground)',
        title: config.gpu,
        hw: key,
        isActive: visibleHwKeys.has(key),
        onClick: () => toggleGpuVisibility(key),
      }));
  }, [availableHwKeys, hardwareConfig, visibleHwKeys, toggleGpuVisibility]);

  const getBarMetricLabel = (metric: BarMetric) => {
    if (metric === 'throughput') return 'Throughput';
    if (metric === 'cost') return 'Cost';
    return 'tok/s/MW';
  };

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
    <>
      <section data-testid="calculator-controls">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">TCO Calculator</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Set a target interactivity (tokens/sec/user) and compare the throughput and cost
                  across all GPUs. Values are interpolated from real benchmark data.
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

            {/* Controls — grid layout matching inference chart controls */}
            <TooltipProvider delayDuration={0}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <ModelSelector
                  id="calc-model"
                  data-testid="calc-model-selector"
                  value={selectedModel}
                  onChange={handleModelChange}
                  availableModels={availableModels}
                />
                <SequenceSelector
                  id="calc-sequence"
                  data-testid="calc-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  availableSequences={availableSequences}
                />
                <PrecisionSelector
                  id="calc-precision"
                  data-testid="calc-precision-selector"
                  value={selectedPrecisions}
                  onChange={handlePrecisionChange}
                  availablePrecisions={availablePrecisions}
                />

                <div className="flex flex-col space-y-1.5 lg:col-span-1">
                  <LabelWithTooltip
                    htmlFor="calc-cost"
                    label="Cost Provider"
                    tooltip="The pricing tier used to calculate cost per million tokens. Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental."
                  />
                  <Select value={costProvider} onValueChange={handleCostProviderChange}>
                    <SelectTrigger
                      id="calc-cost"
                      data-testid="calc-cost-selector"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_PROVIDER_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col space-y-1.5 lg:col-span-1">
                  <LabelWithTooltip
                    htmlFor="calc-cost-type"
                    label="Token Type"
                    tooltip="Whether to show costs for total tokens, input tokens only, or output tokens only."
                  />
                  <Select value={costType} onValueChange={handleCostTypeChange}>
                    <SelectTrigger
                      id="calc-cost-type"
                      data-testid="calc-cost-type-selector"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_TYPE_OPTIONS.map((ct) => (
                        <SelectItem key={ct.value} value={ct.value}>
                          {ct.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex flex-col space-y-1.5">
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
                        onClick={() => handleBarMetricChange(opt.value)}
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
                        type="range"
                        min={currentRange.min}
                        max={currentRange.max}
                        step={1}
                        value={targetValue}
                        onChange={handleSliderChange}
                        onPointerUp={() =>
                          track('calculator_target_slider_set', { mode, value: targetValue })
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
                      onChange={handleInputChange}
                      onBlur={handleInputBlur}
                      className="w-24 h-9"
                      min={0}
                    />
                  </div>
                </div>
              )}
            </TooltipProvider>
          </div>
        </Card>
      </section>

      {/* Chart / Table */}
      <section data-testid="calculator-chart-section">
        <figure data-testid="calculator-figure" className="relative rounded-lg">
          <CalculatorChartButtons
            viewMode={viewMode}
            setViewMode={setViewMode}
            chartId="calculator-chart"
            onExportCsv={handleExportCsv}
            setIsLegendExpanded={setIsLegendExpanded}
          />
          <Card>
            {loading ? (
              <Skeleton className="h-125 w-full" />
            ) : (
              <>
                {(() => {
                  const mobileToggle = (
                    <div
                      className="md:hidden inline-flex items-center rounded-lg border border-border p-0.5 gap-0.5 shrink-0"
                      role="tablist"
                      aria-label="View mode"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'chart'}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          viewMode === 'chart'
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => {
                          setViewMode('chart');
                          track('calculator_view_changed', { view: 'chart' });
                        }}
                      >
                        <BarChart3 className="size-3.5" />
                        Chart
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'table'}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          viewMode === 'table'
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => {
                          setViewMode('table');
                          track('calculator_view_changed', { view: 'table' });
                        }}
                      >
                        <Table2 className="size-3.5" />
                        Table
                      </button>
                    </div>
                  );

                  const captionContent = (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="text-lg font-semibold">
                          {getChartTitle(barMetric, mode, targetValue, costType, costProvider)}
                        </h2>
                        {mobileToggle}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {getModelLabel(selectedModel)} •{' '}
                        {selectedPrecisions
                          .map((p) => getPrecisionLabel(p as Precision))
                          .join(', ')}{' '}
                        • {getSequenceLabel(selectedSequence)} • Source: SemiAnalysis InferenceX™
                        {workflowInfo &&
                          workflowInfo.length > 0 &&
                          (workflowInfo[0] as WorkflowInfo)?.run_date && (
                            <>
                              {' '}
                              • Updated: {(workflowInfo[0] as WorkflowInfo).run_date.split(',')[0]}
                            </>
                          )}
                      </p>
                      {barMetric === 'power' && results.length > 0 && (
                        <>
                          <p
                            className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center"
                            data-testid="calculator-cost-badges"
                          >
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
                      {barMetric === 'cost' && results.length > 0 && (
                        <>
                          <p
                            className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center"
                            data-testid="calculator-cost-badges"
                          >
                            TCO $/GPU/hr:{' '}
                            {Object.entries(GPU_SPECS).map(([base, specs]) => (
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
                          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI
                          SGLang, Dynamo TRT) calculate cost per decode GPU or per prefill GPU,
                          rather than per total GPU count. This makes direct cost comparison with
                          aggregated configs not an apples-to-apples comparison.
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
                          <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI
                          SGLang, Dynamo TRT) calculate throughput per decode GPU or per prefill
                          GPU, rather than per total GPU count. This makes direct throughput
                          comparison with aggregated configs not an apples-to-apples comparison.
                        </p>
                      </div>
                    </>
                  );

                  return viewMode === 'chart' ? (
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
                      onBarSelect={handleBarSelect}
                      legendElement={
                        availableHwKeys.length > 0 ? (
                          <ChartLegend
                            variant="sidebar"
                            legendItems={legendItems}
                            isLegendExpanded={isLegendExpanded}
                            onExpandedChange={(expanded) => {
                              setIsLegendExpanded(expanded);
                              track('calculator_legend_expanded', { expanded });
                            }}
                            showResetFilter={true}
                            allSelected={visibleHwKeys.size === availableHwKeys.length}
                            onResetFilter={handleResetGpus}
                            enableTooltips={true}
                          />
                        ) : undefined
                      }
                    />
                  ) : (
                    <>
                      <figcaption>{captionContent}</figcaption>
                      <div data-testid="calculator-results-table">
                        <div className="overflow-x-auto relative">
                          {/* Watermark */}
                          <div
                            className="absolute inset-0 pointer-events-none flex items-center justify-center"
                            aria-hidden="true"
                          >
                            <img src="/brand/logo-color.png" alt="" className="w-48 opacity-10" />
                          </div>
                          <table className="w-full text-sm relative">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                                  GPU
                                </th>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                                  {costType === 'input'
                                    ? 'Input'
                                    : costType === 'output'
                                      ? 'Output'
                                      : 'Total'}{' '}
                                  Throughput (tok/s/gpu)
                                </th>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                                  Cost ($/M{' '}
                                  {costType === 'input'
                                    ? 'input'
                                    : costType === 'output'
                                      ? 'output'
                                      : ''}{' '}
                                  tok)
                                </th>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                                  {costType === 'input'
                                    ? 'Input'
                                    : costType === 'output'
                                      ? 'Output'
                                      : ''}{' '}
                                  tok/s/MW
                                </th>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                                  Concurrency
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.map((r) => {
                                const config = hardwareConfig[r.hwKey];
                                const baseName = config ? getDisplayLabel(config) : r.hwKey;
                                const label = r.precision
                                  ? `${baseName} (${r.precision.toUpperCase()})`
                                  : baseName;
                                return (
                                  <tr
                                    key={r.resultKey}
                                    className="border-b border-border/50 hover:bg-muted/30"
                                  >
                                    <td className="py-2 px-3 font-medium">{label}</td>
                                    <td className="text-right py-2 px-3 tabular-nums">
                                      {getThroughputForType(r, costType).toFixed(1)}
                                    </td>
                                    <td className="text-right py-2 px-3 tabular-nums">
                                      $
                                      {(costType === 'input'
                                        ? r.costInput
                                        : costType === 'output'
                                          ? r.costOutput
                                          : r.cost
                                      ).toFixed(3)}
                                    </td>
                                    <td className="text-right py-2 px-3 tabular-nums">
                                      {getTpPerMwForType(r, costType).toFixed(0)}
                                    </td>
                                    <td className="text-right py-2 px-3 tabular-nums">
                                      ~{r.concurrency}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Values are interpolated from real InferenceMAX benchmark data points. Only
                          GPUs with data in the measured range are shown.
                        </p>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </Card>
        </figure>
      </section>

      {/* Comparison banner — only shown in chart view */}
      {viewMode === 'chart' && selectedBars.size > 0 && (
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
                      const config = hardwareConfig[r.hwKey] || HARDWARE_CONFIG[r.hwKey];
                      const baseName = config ? getDisplayLabel(config) : r.hwKey;
                      return r.precision ? `${baseName} (${r.precision.toUpperCase()})` : baseName;
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
                onClick={() => {
                  setSelectedBars(new Set());
                  track('calculator_selection_cleared');
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
              >
                Clear selection
              </button>
            </div>
          </Card>
        </section>
      )}
    </>
  );
}

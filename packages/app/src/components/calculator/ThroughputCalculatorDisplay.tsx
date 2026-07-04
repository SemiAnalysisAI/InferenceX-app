'use client';

import { track } from '@/lib/analytics';
import Link from 'next/link';
import { BarChart3, Table2 } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CalculatorTable from '@/components/calculator/CalculatorTable';
import type { CalculatorUrlSeed } from '@/components/calculator/url-seed';
import { GlobalFilterProvider, useGlobalFilters } from '@/components/GlobalFilterContext';
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

import ThroughputBarChart, {
  getChartTitle,
  getCostProviderLabel,
  getThroughputForType,
  getTpPerMwForType,
} from './ThroughputBarChart';
import type {
  BarMetric,
  CalculatorMode,
  CostProvider,
  CostType,
  InterpolatedResult,
} from './types';
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

const STRINGS = {
  en: {
    title: 'TCO Calculator',
    description:
      'Set a target interactivity (tokens/sec/user) and compare the throughput and cost across all GPUs. Values are interpolated from real benchmark data.',
    costProviderLabel: 'Cost Provider',
    costProviderTooltip:
      'The pricing tier used to calculate cost per million tokens. Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental.',
    costProviderPlaceholder: 'Cost provider',
    tokenTypeLabel: 'Token Type',
    tokenTypeTooltip:
      'Whether to show costs for total tokens, input tokens only, or output tokens only.',
    tokenTypePlaceholder: 'Token type',
    metricLabel: 'Metric',
    metricTooltip:
      'The comparison metric shown in the chart. Throughput (tok/s/gpu), power efficiency (tok/s/MW), or cost per million tokens.',
    targetLabel: 'Target Interactivity (tok/s/user)',
    targetTooltip:
      'The interactivity operating point used for interpolation. Adjust the slider to compare GPU throughput, cost, and power efficiency at different interactivity levels.',
    metricThroughput: 'Throughput',
    metricCost: 'Cost',
    viewChart: 'Chart',
    viewTable: 'Table',
    viewModeAria: 'View mode',
    errorLoading: 'Error loading data. Please try a different selection.',
    clickToCompare: 'selected. Click another bar to compare.',
    clearSelection: 'Clear selection',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
    totalTokens: 'Total Tokens',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    allInPower: 'All in Power/GPU: ',
    tcoPerHr: 'TCO $/GPU/hr: ',
    source: 'Source: ',
    updated: ' • Updated: ',
    note: 'Note:',
    disaggCost:
      ' Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo TRTLLM) calculate cost per decode GPU or per prefill GPU, rather than per total GPU count. This makes direct cost comparison with aggregated configs not an apples-to-apples comparison.',
    disaggThroughput:
      ' Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo TRTLLM) calculate throughput per decode GPU or per prefill GPU, rather than per total GPU count. This makes direct throughput comparison with aggregated configs not an apples-to-apples comparison.',
    compMetricThroughput: 'throughput',
    compMetricCost: 'cost efficiency',
    compMetricPower: 'tok/s/MW',
  },
  zh: {
    title: 'TCO 计算器',
    description:
      '设定目标交互性（tokens/sec/user），比较所有 GPU 的吞吐量和成本。数值基于真实基准测试数据插值计算。',
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '用于计算每百万 token 成本的定价层级。Hyperscaler（如 AWS/GCP）、Neocloud（如 CoreWeave）或 3 年租赁。',
    costProviderPlaceholder: '成本供应商',
    tokenTypeLabel: 'Token 类型',
    tokenTypeTooltip: '选择显示总 token、仅输入 token 还是仅输出 token 的成本。',
    tokenTypePlaceholder: 'Token 类型',
    metricLabel: '指标',
    metricTooltip:
      '图表中显示的比较指标。吞吐量（tok/s/gpu）、能效（tok/s/MW）或每百万 token 成本。',
    targetLabel: '目标交互性 (tok/s/user)',
    targetTooltip:
      '用于插值的交互性操作点。调整滑块以比较不同交互性级别下 GPU 的吞吐量、成本和能效。',
    metricThroughput: '吞吐量',
    metricCost: '成本',
    viewChart: '图表',
    viewTable: '表格',
    viewModeAria: '显示模式',
    errorLoading: '加载数据出错，请尝试其他选择。',
    clickToCompare: '已选中。点击另一个柱状图进行对比。',
    clearSelection: '清除选择',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
    totalTokens: '总 Token',
    inputTokens: '输入 Token',
    outputTokens: '输出 Token',
    allInPower: '全含功率/GPU：',
    tcoPerHr: 'TCO $/GPU/hr：',
    source: '来源：',
    updated: ' • 更新于：',
    note: '注意：',
    disaggCost:
      '解耦推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码 GPU 或预填充 GPU 计算成本，而非按 GPU 总数。因此与聚合配置的直接成本对比并非同类比较。',
    disaggThroughput:
      '解耦推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码 GPU 或预填充 GPU 计算吞吐量，而非按 GPU 总数。因此与聚合配置的直接吞吐量对比并非同类比较。',
    compMetricThroughput: '吞吐量',
    compMetricCost: '成本效率',
    compMetricPower: 'tok/s/MW',
  },
} as const;

function getChartTitleZh(
  barMetric: BarMetric,
  mode: CalculatorMode,
  targetValue: number,
  costType: CostType,
  costProvider?: CostProvider,
): string {
  const targetLabel =
    mode === 'interactivity_to_throughput'
      ? `${targetValue} tok/s/user 交互性`
      : `${targetValue} tok/s/gpu 吞吐量`;
  const tokenTypeLabel = costType === 'input' ? '输入' : costType === 'output' ? '输出' : '总';
  switch (barMetric) {
    case 'power': {
      return `${targetLabel}下每满配兆瓦${tokenTypeLabel} token 数`;
    }
    case 'cost': {
      const providerLabel = getCostProviderLabel(costProvider || 'costh');
      return `${targetLabel}下每百万${tokenTypeLabel} token 成本（${providerLabel}）`;
    }
    default: {
      return mode === 'interactivity_to_throughput'
        ? `${targetLabel}下每 GPU ${tokenTypeLabel} token 吞吐量`
        : `${targetLabel}下的交互性`;
    }
  }
}

export default function ThroughputCalculatorDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  if (urlSeed && (urlSeed.model || urlSeed.sequence || urlSeed.precisions)) {
    return (
      <GlobalFilterProvider
        initialModel={urlSeed.model}
        initialSequence={urlSeed.sequence}
        initialPrecisions={urlSeed.precisions}
      >
        <ThroughputCalculatorInner />
      </GlobalFilterProvider>
    );
  }
  return <ThroughputCalculatorInner />;
}

function ThroughputCalculatorInner() {
  const locale = useLocale();
  const t = STRINGS[locale];
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
  const [visibleHwKeys, setVisibleHwKeys] = useState<Set<string>>(new Set());
  const [selectedBars, setSelectedBars] = useState<Set<string>>(new Set());
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [viewMode, setViewMode] = useState<CalculatorViewMode>('chart');

  const costTypeLabels: Record<CostType, string> = useMemo(
    () => ({ total: t.totalTokens, input: t.inputTokens, output: t.outputTokens }),
    [t],
  );

  const viewModeOptions = useMemo<SegmentedToggleOption<CalculatorViewMode>[]>(() => {
    if (locale === 'en') return CALCULATOR_VIEW_MODE_OPTIONS;
    return CALCULATOR_VIEW_MODE_OPTIONS.map((opt) => ({
      ...opt,
      label: opt.value === 'chart' ? t.viewChart : t.viewTable,
    }));
  }, [locale, t]);

  const mobileViewModeOptions = useMemo<SegmentedToggleOption<CalculatorViewMode>[]>(() => {
    if (locale === 'en') return CALCULATOR_MOBILE_VIEW_MODE_OPTIONS;
    return viewModeOptions.map(({ testId: _testId, ...opt }) => opt);
  }, [locale, viewModeOptions]);

  const { hardwareConfig, ranges, getResults, loading, error, hasData, availableHwKeys } =
    useThroughputData(selectedModel, selectedSequence, selectedPrecisions, selectedRunDate);

  // Dynamic vendor-aware colors for visible GPUs
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({
    highContrast,
    activeKeys: visibleKeysArray,
  });

  // Track previous available keys to detect when the GPU set changes
  const prevAvailableKeyRef = useRef<string>('');

  // Reset visible GPUs when the available set changes (model/sequence/precision change or customer filter toggle)
  useEffect(() => {
    if (availableHwKeys.length === 0) return;
    const key = [...availableHwKeys].toSorted().join(',');
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
          }
          // Remove it
          const next = new Set(prev);
          next.delete(hwKey);
          return next;
        }
        // Add it
        const next = new Set([...prev, hwKey]);
        return next;
      });
      track('calculator_gpu_toggled', { gpu: hwKey });
    },
    [availableHwKeys],
  );

  const removeGpu = useCallback((hwKey: string) => {
    setVisibleHwKeys((prev) => {
      const next = new Set(prev);
      next.delete(hwKey);
      return next;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    const { headers, rows } = calculatorChartToCsv(results, targetValue, (hwKey) => {
      const config = hardwareConfig[hwKey] || getHardwareConfig(hwKey);
      return config ? getDisplayLabel(config) : hwKey;
    });
    exportToCsv(`InferenceX_calculator_${selectedModel}`, headers, rows);
  }, [results, targetValue, hardwareConfig]);

  const handleViewModeChange = useCallback((value: CalculatorViewMode) => {
    setViewMode(value);
    track('calculator_view_changed', { view: value });
  }, []);

  const handleResetGpus = useCallback(() => {
    setVisibleHwKeys(new Set(availableHwKeys));
    track('calculator_gpu_reset', { gpuCount: availableHwKeys.length });
  }, [availableHwKeys]);

  // Derive runUrl from workflowInfo for the selected sequence
  const runUrl = useMemo(() => {
    if (!Array.isArray(workflowInfo) || workflowInfo.length === 0) return undefined;
    const wf = workflowInfo[0];
    return wf?.runInfoBySequence?.[selectedSequence]?.runUrl;
  }, [workflowInfo, selectedSequence]);

  // Handle bar selection: click to toggle (uses resultKey for unique identification)
  const handleBarSelect = useCallback((resultKey: string) => {
    setSelectedBars((prev) => {
      const next = new Set(prev);
      if (next.has(resultKey)) {
        next.delete(resultKey);
        track('calculator_bar_deselected', { resultKey });
      } else {
        next.add(resultKey);
        track('calculator_bar_selected', { resultKey, totalSelected: next.size });
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
      const config = hardwareConfig[r.hwKey] || getHardwareConfig(r.hwKey);
      const baseName = config ? getDisplayLabel(config) : r.hwKey;
      if (r.precision) return `${baseName} (${r.precision.toUpperCase()})`;
      return baseName;
    };

    const metricName =
      barMetric === 'power'
        ? t.compMetricPower
        : barMetric === 'cost'
          ? t.compMetricCost
          : t.compMetricThroughput;

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
          if (locale === 'zh') {
            comparisons.push(
              `${getLabel(higher)} 的${metricName}比 ${getLabel(lower)} 高 ${ratio.toFixed(1)} 倍`,
            );
          } else {
            comparisons.push(
              `${getLabel(higher)} is ${ratio.toFixed(1)}x more ${metricName} than ${getLabel(lower)}`,
            );
          }
        }
      }
    }

    return comparisons;
  }, [selectedBars, results, hardwareConfig, barMetric, costType, mode, locale, t]);

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
          {t.errorLoading}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section data-testid="calculator-controls">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">{t.title}</h2>
                <p className="text-muted-foreground text-sm mb-4">{t.description}</p>
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
                  onChange={handleModelChange}
                  open={openDropdown === 'model'}
                  onOpenChange={handleDropdownOpenChange('model')}
                  availableModels={availableModels}
                />
                <SequenceSelector
                  id="calc-sequence"
                  data-testid="calc-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  open={openDropdown === 'sequence'}
                  onOpenChange={handleDropdownOpenChange('sequence')}
                  availableSequences={availableSequences}
                />
                <PrecisionSelector
                  id="calc-precision"
                  data-testid="calc-precision-selector"
                  value={selectedPrecisions}
                  onChange={handlePrecisionChange}
                  open={openDropdown === 'precision'}
                  onOpenChange={handleDropdownOpenChange('precision')}
                  availablePrecisions={availablePrecisions}
                />

                <div className="flex flex-col space-y-1.5 lg:col-span-1">
                  <LabelWithTooltip
                    htmlFor="calc-cost"
                    label={t.costProviderLabel}
                    tooltip={t.costProviderTooltip}
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
                        handleCostProviderChange(next);
                      }}
                      open={openDropdown === 'costProvider'}
                      onOpenChange={handleDropdownOpenChange('costProvider')}
                      placeholder={t.costProviderPlaceholder}
                      minSelections={1}
                      maxSelections={1}
                      showClearAll={false}
                      searchable={false}
                      plainSelectedText
                      showSelectionSummary={false}
                    />
                  </div>
                </div>

                <div className="flex flex-col space-y-1.5 lg:col-span-1">
                  <LabelWithTooltip
                    htmlFor="calc-cost-type"
                    label={t.tokenTypeLabel}
                    tooltip={t.tokenTypeTooltip}
                  />
                  <div id="calc-cost-type" data-testid="calc-cost-type-selector">
                    <MultiSelect
                      options={COST_TYPE_OPTIONS.map((ct) => ({
                        value: ct.value,
                        label: costTypeLabels[ct.value],
                      }))}
                      value={[costType]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        handleCostTypeChange(next);
                      }}
                      open={openDropdown === 'costType'}
                      onOpenChange={handleDropdownOpenChange('costType')}
                      placeholder={t.tokenTypePlaceholder}
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
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="calc-metric"
                    label={t.metricLabel}
                    tooltip={t.metricTooltip}
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
                        {opt.value === 'throughput'
                          ? t.metricThroughput
                          : opt.value === 'cost'
                            ? t.metricCost
                            : 'tok/s/MW'}
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
                    label={t.targetLabel}
                    tooltip={t.targetTooltip}
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
          <ChartButtons
            chartId="calculator-chart"
            analyticsPrefix="calculator"
            zoomResetEvent="d3chart_zoom_reset_calculator-chart"
            onExportCsv={handleExportCsv}
            setIsLegendExpanded={setIsLegendExpanded}
            exportFileName={`InferenceX_calculator_${selectedModel}`}
            leadingControls={
              <SegmentedToggle
                value={viewMode}
                options={viewModeOptions}
                onValueChange={handleViewModeChange}
                ariaLabel={t.viewModeAria}
                testId="calculator-view-toggle"
                className="shrink-0"
              />
            }
          />
          <Card>
            {loading ? (
              <Skeleton className="h-125 w-full" />
            ) : (
              <>
                {(() => {
                  const captionContent = (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="text-lg font-semibold">
                          {locale === 'zh'
                            ? getChartTitleZh(barMetric, mode, targetValue, costType, costProvider)
                            : getChartTitle(barMetric, mode, targetValue, costType, costProvider)}
                        </h2>
                        <SegmentedToggle
                          value={viewMode}
                          options={mobileViewModeOptions}
                          onValueChange={handleViewModeChange}
                          ariaLabel={t.viewModeAria}
                          className="md:hidden shrink-0"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {getModelLabel(selectedModel)} •{' '}
                        {selectedPrecisions
                          .map((p) => getPrecisionLabel(p as Precision))
                          .join(', ')}{' '}
                        • {getSequenceLabel(selectedSequence)} • {t.source}SemiAnalysis InferenceX™
                        {selectedRunDate && (
                          <>
                            {t.updated}
                            {selectedRunDate}
                          </>
                        )}
                      </p>
                      {barMetric === 'power' && results.length > 0 && (
                        <>
                          <p
                            className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center"
                            data-testid="calculator-cost-badges"
                          >
                            {t.allInPower}
                            {Object.entries(HW_REGISTRY).map(([base, specs]) => (
                              <Badge key={base} variant="outline">
                                {base.toUpperCase()}: {specs.power}kW
                              </Badge>
                            ))}
                          </p>
                          <p className="text-muted-foreground">
                            <small>
                              {t.source}
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
                            {t.tcoPerHr}
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
                              {t.source}
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
                          <strong>{t.note}</strong>
                          {t.disaggCost}
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
                          <strong>{t.note}</strong>
                          {t.disaggThroughput}
                        </p>
                      </div>
                      <UnofficialDomainNotice />
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
                      colorResolver={resolveColor}
                      legendElement={
                        availableHwKeys.length > 0 ? (
                          <ChartLegend
                            variant="sidebar"
                            legendItems={legendItems}
                            onItemRemove={removeGpu}
                            isLegendExpanded={isLegendExpanded}
                            onExpandedChange={(expanded) => {
                              setIsLegendExpanded(expanded);
                              track('calculator_legend_expanded', { expanded });
                            }}
                            switches={[
                              {
                                id: 'calc-high-contrast',
                                label: t.highContrast,
                                checked: highContrast,
                                onCheckedChange: (checked: boolean) => {
                                  setHighContrast(checked);
                                  track('calculator_high_contrast_toggled', { enabled: checked });
                                },
                              },
                            ]}
                            actions={
                              visibleHwKeys.size < availableHwKeys.length
                                ? [
                                    {
                                      id: 'calc-reset-filter',
                                      label: t.resetFilter,
                                      onClick: handleResetGpus,
                                    },
                                  ]
                                : []
                            }
                            enableTooltips={true}
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
                      const config = hardwareConfig[r.hwKey] || getHardwareConfig(r.hwKey);
                      const baseName = config ? getDisplayLabel(config) : r.hwKey;
                      return r.precision ? `${baseName} (${r.precision.toUpperCase()})` : baseName;
                    })()}{' '}
                    {t.clickToCompare}
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
                  track('calculator_selection_cleared', { clearedCount: selectedBars.size });
                  setSelectedBars(new Set());
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
              >
                {t.clearSelection}
              </button>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

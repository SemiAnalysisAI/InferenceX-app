'use client';

import { track } from '@/lib/analytics';
import Link from 'next/link';
import { BarChart3, Table2 } from 'lucide-react';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CalculatorTable from '@/components/calculator/CalculatorTable';
import FleetPlanner from '@/components/calculator/FleetPlanner';
import type { CalculatorUrlSeed } from '@/components/calculator/url-seed';
import { GlobalFilterProvider, useGlobalFilters } from '@/components/GlobalFilterContext';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import {
  ModelSelector,
  PercentileSelector,
  PrecisionSelector,
  ScenarioSelector,
} from '@/components/ui/chart-selectors';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Percentile,
  Sequence,
  type Model,
  type Precision,
  getModelLabel,
  getPrecisionLabel,
  getSequenceLabel,
} from '@/lib/data-mappings';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';

import { getDisplayLabel } from '@/lib/utils';
import { exportToCsv } from '@/lib/csv-export';
import { calculatorChartToCsv } from '@/lib/csv-export-helpers';

import ThroughputBarChart, {
  getChartTitle,
  getCostProviderLabel,
  getResultLabel,
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
      'Set a target interactivity (tokens/sec/user) and compare the throughput and cost across all chips. Values are interpolated from real benchmark data.',
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
      'The comparison metric shown in the chart. Throughput (tok/s/chip), power efficiency (tok/s/MW), or cost per million tokens.',
    targetLabel: 'Target Interactivity (tok/s/user)',
    targetTooltip:
      'The interactivity operating point used for interpolation. Adjust the slider to compare chip throughput, cost, and power efficiency at different interactivity levels.',
    targetAgenticLabel: (percentile: string) => `Target ${percentile} Interactivity (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `The ${percentile} interactivity operating point used for agentic trace interpolation. Adjust the slider to compare chip throughput, cost, and power efficiency.`,
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
    allInPower: 'All in Power/Chip: ',
    tcoPerHr: 'TCO $/chip/hr: ',
    source: 'Source: ',
    updated: ' • Updated: ',
    note: 'Note:',
    disaggCost:
      ' Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo TRTLLM) calculate cost per decode chip or per prefill chip, rather than per total chip count. This makes direct cost comparison with aggregated configs not an apples-to-apples comparison.',
    disaggThroughput:
      ' Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo TRTLLM) calculate throughput per decode chip or per prefill chip, rather than per total chip count. This makes direct throughput comparison with aggregated configs not an apples-to-apples comparison.',
    compMetricThroughput: 'throughput',
    compMetricCost: 'cost efficiency',
    compMetricPower: 'tok/s/MW',
    hideSkuAboveConfigLimitLabel: 'Hide if target exceeds config range',
    hideSkuAboveConfigLimitHelp:
      'When enabled, SKUs whose measured interactivity range ends below the target are hidden instead of being projected from the max edge.',
    unofficialRun: 'UNOFFICIAL RUN',
    branch: 'Branch',
    viewRun: 'View workflow run',
  },
  zh: {
    title: 'TCO 计算器',
    description:
      '设定目标交互性（tokens/sec/user），比较所有 Chip 的吞吐量和成本。数值基于真实基准测试数据插值计算。',
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '用于计算每百万 token 成本的定价层级。Hyperscaler（如 AWS/GCP）、Neocloud（如 CoreWeave）或 3 年租赁。',
    costProviderPlaceholder: '成本供应商',
    tokenTypeLabel: 'Token 类型',
    tokenTypeTooltip: '选择显示总 token、仅输入 token 还是仅输出 token 的成本。',
    tokenTypePlaceholder: 'Token 类型',
    metricLabel: '指标',
    metricTooltip:
      '图表中显示的比较指标。吞吐量（tok/s/chip）、能效（tok/s/MW）或每百万 token 成本。',
    targetLabel: '目标交互性 (tok/s/user)',
    targetTooltip:
      '用于插值的交互性操作点。调整滑块以比较不同交互性级别下 Chip 的吞吐量、成本和能效。',
    targetAgenticLabel: (percentile: string) => `目标 ${percentile} 交互性 (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `用于智能体轨迹插值的 ${percentile} 交互性操作点。调整滑块以比较 Chip 的吞吐量、成本和能效。`,
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
    allInPower: '全含功率/Chip：',
    tcoPerHr: 'TCO $/chip/hr：',
    source: '来源：',
    updated: ' • 更新于：',
    note: '注意：',
    disaggCost:
      '解耦推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码 Chip 或预填充 Chip 计算成本，而非按 Chip 总数。因此与聚合配置的直接成本对比并非同类比较。',
    disaggThroughput:
      '解耦推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码 Chip 或预填充 Chip 计算吞吐量，而非按 Chip 总数。因此与聚合配置的直接吞吐量对比并非同类比较。',
    compMetricThroughput: '吞吐量',
    compMetricCost: '成本效率',
    compMetricPower: 'tok/s/MW',
    hideSkuAboveConfigLimitLabel: '隐藏超出配置上限的型号',
    hideSkuAboveConfigLimitHelp:
      '开启后，若目标交互性高于某个配置的实测上限，不再显示该 SKU，避免把结果投射到该配置最大边界。',
    unofficialRun: '非官方运行',
    branch: '分支',
    viewRun: '查看工作流运行',
  },
} as const;

function getChartTitleZh(
  barMetric: BarMetric,
  mode: CalculatorMode,
  targetValue: number,
  costType: CostType,
  costProvider?: CostProvider,
  interactivityPercentile?: string,
): string {
  const percentilePrefix = interactivityPercentile
    ? `${interactivityPercentile.toUpperCase()} `
    : '';
  const targetLabel =
    mode === 'interactivity_to_throughput'
      ? `${targetValue} tok/s/user ${percentilePrefix}交互性`
      : `${targetValue} tok/s/chip 吞吐量`;
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
        ? `${targetLabel}下每 Chip ${tokenTypeLabel} token 吞吐量`
        : `${targetLabel}下的交互性`;
    }
  }
}

export default function ThroughputCalculatorDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  const inner = (
    <ThroughputCalculatorInner initialPercentile={urlSeed?.percentile ?? Percentile.P90} />
  );
  if (urlSeed && (urlSeed.model || urlSeed.sequence || urlSeed.precisions)) {
    return (
      <GlobalFilterProvider
        initialModel={urlSeed.model}
        initialSequence={urlSeed.sequence}
        initialPrecisions={urlSeed.precisions}
      >
        {inner}
      </GlobalFilterProvider>
    );
  }
  return inner;
}

function ThroughputCalculatorInner({ initialPercentile }: { initialPercentile: Percentile }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { setUrlParam } = useUrlState();
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
  const [selectedPercentile, setSelectedPercentile] = useState<Percentile>(initialPercentile);
  const [visibleHwKeys, setVisibleHwKeys] = useState<Set<string>>(new Set());
  const [selectedBars, setSelectedBars] = useState<Set<string>>(new Set());
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [viewMode, setViewMode] = useState<CalculatorViewMode>('chart');
  const [hideSkuAboveConfigLimit, setHideSkuAboveConfigLimit] = useState(true);

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

  // Unofficial-run overlay (`?unofficialrun=…`). Overlay bars are interpolated
  // separately from official ones and only ever reach the bar chart — the
  // table, CSV export, and fleet planner stay official-only.
  const { isUnofficialRun, unofficialBenchmarkRows, unofficialRunInfos, runIndexByUrl } =
    useUnofficialRun();

  const overlayInput = useMemo(
    () => ({ rows: unofficialBenchmarkRows, runIndexByUrl }),
    [unofficialBenchmarkRows, runIndexByUrl],
  );

  const {
    gpuDataByGroupKey,
    hardwareConfig,
    ranges,
    getResults,
    getOverlayResults,
    loading,
    error,
    hasData,
    hasOverlayData,
    availableHwKeys,
    overlayAvailableHwKeys,
  } = useThroughputData(
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedRunDate,
    overlayInput,
    selectedPercentile,
  );

  const isAgenticSequence = selectedSequence === Sequence.AgenticTraces;
  // AgentX publishes on P90, so the percentile control is an insider affordance
  // rather than a normal filter: it stays behind the ↑↑↓↓ feature gate, matching
  // the inference chart, and the calculator defaults to P90 without it.
  const featureGateUnlocked = useFeatureGate();
  const percentileLabel = selectedPercentile.toUpperCase();

  /**
   * Hardware listed in the legend: official hardware, plus hardware that only
   * the loaded unofficial run has data for (otherwise there'd be no way to hide
   * an overlay-only bar).
   *
   * `visibleHwKeys` — seeded from this list — is the SINGLE source of truth for
   * what the calculator draws, official bars and overlay bars alike. It is
   * deliberately not cross-wired to the provider's shared `activeOverlayHwTypes`
   * (which the inference and evaluation tabs read/write): two visibility sets
   * for one legend can only drift, and every way they drift renders a legend
   * entry whose active state contradicts the bar next to it — e.g. a selection
   * change reseeds the local set but not the shared one, or another tab
   * re-enables a GPU this tab has hidden.
   *
   * Per-tab hardware visibility is already how the calculator treats official
   * data (it has never shared `visibleHwKeys` with the inference tab), so the
   * overlay series simply follows the same rule. AGENTS.md's "respect
   * `activeOverlayHwTypes`" exists so overlay points can't ignore the user's
   * hide action; here the calculator's own legend IS that hide action, and it
   * is respected.
   */
  const legendHwKeys = useMemo(() => {
    if (!isUnofficialRun || overlayAvailableHwKeys.length === 0) return availableHwKeys;
    return [...new Set([...availableHwKeys, ...overlayAvailableHwKeys])];
  }, [isUnofficialRun, availableHwKeys, overlayAvailableHwKeys]);

  // Dynamic vendor-aware colors for visible GPUs
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({
    highContrast,
    activeKeys: visibleKeysArray,
  });

  // Track previous available keys to detect when the GPU set changes
  const prevAvailableKeyRef = useRef<string>('');
  const prevOverlayKeyRef = useRef<string>('');

  // Reset visible GPUs on a user-driven selection change. The key is the
  // selection itself PLUS the official hardware list — the selection so an
  // overlay-only model/sequence (where the official list is empty and stays
  // empty) still reseeds, the official list so anything else that changes which
  // GPUs have data still reseeds. Percentile is deliberately excluded: it
  // recalculates agentic values, but should preserve the user's GPU filters
  // whenever the available hardware set is unchanged. Also deliberately NOT
  // keyed on the merged list: an unofficial run is fetched separately and
  // usually lands after the benchmarks, so a late arrival — or a run dismissal
  // — would otherwise wipe GPU filters the user had already set.
  const selectionKey = `${selectedModel}|${selectedSequence}|${[...selectedPrecisions]
    .toSorted()
    .join(',')}|${selectedRunDate}|${[...availableHwKeys].toSorted().join(',')}`;
  useEffect(() => {
    // Nothing to seed from yet (first load, before either source has resolved).
    // Guards on the MERGED list: an empty official list is a real state, not
    // just a loading one, and bailing on it would leave stale official keys in
    // `visibleHwKeys` and throw off the solo/show-all arithmetic below.
    if (legendHwKeys.length === 0) return;
    if (selectionKey !== prevAvailableKeyRef.current) {
      prevAvailableKeyRef.current = selectionKey;
      setVisibleHwKeys(new Set(legendHwKeys));
    }
  }, [selectionKey, legendHwKeys]);

  // Overlay hardware arriving or leaving is additive: newly available overlay
  // GPUs start visible, ones that are gone stop being tracked, and every other
  // entry keeps whatever the user set.
  useEffect(() => {
    const key = overlayAvailableHwKeys.join(',');
    if (key === prevOverlayKeyRef.current) return;
    const prev = prevOverlayKeyRef.current ? prevOverlayKeyRef.current.split(',') : [];
    prevOverlayKeyRef.current = key;

    const added = overlayAvailableHwKeys.filter((k) => !prev.includes(k));
    // Only drop hardware that has no official data either — otherwise dismissing
    // a run would hide a GPU whose official bar is still on the chart.
    const removed = prev.filter(
      (k) => !overlayAvailableHwKeys.includes(k) && !availableHwKeys.includes(k),
    );
    if (added.length === 0 && removed.length === 0) return;

    setVisibleHwKeys((cur) => {
      const next = new Set(cur);
      added.forEach((k) => next.add(k));
      removed.forEach((k) => next.delete(k));
      // Never strand the user with an empty chart. Falls back to everything
      // that still has data, official AND overlay — on an overlay-only
      // selection the official list is empty, so falling back to it would blank
      // the chart while overlay bars were still available.
      if (next.size === 0) return new Set([...availableHwKeys, ...overlayAvailableHwKeys]);
      return next;
    });
  }, [overlayAvailableHwKeys, availableHwKeys]);

  const hasAnyData = hasData || hasOverlayData;

  // Clamp target into range when data changes
  useEffect(() => {
    if (!hasAnyData) return;
    const { min, max } = ranges.interactivity;
    if (targetValue < min || targetValue > max) {
      const clamped = Math.max(min, Math.min(max, targetValue));
      setTargetValue(clamped);
      setInputValue(String(clamped));
    }
  }, [hasAnyData, ranges]);

  const results: InterpolatedResult[] = useMemo(() => {
    if (!hasData) return [];
    return getResults(targetValue, mode, costProvider, visibleHwKeys, hideSkuAboveConfigLimit);
  }, [
    hasData,
    targetValue,
    mode,
    costProvider,
    getResults,
    visibleHwKeys,
    hideSkuAboveConfigLimit,
  ]);

  /** Branch + URL per run index, stamped onto overlay results for labels/tooltips. */
  const runInfoByIndex = useMemo(() => {
    const map: Record<number, { branch: string; url: string }> = {};
    unofficialRunInfos.forEach((info, idx) => {
      map[idx] = { branch: info.branch || `run ${info.id}`, url: info.url };
    });
    return map;
  }, [unofficialRunInfos]);

  const overlayResults: InterpolatedResult[] = useMemo(() => {
    if (!hasOverlayData) return [];
    return getOverlayResults(
      targetValue,
      mode,
      costProvider,
      visibleHwKeys,
      runInfoByIndex,
      hideSkuAboveConfigLimit,
    );
  }, [
    hasOverlayData,
    targetValue,
    mode,
    costProvider,
    getOverlayResults,
    visibleHwKeys,
    runInfoByIndex,
    hideSkuAboveConfigLimit,
  ]);

  /**
   * Bars drawn in the chart: official + overlay. Deliberately NOT used by the
   * table, the CSV export, or the fleet planner — those stay official-only, so
   * an exported sheet or a fleet projection never silently mixes in numbers
   * from an unmerged branch.
   */
  const barResults = useMemo(
    () => (overlayResults.length > 0 ? [...results, ...overlayResults] : results),
    [results, overlayResults],
  );

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

  const handlePercentileChange = useCallback(
    (value: Percentile) => {
      setSelectedPercentile(value);
      setUrlParam('i_pctl', value);
      track('calculator_percentile_selected', { percentile: value });
    },
    [setUrlParam],
  );

  const handleBarMetricChange = useCallback((value: BarMetric) => {
    setBarMetric(value);
    track('calculator_bar_metric_changed', { metric: value });
  }, []);

  const toggleGpuVisibility = useCallback(
    (hwKey: string) => {
      setVisibleHwKeys((prev) => {
        // Count against the legend rather than the raw set size, so an entry
        // that is no longer in the legend can never skew solo/show-all.
        const visibleLegendKeys = legendHwKeys.filter((k) => prev.has(k));
        const allVisible = visibleLegendKeys.length === legendHwKeys.length;
        const isVisible = prev.has(hwKey);

        if (isVisible) {
          if (allVisible) {
            // If all visible and clicking one, solo it
            return new Set([hwKey]);
          } else if (visibleLegendKeys.length === 1) {
            // If only one visible and clicking it, show all
            return new Set(legendHwKeys);
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
    [legendHwKeys],
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

  const handleHideSkuAboveLimitChange = useCallback((checked: boolean) => {
    setHideSkuAboveConfigLimit(checked);
    track('calculator_hide_over_limit_toggled', { enabled: checked });
  }, []);

  const handleResetGpus = useCallback(() => {
    setVisibleHwKeys(new Set(legendHwKeys));
    track('calculator_gpu_reset', { gpuCount: legendHwKeys.length });
  }, [legendHwKeys]);

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
  }, [barResults]);

  // Generate comparison text when 2+ bars are selected. Overlay bars are
  // selectable too, so this reads the combined chart list.
  const comparisonText = useMemo(() => {
    if (selectedBars.size < 2) return null;

    const selectedResults = barResults.filter((r) => selectedBars.has(r.resultKey));
    if (selectedResults.length < 2) return null;

    const getLabel = (r: InterpolatedResult) => getResultLabel(r, hardwareConfig);

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
  }, [selectedBars, barResults, hardwareConfig, barMetric, costType, mode, locale, t]);

  /**
   * Overlay legend: one entry per loaded unofficial run that contributes bars
   * to the chart, in the same palette color as its bars. Same shape as the
   * inference scatter and evaluation bar chart legends.
   */
  const overlayLegendItems = useMemo(() => {
    if (overlayResults.length === 0) return [];
    return unofficialRunInfos
      .map((info, idx) => {
        if (!overlayResults.some((r) => r.runIndex === idx)) return null;
        const branch = info.branch || `run ${info.id}`;
        return {
          name: `✕ unofficial-run-${info.id}`,
          label: `✕ ${branch}`,
          color: overlayRunColor(idx),
          title: `${t.unofficialRun}: ${branch}`,
          isHighlighted: true,
          hw: `overlay-run-${info.id}`,
          isActive: true,
          // A label, not a series: dismissing a run happens in the banner, and
          // counting it as removable would let the hide control empty the chart
          // of real GPUs.
          isRemovable: false,
          onClick: () => {},
          tooltip: (
            <div className="font-normal text-xs">
              <div className="text-red-500 font-semibold">{t.unofficialRun}</div>
              <div>
                {t.branch}: {branch}
              </div>
              {info.url && (
                <a href={info.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {t.viewRun}
                </a>
              )}
            </div>
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [overlayResults, unofficialRunInfos, t]);

  // Build legend items for ChartLegend sidebar, sorted by MODEL_ORDER (same as Inference Performance tab)
  const legendItems = useMemo(() => {
    const availableSet = new Set(legendHwKeys);
    return [
      ...overlayLegendItems,
      ...Object.entries(hardwareConfig)
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
        })),
    ];
  }, [
    legendHwKeys,
    overlayLegendItems,
    hardwareConfig,
    visibleHwKeys,
    toggleGpuVisibility,
    resolveColor,
  ]);

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
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                  isAgenticSequence ? 'lg:grid-cols-7' : 'lg:grid-cols-6'
                }`}
              >
                <ModelSelector
                  id="calc-model"
                  data-testid="calc-model-selector"
                  value={selectedModel}
                  onChange={handleModelChange}
                  open={openDropdown === 'model'}
                  onOpenChange={handleDropdownOpenChange('model')}
                  availableModels={availableModels}
                />
                <ScenarioSelector
                  id="calc-sequence"
                  data-testid="calc-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  open={openDropdown === 'sequence'}
                  onOpenChange={handleDropdownOpenChange('sequence')}
                  availableSequences={availableSequences}
                />
                {isAgenticSequence && featureGateUnlocked && (
                  <PercentileSelector
                    id="calc-percentile"
                    data-testid="calc-percentile-selector"
                    value={selectedPercentile}
                    onChange={handlePercentileChange}
                  />
                )}
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
              {!loading && hasAnyData && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <LabelWithTooltip
                      htmlFor="calc-target"
                      label={
                        isAgenticSequence ? t.targetAgenticLabel(percentileLabel) : t.targetLabel
                      }
                      tooltip={
                        isAgenticSequence
                          ? t.targetAgenticTooltip(percentileLabel)
                          : t.targetTooltip
                      }
                    />
                    <div
                      className="flex items-center gap-2"
                      data-testid="calculator-hide-over-limit-control"
                    >
                      <LabelWithTooltip
                        htmlFor="calc-hide-over-limit"
                        label={t.hideSkuAboveConfigLimitLabel}
                        tooltip={t.hideSkuAboveConfigLimitHelp}
                      />
                      <Switch
                        id="calc-hide-over-limit"
                        checked={hideSkuAboveConfigLimit}
                        onCheckedChange={handleHideSkuAboveLimitChange}
                        className="shrink-0"
                      />
                    </div>
                  </div>
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
                            ? getChartTitleZh(
                                barMetric,
                                mode,
                                targetValue,
                                costType,
                                costProvider,
                                isAgenticSequence ? selectedPercentile : undefined,
                              )
                            : getChartTitle(
                                barMetric,
                                mode,
                                targetValue,
                                costType,
                                costProvider,
                                isAgenticSequence ? selectedPercentile : undefined,
                              )}
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
                        • {getSequenceLabel(selectedSequence, locale)} • {t.source}SemiAnalysis
                        InferenceX™
                        {selectedRunDate && (
                          <>
                            {t.updated}
                            {selectedRunDate}
                          </>
                        )}
                      </p>
                      {barMetric === 'power' && barResults.length > 0 && (
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
                      {barMetric === 'cost' && barResults.length > 0 && (
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
                                SemiAnalysis Market July 2026 Pricing Surveys & AI Cloud TCO Model
                                <ExternalLinkIcon />
                              </Link>
                            </small>
                          </p>
                        </>
                      )}
                      {/* Per-token-type cost only: the input- and output-token
                          costs are attributed to one side of a disagg config's
                          prefill/decode split, while the total-token cost uses
                          the whole chip count — the same denominator an
                          aggregated config uses — so it needs no caveat. */}
                      <div
                        className={`overflow-hidden transition-all duration-200 ease-in-out ${
                          barMetric === 'cost' && costType !== 'total'
                            ? 'max-h-20 opacity-100'
                            : 'max-h-0 opacity-0'
                        }`}
                      >
                        <p
                          data-testid="calculator-disagg-cost-note"
                          className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1"
                        >
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
                      results={barResults}
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
                        legendHwKeys.length > 0 ? (
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
                              visibleHwKeys.size < legendHwKeys.length
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
                      const r = barResults.find((res) => res.resultKey === resultKey);
                      if (!r) return resultKey;
                      return getResultLabel(r, hardwareConfig);
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

      {/* Fleet planner: MW-budget projection + cost-target inverse lookup */}
      {!loading && hasData && (
        <FleetPlanner
          results={results}
          gpuDataByGroupKey={gpuDataByGroupKey}
          hardwareConfig={hardwareConfig}
          costProvider={costProvider}
          costType={costType}
          targetValue={targetValue}
          visibleHwKeys={visibleHwKeys}
        />
      )}
    </div>
  );
}

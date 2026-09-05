'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DISPLAY_MODEL_TO_DB,
  HW_REGISTRY,
  TCO_SOURCE_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';
import { Info, Plus, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

import ProfitEstimatorChart from '@/components/calculator/ProfitEstimatorChart';
import {
  resolveCalculatorVisibility,
  type CalculatorVisibilityIntent,
} from '@/components/calculator/ThroughputCalculatorDisplay';
import type { CalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/components/GlobalFilterContext';
import { cachedInputPricePerMillion, formatTokenPrice } from '@/components/inference/token-revenue';
import {
  COST_TIER_LABELS,
  costTierLabel,
  type CostTier,
} from '@/components/inference/metric-registry';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import ChartLegendItem from '@/components/ui/chart-legend-item';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ModelSelector, PercentileSelector } from '@/components/ui/chart-selectors';
import { ControlPanel } from '@/components/ui/control-panel';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ModelLogo } from '@/components/ui/model-logo';
import { MultiSelect } from '@/components/ui/multi-select';
import { ResultContext } from '@/components/ui/result-context';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { getGpuSpecs, getModelSortIndex } from '@/lib/constants';
import { exportToCsv } from '@/lib/csv-export';
import {
  getModelLabel,
  getOpenRouterModelId,
  getSequenceLabel,
  Percentile,
  Sequence,
  type Model,
} from '@/lib/data-mappings';
import { modelRoutesForTab, type ModelRouteTab } from '@/lib/model-routes';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import {
  clampPercent,
  DEFAULT_UTILIZATION_PCT,
  estimateProfitRows,
  listPricingToTokenRevenuePricing,
  modelsWithAgenticData,
  parseTokenPriceInput,
  profitModelDefaults,
  type ProfitBasis,
  type ProfitEstimatorRow,
  type ProfitEstimatorSkipReason,
} from './profit-estimator';
import { profitEstimatorChartStrings, rowLabel } from './ProfitEstimatorChart';
import {
  buildProfitHistoryResults,
  historyFadeShare,
  orderProfitRowsForHistory,
  PROFIT_HISTORY_MAX_GPUS,
  profitHistoryAvailableDates,
  profitHistoryChipOptions,
  profitHistoryDateRanks,
  shadeHistoryColor,
} from './profit-history';
import type { CostProvider } from './types';
import { useProfitHistory } from './useProfitHistory';
import { useThroughputData } from './useThroughputData';

/**
 * Where the $/M tok sale price comes from: the OpenRouter catalog, the lab's
 * published list price (offered only for models that have one in
 * `profitModelDefaults`), or a typed triple.
 */
type PriceSource = 'openrouter' | 'list' | 'custom';

/** Source a model opens on: its list price when it has one, else OpenRouter. */
function defaultPriceSource(model: Model): PriceSource {
  return profitModelDefaults(model).listPricing ? 'list' : 'openrouter';
}

/** The three published TCO tiers plus a per-chip $/GPU/hr the reader types. */
type ProfitCostProvider = CostProvider | 'custom';

const COST_PROVIDER_TIER: Record<ProfitCostProvider, CostTier> = {
  costh: 'hyperscaler',
  costn: 'neocloud',
  costr: 'rental',
  custom: 'custom',
};

// The published tiers use the same option labels as the /inference y-axis
// selector (Owning - Hyperscaler, Owning - Neocloud Giant, 3 Year Rental).
const COST_PROVIDER_OPTIONS: { value: ProfitCostProvider; label: string; labelZh: string }[] = [
  ...(['costh', 'costn', 'costr'] as const).map((value) => ({
    value,
    label: COST_TIER_LABELS[COST_PROVIDER_TIER[value]].option,
    labelZh: COST_TIER_LABELS[COST_PROVIDER_TIER[value]].optionZh,
  })),
  { value: 'custom', label: 'Custom $/GPU/hr', labelZh: '自定义 $/GPU/hr' },
];

/** Tier the custom inputs are seeded from, and the tier interpolation runs on. */
const CUSTOM_COST_SEED: CostProvider = 'costh';

/** Base GPU (`h200`, `gb300`) of a legend key like `gb300_dynamo-sglang`. */
function baseGpuOf(hwKey: string): string {
  return hwKey.split('_')[0] ?? hwKey;
}

/**
 * A typed custom cost. Empty or non-numeric → undefined, so the SKU drops out
 * with the `no-cost` reason instead of being priced at zero.
 */
export function parseCustomCostInput(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Options in selector order; the list-price entry is filtered out per model when absent. */
function priceSourceOptions(
  listVendor: string | null,
): { value: PriceSource; label: string; labelZh: string }[] {
  return [
    { value: 'openrouter', label: 'OpenRouter', labelZh: 'OpenRouter' },
    ...(listVendor
      ? [
          {
            value: 'list' as const,
            label: `${listVendor} list price`,
            labelZh: `${listVendor} 官方定价`,
          },
        ]
      : []),
    { value: 'custom', label: 'Custom $/M tok', labelZh: '自定义 $/M tok' },
  ];
}

const STRINGS = {
  en: {
    title: {
      'gw-year': 'Revenue & Profit Estimator per GigaWatt',
      'chip-hour': 'Revenue & Profit Estimator',
    },
    costProviderLabel: 'Cost Provider',
    costProviderTooltip:
      'The TCO tier used for the compute-expense segment: Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental, in $/GPU/hr from the SemiAnalysis AI Cloud TCO Model. Custom lets you type your own $/GPU/hr per chip.',
    customCostLabel: (gpu: string) => `${gpu} $/GPU/hr`,
    costProviderPlaceholder: 'Cost provider',
    priceSourceLabel: 'Token Price',
    priceSourceTooltip:
      "Where the sale price per million tokens comes from. OpenRouter reads the public catalog price for this model; the lab's list price is its published API rate, offered where third-party hosts undercut it; Custom lets you type your own input and output prices.",
    priceSourcePlaceholder: 'Token price',
    inputPriceLabel: 'Input $/M tok',
    outputPriceLabel: 'Output $/M tok',
    cachedPriceLabel: 'Cached input $/M tok',
    targetAgenticLabel: (percentile: string) => `Target ${percentile} Interactivity (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `The ${percentile} interactivity operating point used for agentic workload interpolation.`,
    utilizationLabel: 'Utilization (%)',
    utilizationTooltip:
      'Utilization % factors in the swings & dips of token traffic throughout day & night in addition to efficiency losses of scaling out large scale deployments.',
    labCutLabel: 'Model License Fee (%)',
    labCutTooltip:
      'Share of revenue paid to the model lab as a license fee on every token sold. It is owed even when compute alone exceeds revenue, so the operator can show a loss.',
    errorLoading: 'Error loading data. Please try a different selection.',
    resetFilter: 'Reset filter',
    pricingLoading: 'Loading OpenRouter pricing…',
    pricingUnavailable: (modelId: string | null) =>
      modelId
        ? `OpenRouter has no price for ${modelId}. Switch Token Price to Custom to enter one.`
        : 'This model has no OpenRouter listing. Switch Token Price to Custom to enter a price.',
    chartTitle: {
      'gw-year': (model: string, workload: string, percentile: string, target: number) =>
        `${model} ${workload} Revenue & Profit Estimates per GigaWatt Per Year at ${percentile} ${target} tok/s/user Interactivity`,
      'chip-hour': (model: string, workload: string, percentile: string, target: number) =>
        `${model} ${workload} Revenue & Profit Estimates per Chip per Hour at ${percentile} ${target} tok/s/user Interactivity`,
    },
    sellingPriceLabel: 'Selling Price per Million Tokens',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `Input: $${input} · Cached Input: $${cached} · Output: $${output} (${source})`,
    tcoBadgesLabel: 'TCO $/chip/hr:',
    sourceLabel: 'Source:',
    formulaTitle: {
      'gw-year': 'Revenue per GigaWatt Formula',
      'chip-hour': 'Revenue per Chip-Hour Formula',
    },
    formulaToggle: 'Toggle formula notes',
    captionFormula: {
      'gw-year': (util: number, labCut: number) =>
        `Revenue = $/GPU/hr × GPU-hours per GW-year × ${util}% utilization. GPU-hours = (1,000,000 kW ÷ all-in kW per GPU) × 8,760 h. Model license fee = ${labCut}% of revenue. Profit = revenue − TCO − license fee. Margin above each bar is profit ÷ revenue.`,
      'chip-hour': (util: number, labCut: number) =>
        `Revenue = $/GPU/hr × ${util}% utilization, where $/GPU/hr = benchmarked tok/s per chip at the target interactivity × the selling price per token. Compute expense = TCO $/chip/hr for the chosen cost tier. Model license fee = ${labCut}% of revenue. Profit = revenue − TCO − license fee. Margin above each bar is profit ÷ revenue.`,
    },
    csvHeaders: {
      'gw-year': [
        'SKU',
        'Precision',
        'Revenue ($/GW/yr)',
        'Compute expense TCO ($/GW/yr)',
        'Gross margin ($/GW/yr)',
        'Model license fee ($/GW/yr)',
        'Profit ($/GW/yr)',
        'Margin',
        'Revenue ($/GPU/hr, 100% util)',
        'GPU-hours per GW-year',
      ],
      'chip-hour': [
        'SKU',
        'Precision',
        'Revenue ($/chip/hr)',
        'Compute expense TCO ($/chip/hr)',
        'Gross margin ($/chip/hr)',
        'Model license fee ($/chip/hr)',
        'Profit ($/chip/hr)',
        'Margin',
        'Revenue ($/GPU/hr, 100% util)',
      ],
    },
    skipped: (entries: string) => `Not priced: ${entries}.`,
    skipReason: {
      'outside-measured-range': 'no measured point at the target interactivity',
      'no-power': 'no all-in power figure',
      'no-cost': 'no TCO for this tier',
      'no-token-mix': 'no input/output token mix recorded',
    } satisfies Record<ProfitEstimatorSkipReason, string>,
    compareHistory: 'Compare history',
    gpuConfig: 'Chip Config',
    gpuConfigTooltip: `Select up to ${PROFIT_HISTORY_MAX_GPUS} chip configurations to compare how their estimated revenue and profit have moved over time. Each config is priced again at the start and end of the date range using the run measured on that date, so software updates show up as a change in the bar.`,
    gpuConfigPlaceholder: 'Select a Chip Config for comparison',
    comparisonDateRange: 'Comparison Date Range',
    comparisonDateRangeTooltip:
      'Select the start and end dates for the historical comparison. The chart adds a bar for each selected chip config at both dates, next to its bar for the run date shown above.',
    dateRangePlaceholder: 'Select date range',
    historyNote: (dates: string) =>
      `Compare history: lighter bars are the same chip configs priced on ${dates}, using the same target, prices, and TCO tier.`,
    historyNoData: (entries: string) => `No run at the target on ${entries}.`,
    csvDateHeader: 'Run date',
  },
  zh: {
    title: {
      'gw-year': '每吉瓦收入与利润估算器',
      'chip-hour': '收入与利润估算器',
    },
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '算力支出分段采用的 TCO 层级：Hyperscaler（如 AWS/GCP）、Neocloud（如 CoreWeave）或 3 年租赁，单位为 $/GPU/hr，来自 SemiAnalysis AI Cloud TCO 模型。选择自定义可为每种芯片输入自己的 $/GPU/hr。',
    customCostLabel: (gpu: string) => `${gpu} $/GPU/hr`,
    costProviderPlaceholder: '成本供应商',
    priceSourceLabel: 'Token 售价',
    priceSourceTooltip:
      '每百万 token 售价的来源。OpenRouter 读取该模型的公开目录价格；官方定价为模型厂商公布的 API 价格，在第三方托管方报价低于官方时提供；自定义则可自行输入输入/输出价格。',
    priceSourcePlaceholder: 'Token 售价',
    inputPriceLabel: '输入 $/M tok',
    outputPriceLabel: '输出 $/M tok',
    cachedPriceLabel: '缓存输入 $/M tok',
    targetAgenticLabel: (percentile: string) => `目标 ${percentile} 交互性 (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `用于智能体工作负载插值的 ${percentile} 交互性操作点。`,
    utilizationLabel: '利用率 (%)',
    utilizationTooltip:
      '利用率 % 考虑了 token 流量在昼夜间的起伏波动，以及大规模部署横向扩展时的效率损失。',
    labCutLabel: '模型许可费（%）',
    labCutTooltip:
      '每售出一个 token 以许可费形式支付给模型实验室的收入比例。即使算力支出已超过收入也需支付，因此运营方可能亏损。',
    errorLoading: '加载数据出错，请尝试其他选择。',
    resetFilter: '重置筛选',
    pricingLoading: '正在加载 OpenRouter 价格…',
    pricingUnavailable: (modelId: string | null) =>
      modelId
        ? `OpenRouter 没有 ${modelId} 的价格。请将 Token 售价切换为自定义并输入价格。`
        : '该模型没有 OpenRouter 条目。请将 Token 售价切换为自定义并输入价格。',
    chartTitle: {
      'gw-year': (model: string, workload: string, percentile: string, target: number) =>
        `${model} ${workload} 每吉瓦每年收入与利润估算（${percentile} 交互性 ${target} tok/s/user）`,
      'chip-hour': (model: string, workload: string, percentile: string, target: number) =>
        `${model} ${workload} 每芯片每小时收入与利润估算（${percentile} 交互性 ${target} tok/s/user）`,
    },
    sellingPriceLabel: '每百万 token 售价',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `输入：$${input} · 缓存输入：$${cached} · 输出：$${output}（${source}）`,
    tcoBadgesLabel: 'TCO $/chip/hr：',
    sourceLabel: '来源：',
    formulaTitle: {
      'gw-year': '每吉瓦收入公式',
      'chip-hour': '每芯片小时收入公式',
    },
    formulaToggle: '展开或收起公式说明',
    captionFormula: {
      'gw-year': (util: number, labCut: number) =>
        `收入 = $/GPU/hr × 每吉瓦年 GPU 小时数 × ${util}% 利用率。GPU 小时数 = (1,000,000 kW ÷ 每 GPU 全电源配置 kW) × 8,760 h。模型许可费 = 收入的 ${labCut}%。利润 = 收入 − TCO − 许可费。柱形上方的利润率 = 利润 ÷ 收入。`,
      'chip-hour': (util: number, labCut: number) =>
        `收入 = $/GPU/hr × ${util}% 利用率，其中 $/GPU/hr = 目标交互性下实测的每芯片 tok/s × 每 token 售价。算力支出 = 所选成本层级的 TCO $/chip/hr。模型许可费 = 收入的 ${labCut}%。利润 = 收入 − TCO − 许可费。柱形上方的利润率 = 利润 ÷ 收入。`,
    },
    csvHeaders: {
      'gw-year': [
        'SKU',
        '精度',
        '收入（$/GW/yr）',
        '算力支出 TCO（$/GW/yr）',
        '毛利（$/GW/yr）',
        '模型许可费（$/GW/yr）',
        '利润（$/GW/yr）',
        '利润率',
        '收入（$/GPU/hr，100% 利用率）',
        '每吉瓦年 GPU 小时数',
      ],
      'chip-hour': [
        'SKU',
        '精度',
        '收入（$/chip/hr）',
        '算力支出 TCO（$/chip/hr）',
        '毛利（$/chip/hr）',
        '模型许可费（$/chip/hr）',
        '利润（$/chip/hr）',
        '利润率',
        '收入（$/GPU/hr，100% 利用率）',
      ],
    },
    skipped: (entries: string) => `未定价：${entries}。`,
    skipReason: {
      'outside-measured-range': '未在该交互性下实测',
      'no-power': '缺少全电源配置功率数据',
      'no-cost': '该层级无 TCO 数据',
      'no-token-mix': '未记录输入/输出 token 比例',
    } satisfies Record<ProfitEstimatorSkipReason, string>,
    compareHistory: '对比历史趋势',
    gpuConfig: '芯片配置',
    gpuConfigTooltip: `最多选择 ${PROFIT_HISTORY_MAX_GPUS} 个芯片配置，对比其收入与利润估算随时间的变化。每个配置都会用该日期实测的运行结果，在日期范围的起止两端重新估价，软件更新带来的差异会直接体现在柱形上。`,
    gpuConfigPlaceholder: '选择芯片配置进行对比',
    comparisonDateRange: '对比日期范围',
    comparisonDateRangeTooltip:
      '选择历史对比的起止日期。图表会在上方所示运行日期的柱形旁，为所选芯片配置在这两个日期各增加一根柱形。',
    dateRangePlaceholder: '选择日期范围',
    historyNote: (dates: string) =>
      `对比历史趋势：较浅的柱形为同一芯片配置在 ${dates} 的估价，目标、价格与 TCO 层级保持一致。`,
    historyNoData: (entries: string) => `${entries} 在目标处无运行结果。`,
    csvDateHeader: '运行日期',
  },
} as const;

/** A plain note under the chart that folds behind its title, like the metric notes on /inference. */
function InfoFold({
  title,
  toggleLabel,
  children,
  testId,
}: {
  title: string;
  toggleLabel: string;
  children: React.ReactNode;
  testId: string;
}) {
  // Collapsed by default; the formula is reference material, not the result.
  const [open, setOpen] = useState(false);
  return (
    <div className="py-1 text-xs" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={toggleLabel}
        className="flex w-full items-center gap-1.5 text-left text-foreground cursor-pointer"
        onClick={() => {
          setOpen((prev) => !prev);
          track('profit_formula_toggled', { open: !open });
        }}
      >
        <Info className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1">{title}</span>
        {open ? (
          <X className="size-3.5 text-muted-foreground" aria-hidden />
        ) : (
          <Plus className="size-3.5 text-muted-foreground" aria-hidden />
        )}
      </button>
      {open && <div className="mt-2 text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Number inputs step on mouse wheel while focused; drop focus so a scroll over the box only scrolls the page. */
function blurOnWheel(event: React.WheelEvent<HTMLInputElement>): void {
  event.currentTarget.blur();
}

/** Dashboard tab each basis is served from; drives the model allow-list and the URL rewrite. */
export const PROFIT_BASIS_TAB: Record<ProfitBasis, ModelRouteTab> = {
  'chip-hour': 'profit-estimator',
  'gw-year': 'profit-estimator-per-gigawatt',
};

export default function ProfitEstimatorDisplay({
  urlSeed,
  basis,
}: {
  urlSeed?: CalculatorUrlSeed;
  /** `/profit-estimator` is per chip-hour; `/profit-estimator-per-gigawatt` scales to a GW-year. */
  basis: ProfitBasis;
}) {
  return (
    <GlobalFilterProvider
      initialModel={urlSeed?.model}
      initialSequence={Sequence.AgenticTraces}
      initialRunDate={urlSeed?.runDate}
      initialRunId={urlSeed?.runId}
    >
      <ProfitEstimatorInner
        initialPercentile={urlSeed?.percentile ?? Percentile.P90}
        basis={basis}
      />
    </GlobalFilterProvider>
  );
}

/** A percentage field: the raw string the user is typing plus the clamped number in use. */
function usePercentField(defaultValue: number, eventName: string) {
  const [raw, setRaw] = useState(String(defaultValue));
  const [value, setValue] = useState(defaultValue);
  const reset = useCallback((next: number) => {
    setRaw(String(next));
    setValue(next);
  }, []);
  const onChange = useCallback(
    (next: string) => {
      setRaw(next);
      const parsed = Number.parseFloat(next);
      if (Number.isFinite(parsed)) setValue(clampPercent(parsed, defaultValue));
    },
    [defaultValue],
  );
  const onBlur = useCallback(() => {
    const parsed = Number.parseFloat(raw);
    const clamped = Number.isFinite(parsed) ? clampPercent(parsed, defaultValue) : defaultValue;
    setValue(clamped);
    setRaw(String(clamped));
    track(eventName, { value: clamped });
  }, [raw, defaultValue, eventName]);
  return { raw, value, onChange, onBlur, reset };
}

function ProfitEstimatorInner({
  initialPercentile,
  basis,
}: {
  initialPercentile: Percentile;
  basis: ProfitBasis;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const chartStrings = profitEstimatorChartStrings(locale);
  const { setUrlParam, getUrlParam } = useUrlState();
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown();
  const { resolvedTheme } = useTheme();

  // Precision is not a control here: `effectivePrecisions` stays in auto mode,
  // which resolves to the densest measured precision per model, so the bars
  // always reflect the best-covered run set.
  const {
    selectedModel,
    effectiveSequence,
    sequenceResolved,
    effectivePrecisions: selectedPrecisions,
  } = useGlobalFilterSelection();
  const { setSelectedModel, setSelectedSequence } = useGlobalFilterActions();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availableModels, availabilityRows } = useGlobalFilterAvailability();
  // This page is agentic only: the sequence is pinned, and the model list is
  // the tab's route allow-list (Kimi K3, GLM 5.2/5.3, MiniMax M3) intersected
  // with the models that have an agentic-traces run, so the selector never offers a model
  // that would draw an empty chart. If the intersection is still loading or
  // empty, the allow-list alone is offered so the selector is never blank.
  const selectedSequence = Sequence.AgenticTraces;
  const agenticModels = useMemo(() => {
    const allowed = modelRoutesForTab(PROFIT_BASIS_TAB[basis]).map((route) => route.model);
    const withData = modelsWithAgenticData(
      availableModels,
      availabilityRows,
      (m) => DISPLAY_MODEL_TO_DB[m] ?? [m],
    );
    const both = allowed.filter((m) => withData.includes(m));
    return both.length > 0 ? both : allowed;
  }, [availableModels, availabilityRows, basis]);
  const modelAllowed = agenticModels.includes(selectedModel);
  useEffect(() => {
    if (!modelAllowed && agenticModels[0]) setSelectedModel(agenticModels[0]);
  }, [modelAllowed, agenticModels, setSelectedModel]);
  useEffect(() => {
    if (sequenceResolved && effectiveSequence !== Sequence.AgenticTraces) {
      setSelectedSequence(Sequence.AgenticTraces);
    }
  }, [sequenceResolved, effectiveSequence, setSelectedSequence]);
  const mode = 'interactivity_to_throughput' as const;

  const [costProvider, setCostProvider] = useState<ProfitCostProvider>('costh');
  const [priceSource, setPriceSource] = useState<PriceSource>(() =>
    defaultPriceSource(selectedModel),
  );
  const [customInputPrice, setCustomInputPrice] = useState('1');
  const [customCachedPrice, setCustomCachedPrice] = useState('0.1');
  const [customOutputPrice, setCustomOutputPrice] = useState('1');
  const [targetValue, setTargetValue] = useState<number>(
    () => profitModelDefaults(selectedModel).interactivity,
  );
  const [targetRaw, setTargetRaw] = useState<string>(() => String(targetValue));
  const utilization = usePercentField(DEFAULT_UTILIZATION_PCT, 'profit_utilization_set');
  const labCut = usePercentField(
    profitModelDefaults(selectedModel).labCutPct,
    'profit_lab_cut_set',
  );
  // Each model has its own operating point, price source, and license fee
  // (Kimi K3: 45 tok/s/user on OpenRouter at 30%; GLM 5.2/5.3: 100 tok/s/user
  // on the Z.ai list price at 30%; MiniMax M3: 83 tok/s/user on the MiniMax
  // list price at 20%), so a model switch re-seeds all three. The ref keeps
  // this to actual switches: re-renders with the same model leave the
  // reader's edits alone.
  const defaultsAppliedFor = useRef<Model>(selectedModel);
  const resetLabCut = labCut.reset;
  useEffect(() => {
    if (defaultsAppliedFor.current === selectedModel) return;
    defaultsAppliedFor.current = selectedModel;
    const defaults = profitModelDefaults(selectedModel);
    setTargetValue(defaults.interactivity);
    setTargetRaw(String(defaults.interactivity));
    setPriceSource(defaultPriceSource(selectedModel));
    resetLabCut(defaults.labCutPct);
  }, [selectedModel, resetLabCut]);
  const listPricing = profitModelDefaults(selectedModel).listPricing;
  // A model without a list price cannot stay on 'list' (e.g. the route seeded
  // one model and the allow-list swapped it); fall back to the catalog.
  const effectivePriceSource: PriceSource =
    priceSource === 'list' && !listPricing ? 'openrouter' : priceSource;
  const [selectedPercentile, setSelectedPercentile] = useState<Percentile>(initialPercentile);
  const [visibilityIntent, setVisibilityIntent] = useState<CalculatorVisibilityIntent | null>(null);

  const {
    hardwareConfig,
    getResults,
    loading: throughputLoading,
    error,
    hasData,
    availableHwKeys,
  } = useThroughputData(
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedRunDate,
    undefined,
    selectedPercentile,
    undefined,
    true,
    'total',
  );

  // ── Compare history ───────────────────────────────────────────────────────
  // The `/inference` panel, pinned to this page's workload: up to four chip
  // configs and a date range. The selection lives in the same `i_gpus`,
  // `i_dstart`, and `i_dend` URL params, so a comparison built on `/inference`
  // pastes straight into the estimator. Hydrated after mount so the first
  // client render matches the server one.
  const [selectedGPUs, setSelectedGPUs] = useState<string[]>([]);
  const [selectedDateRange, setSelectedDateRange] = useState({ startDate: '', endDate: '' });
  useEffect(() => {
    const gpus = getUrlParam('i_gpus');
    if (gpus) setSelectedGPUs(gpus.split(',').filter(Boolean).slice(0, PROFIT_HISTORY_MAX_GPUS));
    const startDate = getUrlParam('i_dstart') || '';
    const endDate = getUrlParam('i_dend') || '';
    if (startDate && endDate) setSelectedDateRange({ startDate, endDate });
  }, [getUrlParam]);

  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );
  const historyChipOptions = useMemo(
    () =>
      profitHistoryChipOptions(availabilityRows, dbModelKeys, selectedPrecisions, selectedModel),
    [availabilityRows, dbModelKeys, selectedPrecisions, selectedModel],
  );
  // A chip the new model (or precision) has no agentic rows for leaves the
  // selection, the way `/inference` prunes its comparison on a model switch.
  useEffect(() => {
    if (!availabilityRows || selectedGPUs.length === 0 || historyChipOptions.length === 0) return;
    const offered = new Set(historyChipOptions.map((o) => o.value));
    const kept = selectedGPUs.filter((hw) => offered.has(hw));
    if (kept.length !== selectedGPUs.length) {
      setSelectedGPUs(kept);
      setUrlParam('i_gpus', kept.join(','));
    }
  }, [availabilityRows, historyChipOptions, selectedGPUs, setUrlParam]);
  const historyAvailableDates = useMemo(
    () =>
      profitHistoryAvailableDates(availabilityRows, dbModelKeys, selectedPrecisions, selectedGPUs),
    [availabilityRows, dbModelKeys, selectedPrecisions, selectedGPUs],
  );

  const handleHistoryGpuChange = useCallback(
    (next: string[]) => {
      setSelectedGPUs(next);
      setUrlParam('i_gpus', next.join(','));
      if (next.length === 0) {
        setSelectedDateRange({ startDate: '', endDate: '' });
        setUrlParam('i_dstart', '');
        setUrlParam('i_dend', '');
      }
      track('profit_history_gpu_selected', { gpus: next, count: next.length });
    },
    [setUrlParam],
  );
  const handleHistoryDateRangeChange = useCallback(
    (range: { startDate: string; endDate: string }) => {
      setSelectedDateRange(range);
      setUrlParam('i_dstart', range.startDate);
      setUrlParam('i_dend', range.endDate);
      track('profit_history_date_range_changed', range);
    },
    [setUrlParam],
  );

  const history = useProfitHistory({
    model: selectedModel,
    sequence: selectedSequence,
    selectedGPUs,
    dateRange: selectedDateRange,
    currentRunDate: selectedRunDate,
    enabled: hasData,
  });
  const historyActive = history.comparisonDates.length > 0;
  // A comparison date still in flight holds the chart, as on `/inference`, so
  // the bars never show today's chips with the history half missing.
  const loading = throughputLoading || history.loading;

  // Per-base-GPU $/GPU/hr typed by the reader; seeded from the hyperscaler
  // tier the first time each chip appears so the custom view starts identical
  // to the default one.
  const [customCosts, setCustomCosts] = useState<Record<string, string>>({});
  const customCostBases = useMemo(
    () =>
      [...new Set(availableHwKeys.map(baseGpuOf))]
        .filter((base) => base in HW_REGISTRY)
        .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b)),
    [availableHwKeys],
  );
  useEffect(() => {
    setCustomCosts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const base of customCostBases) {
        if (next[base] === undefined) {
          next[base] = String(getGpuSpecs(base)[CUSTOM_COST_SEED]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [customCostBases]);
  const costPerGpuHourFor = useCallback(
    (hwKey: string): number => {
      const base = baseGpuOf(hwKey);
      if (costProvider === 'custom') return parseCustomCostInput(customCosts[base]) ?? 0;
      return getGpuSpecs(base)[costProvider];
    },
    [costProvider, customCosts],
  );
  const interpolationCostProvider: CostProvider =
    costProvider === 'custom' ? CUSTOM_COST_SEED : costProvider;

  const featureGateUnlocked = useFeatureGate();
  const percentileLabel = selectedPercentile.toUpperCase();

  const openRouterModelId = getOpenRouterModelId(selectedModel);
  const openRouterQuery = useOpenRouterPricing(
    openRouterModelId,
    effectivePriceSource === 'openrouter',
  );

  const pricing = useMemo<TokenRevenuePricing | null>(() => {
    if (effectivePriceSource === 'list' && listPricing) {
      return listPricingToTokenRevenuePricing(listPricing);
    }
    if (effectivePriceSource === 'custom') {
      const input = parseTokenPriceInput(customInputPrice);
      const cached = parseTokenPriceInput(customCachedPrice);
      const output = parseTokenPriceInput(customOutputPrice);
      if (input === null || cached === null || output === null) return null;
      return {
        source: 'normalized',
        inputPerMillion: input,
        cachedInputPerMillion: cached,
        outputPerMillion: output,
      };
    }
    return openRouterQuery.data ?? null;
  }, [
    effectivePriceSource,
    listPricing,
    customInputPrice,
    customCachedPrice,
    customOutputPrice,
    openRouterQuery.data,
  ]);

  const assumptions = useMemo(
    () => ({ utilizationPct: utilization.value, labCutPct: labCut.value, basis }),
    [utilization.value, labCut.value, basis],
  );

  // Price every SKU first, then build the legend from the ones that produced a
  // bar. A config the target falls outside of (or that cannot be priced) is
  // named in the caption instead of being offered as a legend chip.
  //
  // With a history comparison active, only the compared chips are drawn, as on
  // `/inference`: today's bar for each, then one per comparison date priced
  // from that date's run with the same target, prices, and TCO tier.
  const fullEstimate = useMemo(() => {
    if (!hasData || !pricing) return { rows: [], skipped: [] };
    const current = getResults(targetValue, mode, interpolationCostProvider);
    const results = historyActive
      ? [
          ...current.filter((r) => selectedGPUs.includes(r.hwKey)),
          ...buildProfitHistoryResults(history.rowsByDate, {
            selectedGPUs,
            precisions: selectedPrecisions,
            percentile: selectedPercentile,
            targetValue,
            mode,
            costProvider: interpolationCostProvider,
          }),
        ]
      : current;
    const estimated = estimateProfitRows(
      results,
      (hwKey) => ({
        powerKwPerGpu: getGpuSpecs(hwKey).power,
        costPerGpuHour: costPerGpuHourFor(hwKey),
      }),
      pricing,
      assumptions,
    );
    return historyActive
      ? { ...estimated, rows: orderProfitRowsForHistory(estimated.rows) }
      : estimated;
  }, [
    hasData,
    pricing,
    getResults,
    targetValue,
    mode,
    interpolationCostProvider,
    costPerGpuHourFor,
    assumptions,
    historyActive,
    history.rowsByDate,
    selectedGPUs,
    selectedPrecisions,
    selectedPercentile,
  ]);

  const legendHwKeys = useMemo(() => {
    const priced = new Set(fullEstimate.rows.map((row) => row.hwKey));
    return availableHwKeys.filter((key) => priced.has(key));
  }, [fullEstimate.rows, availableHwKeys]);

  const selectionKey = `${selectedModel}|${selectedSequence}|${[...selectedPrecisions]
    .toSorted()
    .join(',')}|${selectedRunDate}|${[...legendHwKeys].toSorted().join(',')}`;

  const visibleHwKeys = useMemo(
    () => resolveCalculatorVisibility(visibilityIntent, selectionKey, legendHwKeys),
    [visibilityIntent, selectionKey, legendHwKeys],
  );
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({ highContrast: false, activeKeys: visibleKeysArray });

  // Bar colour: the chip's vendor colour, faded toward the page background for
  // older comparison dates (oldest lightest, today solid), the lightness ramp
  // the `/inference` comparison uses to tell one config's dates apart.
  const historyRanks = useMemo(
    () => profitHistoryDateRanks(fullEstimate.rows),
    [fullEstimate.rows],
  );
  const colorForRow = useCallback(
    (row: ProfitEstimatorRow) => {
      const base = resolveColor(row.hwKey);
      if (!row.date) return base;
      const theme = resolvedTheme === 'dark' ? 'dark' : 'light';
      return shadeHistoryColor(
        base,
        historyFadeShare(historyRanks.rank(row.date), historyRanks.count),
        theme,
      );
    },
    [resolveColor, resolvedTheme, historyRanks],
  );

  const estimate = useMemo(
    () => ({
      rows: fullEstimate.rows.filter((row) => visibleHwKeys.has(row.hwKey)),
      skipped: fullEstimate.skipped,
    }),
    [fullEstimate, visibleHwKeys],
  );

  const handleTargetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTargetRaw(e.target.value);
    const parsed = Number.parseFloat(e.target.value);
    if (Number.isFinite(parsed) && parsed > 0) setTargetValue(parsed);
  }, []);

  const handleTargetBlur = useCallback(() => {
    const parsed = Number.parseFloat(targetRaw);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : targetValue;
    setTargetValue(next);
    setTargetRaw(String(next));
    track('profit_target_set', { mode, value: next });
  }, [targetRaw, targetValue, mode]);

  const handleModelChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedModel(value as Model);
      track('profit_model_selected', { model: value });
    },
    [setSelectedModel],
  );

  const handlePercentileChange = useCallback(
    (value: Percentile) => {
      setSelectedPercentile(value);
      setUrlParam('i_pctl', value);
      track('profit_percentile_selected', { percentile: value });
    },
    [setUrlParam],
  );

  const toggleGpuVisibility = useCallback(
    (hwKey: string) => {
      const visibleLegendKeys = legendHwKeys.filter((key) => visibleHwKeys.has(key));
      const allVisible = visibleLegendKeys.length === legendHwKeys.length;
      const isVisible = visibleHwKeys.has(hwKey);
      let next: Set<string>;
      if (isVisible && allVisible) {
        next = new Set([hwKey]);
      } else if (isVisible && visibleLegendKeys.length === 1) {
        next = new Set(legendHwKeys);
      } else {
        next = new Set(visibleHwKeys);
        if (isVisible) next.delete(hwKey);
        else next.add(hwKey);
      }
      setVisibilityIntent({
        scopeKey: selectionKey,
        visible: next,
        known: new Set(legendHwKeys),
      });
      track('profit_gpu_toggled', { gpu: hwKey });
    },
    [legendHwKeys, visibleHwKeys, selectionKey],
  );

  const handleResetGpus = useCallback(() => {
    setVisibilityIntent({
      scopeKey: selectionKey,
      visible: new Set(legendHwKeys),
      known: new Set(legendHwKeys),
    });
    track('profit_gpu_reset', { gpuCount: legendHwKeys.length });
  }, [legendHwKeys, selectionKey]);

  const legendItems = useMemo(
    () =>
      Object.entries(hardwareConfig)
        .filter(([key]) => legendHwKeys.includes(key))
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
    [hardwareConfig, legendHwKeys, visibleHwKeys, resolveColor, toggleGpuVisibility],
  );

  const pricingNotice = useMemo(() => {
    if (effectivePriceSource !== 'openrouter') return null;
    // A model with no OpenRouter listing never starts the query, and TanStack v5
    // leaves a disabled query `isPending`, so check the id before the fetch state.
    if (openRouterModelId === null) return t.pricingUnavailable(null);
    if (openRouterQuery.isLoading) return t.pricingLoading;
    if (!openRouterQuery.data) return t.pricingUnavailable(openRouterModelId);
    return null;
  }, [effectivePriceSource, openRouterQuery.isLoading, openRouterQuery.data, openRouterModelId, t]);

  const costTier = costTierLabel(COST_PROVIDER_TIER[costProvider], locale);
  const priceSourceLabel =
    pricing?.source === 'openrouter'
      ? 'OpenRouter'
      : effectivePriceSource === 'list' && listPricing
        ? locale === 'zh'
          ? `${listPricing.vendor} 官方定价`
          : `${listPricing.vendor} list price`
        : locale === 'zh'
          ? '自定义'
          : 'custom';

  // Only the SKUs the legend currently shows; hiding a bar drops its badge.
  const tcoBadges = useMemo(() => {
    const bases = new Set<string>();
    for (const key of legendHwKeys) {
      if (!visibleHwKeys.has(key)) continue;
      const base = key.split('_')[0];
      if (base in HW_REGISTRY) bases.add(base);
    }
    return [...bases]
      .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map((base) => ({
        base,
        label: HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase(),
        cost: costPerGpuHourFor(base),
      }));
  }, [legendHwKeys, visibleHwKeys, costPerGpuHourFor]);

  // Compared chips with no bar on a comparison date, named in the caption so
  // a missing bar reads as "no run that day", not as a zero.
  const historyMissing = useMemo(() => {
    if (!historyActive) return [];
    const priced = new Set(fullEstimate.rows.map((row) => `${row.hwKey}~${row.date ?? ''}`));
    const missing: string[] = [];
    for (const date of history.comparisonDates) {
      for (const hwKey of selectedGPUs) {
        if (priced.has(`${hwKey}~${date}`)) continue;
        const config = hardwareConfig[hwKey];
        missing.push(`${config ? getDisplayLabel(config) : hwKey} • ${date}`);
      }
    }
    return missing;
  }, [historyActive, fullEstimate.rows, history.comparisonDates, selectedGPUs, hardwareConfig]);

  // Rendered as the chart's figcaption so it is part of the PNG export.
  const caption = useMemo(() => {
    if (!pricing) return null;
    // Right padding keeps the title and price lines clear of the export
    // button, which sits in the figure corner.
    return (
      <div className="mb-2 pr-12" data-testid="profit-caption">
        <Heading as="h2" level="card">
          <ModelLogo model={selectedModel} className="mr-2 size-6 align-[-0.3em]" />
          {t.chartTitle[basis](
            getModelLabel(selectedModel),
            getSequenceLabel(Sequence.AgenticTraces, locale),
            percentileLabel,
            targetValue,
          )}
        </Heading>
        <ResultContext
          locale={locale}
          costTier={costTier}
          utilization={`${assumptions.utilizationPct}%`}
          licenseFee={`${assumptions.labCutPct}%`}
          date={selectedRunDate}
          source="SemiAnalysis InferenceX™"
        />
        {historyActive && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="profit-history-note">
            {t.historyNote(history.comparisonDates.join(locale === 'zh' ? '、' : ', '))}
            {historyMissing.length > 0 && <> {t.historyNoData(historyMissing.join(', '))}</>}
          </p>
        )}
        <p
          className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          data-testid="profit-tco-badges"
        >
          {t.tcoBadgesLabel}{' '}
          {tcoBadges.map((badge) => (
            <Badge key={badge.base} variant="outline" data-testid="profit-tco-badge">
              {badge.label}: {badge.cost}
            </Badge>
          ))}
        </p>
        {costProvider !== 'custom' && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="profit-tco-source">
            <small>
              {t.sourceLabel}{' '}
              <Link
                target="_blank"
                className="underline hover:text-foreground"
                href={TCO_SOURCE_URL}
              >
                {TCO_SOURCE_TITLE}
                <ExternalLinkIcon />
              </Link>
            </small>
          </p>
        )}
        <p className="mb-2 text-xs text-muted-foreground" data-testid="profit-selling-prices">
          <span className="font-medium text-foreground">{t.sellingPriceLabel}:</span>{' '}
          {t.sellingPrices(
            formatTokenPrice(pricing.inputPerMillion),
            formatTokenPrice(cachedInputPricePerMillion(pricing)),
            formatTokenPrice(pricing.outputPerMillion),
            priceSourceLabel,
          )}
          {effectivePriceSource === 'list' && listPricing && (
            <>
              {' '}
              <Link
                target="_blank"
                className="underline hover:text-foreground"
                href={listPricing.sourceUrl}
                data-testid="profit-list-price-source"
              >
                {t.sourceLabel} {listPricing.vendor}
                <ExternalLinkIcon />
              </Link>
            </>
          )}
        </p>
      </div>
    );
  }, [
    pricing,
    effectivePriceSource,
    listPricing,
    selectedModel,
    locale,
    percentileLabel,
    targetValue,
    costTier,
    costProvider,
    assumptions.utilizationPct,
    assumptions.labCutPct,
    basis,
    selectedRunDate,
    tcoBadges,
    priceSourceLabel,
    t,
    historyActive,
    history.comparisonDates,
    historyMissing,
  ]);

  const exportFileName =
    basis === 'gw-year'
      ? `InferenceX_profit_estimator_per_gigawatt_${selectedModel}`
      : `InferenceX_profit_estimator_${selectedModel}`;

  const handleExportCsv = useCallback(() => {
    // Whole dollars are plenty per GW-year; per chip-hour the cents are the figure.
    const usd = (value: number) => (basis === 'gw-year' ? Math.round(value) : value.toFixed(4));
    const rows = estimate.rows.map((row) => [
      rowLabel({ ...row, date: undefined }, hardwareConfig),
      row.precision?.toUpperCase() ?? '',
      row.date ?? selectedRunDate ?? '',
      usd(row.revenue),
      usd(row.tco),
      usd(row.grossMargin),
      usd(row.labCut),
      usd(row.profit),
      row.revenue > 0 ? (row.profit / row.revenue).toFixed(4) : '',
      row.revenuePerGpuHour.toFixed(4),
      // GPU-hours is 1 per chip-hour, so that basis has no column for it.
      ...(basis === 'gw-year' ? [Math.round(row.gpuHours)] : []),
    ]);
    const [sku, precision, ...rest] = t.csvHeaders[basis];
    exportToCsv(exportFileName, [sku, precision, t.csvDateHeader, ...rest], rows, [
      t.captionFormula[basis](assumptions.utilizationPct, assumptions.labCutPct),
    ]);
  }, [estimate.rows, hardwareConfig, exportFileName, t, assumptions, basis, selectedRunDate]);

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
      <section data-testid="profit-controls">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader title={t.title[basis]} actions={<ChartShareActions />} />

            <TooltipProvider delayDuration={0}>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                  featureGateUnlocked ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
                }`}
              >
                <div className="md:col-span-2">
                  <ModelSelector
                    id="profit-model"
                    data-testid="profit-model-selector"
                    value={selectedModel}
                    onChange={handleModelChange}
                    open={openDropdown === 'model'}
                    onOpenChange={handleDropdownOpenChange('model')}
                    availableModels={agenticModels}
                  />
                </div>
                {featureGateUnlocked && (
                  <PercentileSelector
                    id="profit-percentile"
                    data-testid="profit-percentile-selector"
                    value={selectedPercentile}
                    onChange={handlePercentileChange}
                  />
                )}
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="profit-cost"
                    label={t.costProviderLabel}
                    tooltip={t.costProviderTooltip}
                  />
                  <div data-testid="profit-cost-selector">
                    <MultiSelect
                      triggerId="profit-cost"
                      options={COST_PROVIDER_OPTIONS.map((provider) => ({
                        value: provider.value,
                        label: locale === 'zh' ? provider.labelZh : provider.label,
                      }))}
                      value={[costProvider]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        setCostProvider(next as ProfitCostProvider);
                        track('profit_cost_provider_changed', { provider: next });
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="profit-target"
                    label={t.targetAgenticLabel(percentileLabel)}
                    tooltip={t.targetAgenticTooltip(percentileLabel)}
                  />
                  <Input
                    id="profit-target"
                    data-testid="profit-target-input"
                    type="number"
                    onWheel={blurOnWheel}
                    inputMode="decimal"
                    min={1}
                    step={1}
                    value={targetRaw}
                    onChange={handleTargetChange}
                    onBlur={handleTargetBlur}
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="profit-price-source"
                    label={t.priceSourceLabel}
                    tooltip={t.priceSourceTooltip}
                  />
                  <div data-testid="profit-price-source-selector">
                    <MultiSelect
                      triggerId="profit-price-source"
                      options={priceSourceOptions(listPricing?.vendor ?? null).map((option) => ({
                        value: option.value,
                        label: locale === 'zh' ? option.labelZh : option.label,
                      }))}
                      value={[effectivePriceSource]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        // Seed the custom fields from the price in force (list or
                        // live catalog) so switching over starts from a real price
                        // instead of $1/M.
                        if (next === 'custom' && pricing) {
                          setCustomInputPrice(formatTokenPrice(pricing.inputPerMillion));
                          setCustomCachedPrice(
                            formatTokenPrice(cachedInputPricePerMillion(pricing)),
                          );
                          setCustomOutputPrice(formatTokenPrice(pricing.outputPerMillion));
                        }
                        setPriceSource(next as PriceSource);
                        track('profit_price_source_changed', { source: next });
                      }}
                      open={openDropdown === 'priceSource'}
                      onOpenChange={handleDropdownOpenChange('priceSource')}
                      placeholder={t.priceSourcePlaceholder}
                      minSelections={1}
                      maxSelections={1}
                      showClearAll={false}
                      searchable={false}
                      plainSelectedText
                      showSelectionSummary={false}
                    />
                  </div>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="profit-utilization"
                    label={t.utilizationLabel}
                    tooltip={t.utilizationTooltip}
                  />
                  <Input
                    id="profit-utilization"
                    data-testid="profit-utilization-input"
                    type="number"
                    onWheel={blurOnWheel}
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={1}
                    value={utilization.raw}
                    onChange={(e) => utilization.onChange(e.target.value)}
                    onBlur={utilization.onBlur}
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="profit-lab-cut"
                    label={t.labCutLabel}
                    tooltip={t.labCutTooltip}
                  />
                  <Input
                    id="profit-lab-cut"
                    data-testid="profit-lab-cut-input"
                    type="number"
                    onWheel={blurOnWheel}
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={1}
                    value={labCut.raw}
                    onChange={(e) => labCut.onChange(e.target.value)}
                    onBlur={labCut.onBlur}
                  />
                </div>
              </div>

              {/* Custom token prices get their own row so the main controls keep their width. */}
              {effectivePriceSource === 'custom' && (
                <div
                  data-testid="profit-custom-prices"
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="profit-input-price">{t.inputPriceLabel}</Label>
                    <Input
                      id="profit-input-price"
                      data-testid="profit-input-price"
                      type="number"
                      onWheel={blurOnWheel}
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      value={customInputPrice}
                      onChange={(e) => setCustomInputPrice(e.target.value)}
                      onBlur={() =>
                        track('profit_custom_price_set', {
                          stream: 'input',
                          value: customInputPrice,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="profit-cached-price">{t.cachedPriceLabel}</Label>
                    <Input
                      id="profit-cached-price"
                      data-testid="profit-cached-price"
                      type="number"
                      onWheel={blurOnWheel}
                      inputMode="decimal"
                      min={0}
                      step={0.001}
                      value={customCachedPrice}
                      onChange={(e) => setCustomCachedPrice(e.target.value)}
                      onBlur={() =>
                        track('profit_custom_price_set', {
                          stream: 'cached',
                          value: customCachedPrice,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="profit-output-price">{t.outputPriceLabel}</Label>
                    <Input
                      id="profit-output-price"
                      data-testid="profit-output-price"
                      type="number"
                      onWheel={blurOnWheel}
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      value={customOutputPrice}
                      onChange={(e) => setCustomOutputPrice(e.target.value)}
                      onBlur={() =>
                        track('profit_custom_price_set', {
                          stream: 'output',
                          value: customOutputPrice,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {costProvider === 'custom' && customCostBases.length > 0 && (
                <div
                  data-testid="profit-custom-costs"
                  className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6"
                >
                  {customCostBases.map((base) => {
                    const label = HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase();
                    return (
                      <div key={base} className="flex flex-col space-y-1.5">
                        <Label htmlFor={`profit-custom-cost-${base}`}>
                          {t.customCostLabel(label)}
                        </Label>
                        <Input
                          id={`profit-custom-cost-${base}`}
                          data-testid={`profit-custom-cost-${base}`}
                          type="number"
                          onWheel={blurOnWheel}
                          inputMode="decimal"
                          min={0}
                          step={0.01}
                          value={customCosts[base] ?? ''}
                          onChange={(e) =>
                            setCustomCosts((prev) => ({ ...prev, [base]: e.target.value }))
                          }
                          onBlur={() =>
                            track('profit_custom_cost_set', { gpu: base, value: customCosts[base] })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <ControlPanel legend={t.compareHistory} data-testid="profit-history-panel">
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <div className="flex min-w-0 flex-col space-y-1.5">
                    <LabelWithTooltip
                      htmlFor="profit-history-gpu"
                      label={t.gpuConfig}
                      tooltip={t.gpuConfigTooltip}
                    />
                    <div data-testid="profit-history-gpu-multiselect" className="min-w-0">
                      <MultiSelect
                        triggerId="profit-history-gpu"
                        options={historyChipOptions}
                        value={selectedGPUs}
                        onChange={handleHistoryGpuChange}
                        open={openDropdown === 'history-gpu'}
                        onOpenChange={handleDropdownOpenChange('history-gpu')}
                        placeholder={t.gpuConfigPlaceholder}
                        maxSelections={PROFIT_HISTORY_MAX_GPUS}
                        searchPlaceholder={locale === 'zh' ? '搜索…' : undefined}
                        noResultsLabel={locale === 'zh' ? '无结果' : undefined}
                        clearSearchLabel={locale === 'zh' ? '清除搜索' : undefined}
                        selectedSuffix={locale === 'zh' ? ' 已选' : undefined}
                      />
                    </div>
                  </div>

                  {selectedGPUs.length > 0 && (
                    <div
                      className="flex min-w-0 flex-col space-y-1.5"
                      data-testid="profit-history-date-range"
                    >
                      <LabelWithTooltip
                        htmlFor="profit-history-dates"
                        label={t.comparisonDateRange}
                        tooltip={t.comparisonDateRangeTooltip}
                      />
                      <DateRangePicker
                        dateRange={selectedDateRange}
                        onChange={handleHistoryDateRangeChange}
                        placeholder={t.dateRangePlaceholder}
                        availableDates={historyAvailableDates}
                      />
                    </div>
                  )}
                </div>
              </ControlPanel>
            </TooltipProvider>

            {!loading && legendItems.length > 0 && (
              <div
                data-testid="profit-legend"
                className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3"
              >
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {legendItems.map((item) => (
                    <ChartLegendItem key={item.hw} {...item} sidebarMode />
                  ))}
                </ul>
                {visibleHwKeys.size < legendHwKeys.length && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    data-testid="profit-reset-filter"
                    onClick={handleResetGpus}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t.resetFilter}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </section>

      {loading && (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      )}

      {!loading && hasData && (
        <Card>
          {pricingNotice && (
            <div
              className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              data-testid="profit-pricing-notice"
            >
              {pricingNotice}
            </div>
          )}
          {pricing ? (
            <figure data-testid="profit-figure" className="relative rounded-lg">
              <ChartButtons
                chartId="profit-estimator-chart"
                analyticsPrefix="profit_estimator"
                className="absolute top-0 right-0 z-10 mb-0"
                hideZoomReset
                onExportCsv={handleExportCsv}
                exportFileName={exportFileName}
              />
              <ProfitEstimatorChart
                rows={estimate.rows}
                hardwareConfig={hardwareConfig}
                colorResolver={colorForRow}
                assumptions={assumptions}
                caption={caption}
              />
              <div className="mt-1">
                <InfoFold
                  title={t.formulaTitle[basis]}
                  toggleLabel={t.formulaToggle}
                  testId="profit-formula-notes"
                >
                  {t.captionFormula[basis](assumptions.utilizationPct, assumptions.labCutPct)}
                </InfoFold>
              </div>
            </figure>
          ) : (
            !pricingNotice && (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                {chartStrings.noData}
              </div>
            )
          )}
        </Card>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DISPLAY_MODEL_TO_DB,
  HW_REGISTRY,
  TCO_SOURCE_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';
import { Info, Plus, X } from 'lucide-react';
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
import { costTierLabel, type CostTier } from '@/components/inference/metric-registry';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import ChartLegendItem from '@/components/ui/chart-legend-item';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { ModelSelector, PercentileSelector } from '@/components/ui/chart-selectors';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
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
import { modelRoutesForTab } from '@/lib/model-routes';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import {
  clampPercent,
  DEFAULT_LAB_CUT_PCT,
  DEFAULT_PROFIT_INTERACTIVITY,
  DEFAULT_UTILIZATION_PCT,
  estimateProfitRows,
  modelsWithAgenticData,
  parseTokenPriceInput,
  type ProfitEstimatorSkipReason,
} from './profit-estimator';
import { profitEstimatorChartStrings, rowLabel } from './ProfitEstimatorChart';
import type { CostProvider } from './types';
import { useThroughputData } from './useThroughputData';

type PriceSource = 'openrouter' | 'custom';

/** The three published TCO tiers plus a per-chip $/GPU/hr the reader types. */
type ProfitCostProvider = CostProvider | 'custom';

const COST_PROVIDER_OPTIONS: { value: ProfitCostProvider; label: string; labelZh: string }[] = [
  { value: 'costh', label: 'Hyperscaler', labelZh: '超大规模云服务商' },
  { value: 'costn', label: 'Neocloud', labelZh: 'Neocloud' },
  { value: 'costr', label: '3yr Rental', labelZh: '3 年租赁' },
  { value: 'custom', label: 'Custom $/GPU/hr', labelZh: '自定义 $/GPU/hr' },
];

const COST_PROVIDER_TIER: Record<ProfitCostProvider, CostTier> = {
  costh: 'hyperscaler',
  costn: 'neocloud',
  costr: 'rental',
  custom: 'custom',
};

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

const PRICE_SOURCE_OPTIONS: { value: PriceSource; label: string; labelZh: string }[] = [
  { value: 'openrouter', label: 'OpenRouter', labelZh: 'OpenRouter' },
  { value: 'custom', label: 'Custom $/M tok', labelZh: '自定义 $/M tok' },
];

const STRINGS = {
  en: {
    title: 'Revenue & Profit Estimator',
    costProviderLabel: 'Cost Provider',
    costProviderTooltip:
      'The TCO tier used for the compute-expense segment: Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental, in $/GPU/hr from the SemiAnalysis AI Cloud TCO Model. Custom lets you type your own $/GPU/hr per chip.',
    customCostLabel: (gpu: string) => `${gpu} $/GPU/hr`,
    costProviderPlaceholder: 'Cost provider',
    priceSourceLabel: 'Token Price',
    priceSourceTooltip:
      'Where the sale price per million tokens comes from. OpenRouter reads the public catalog price for this model; Custom lets you type your own input and output prices.',
    priceSourcePlaceholder: 'Token price',
    inputPriceLabel: 'Input $/M tok',
    outputPriceLabel: 'Output $/M tok',
    cachedPriceLabel: 'Cached input $/M tok',
    targetAgenticLabel: (percentile: string) => `Target ${percentile} Interactivity (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `The ${percentile} interactivity operating point used for agentic workload interpolation.`,
    utilizationLabel: 'Utilization (%)',
    utilizationTooltip:
      'Share of benchmarked throughput that is actually sold. 60% means the fleet bills 60% of the tokens it could produce. Revenue scales with it; compute expense does not, since the chips are paid for whether or not they are busy.',
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
    chartTitle: (model: string, workload: string, percentile: string, target: number) =>
      `${model} ${workload} Revenue & Profit Estimates per GigaWatt Per Year at ${percentile} ${target} tok/s/user Interactivity`,
    sellingPriceLabel: 'Selling Price per Million Tokens',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `Input: $${input} · Cached Input: $${cached} · Output: $${output} (${source})`,
    tcoBadgesLabel: 'TCO $/chip/hr:',
    sourceLabel: 'Source:',
    formulaTitle: 'Revenue per GigaWatt Formula',
    formulaToggle: 'Toggle formula notes',
    captionFormula: (util: number, labCut: number) =>
      `Revenue = $/GPU/hr × GPU-hours per GW-year × ${util}% utilization. GPU-hours = (1,000,000 kW ÷ all-in kW per GPU) × 8,760 h. Model license fee = ${labCut}% of revenue. Profit = revenue − TCO − license fee. Margin above each bar is profit ÷ revenue.`,
    csvHeaders: [
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
    skipped: (entries: string) => `Not priced: ${entries}.`,
    skipReason: {
      'outside-measured-range': 'no measured point at the target interactivity',
      'no-power': 'no all-in power figure',
      'no-cost': 'no TCO for this tier',
      'no-token-mix': 'no input/output token mix recorded',
    } satisfies Record<ProfitEstimatorSkipReason, string>,
  },
  zh: {
    title: '收入与利润估算器',
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '算力支出分段采用的 TCO 层级：Hyperscaler（如 AWS/GCP）、Neocloud（如 CoreWeave）或 3 年租赁，单位为 $/GPU/hr，来自 SemiAnalysis AI Cloud TCO 模型。选择自定义可为每种芯片输入自己的 $/GPU/hr。',
    customCostLabel: (gpu: string) => `${gpu} $/GPU/hr`,
    costProviderPlaceholder: '成本供应商',
    priceSourceLabel: 'Token 售价',
    priceSourceTooltip:
      '每百万 token 售价的来源。OpenRouter 读取该模型的公开目录价格；自定义则可自行输入输入/输出价格。',
    priceSourcePlaceholder: 'Token 售价',
    inputPriceLabel: '输入 $/M tok',
    outputPriceLabel: '输出 $/M tok',
    cachedPriceLabel: '缓存输入 $/M tok',
    targetAgenticLabel: (percentile: string) => `目标 ${percentile} 交互性 (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `用于智能体工作负载插值的 ${percentile} 交互性操作点。`,
    utilizationLabel: '利用率 (%)',
    utilizationTooltip:
      '实际售出的基准吞吐量比例。60% 表示集群只计费其可产出 token 的 60%。收入随之缩放；算力支出不变，因为芯片无论忙闲都要付费。',
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
    chartTitle: (model: string, workload: string, percentile: string, target: number) =>
      `${model} ${workload} 每吉瓦每年收入与利润估算（${percentile} 交互性 ${target} tok/s/user）`,
    sellingPriceLabel: '每百万 token 售价',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `输入：$${input} · 缓存输入：$${cached} · 输出：$${output}（${source}）`,
    tcoBadgesLabel: 'TCO $/chip/hr：',
    sourceLabel: '来源：',
    formulaTitle: '每吉瓦收入公式',
    formulaToggle: '展开或收起公式说明',
    captionFormula: (util: number, labCut: number) =>
      `收入 = $/GPU/hr × 每吉瓦年 GPU 小时数 × ${util}% 利用率。GPU 小时数 = (1,000,000 kW ÷ 每 GPU 全电源配置 kW) × 8,760 h。模型许可费 = 收入的 ${labCut}%。利润 = 收入 − TCO − 许可费。柱形上方的利润率 = 利润 ÷ 收入。`,
    csvHeaders: [
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
    skipped: (entries: string) => `未定价：${entries}。`,
    skipReason: {
      'outside-measured-range': '未在该交互性下实测',
      'no-power': '缺少全电源配置功率数据',
      'no-cost': '该层级无 TCO 数据',
      'no-token-mix': '未记录输入/输出 token 比例',
    } satisfies Record<ProfitEstimatorSkipReason, string>,
  },
} as const;

/** A bordered note under the chart that folds behind its title, like the metric notes on /inference. */
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
    <div className="rounded-md border border-border px-3 py-2 text-xs" data-testid={testId}>
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

export default function ProfitEstimatorDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  return (
    <GlobalFilterProvider
      initialModel={urlSeed?.model}
      initialSequence={Sequence.AgenticTraces}
      initialRunDate={urlSeed?.runDate}
      initialRunId={urlSeed?.runId}
    >
      <ProfitEstimatorInner initialPercentile={urlSeed?.percentile ?? Percentile.P90} />
    </GlobalFilterProvider>
  );
}

/** A percentage field: the raw string the user is typing plus the clamped number in use. */
function usePercentField(defaultValue: number, eventName: string) {
  const [raw, setRaw] = useState(String(defaultValue));
  const [value, setValue] = useState(defaultValue);
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
  return { raw, value, onChange, onBlur };
}

function ProfitEstimatorInner({ initialPercentile }: { initialPercentile: Percentile }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const chartStrings = profitEstimatorChartStrings(locale);
  const { setUrlParam } = useUrlState();
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown();

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
  // the tab's route allow-list (Kimi K3 for now) intersected with the models
  // that have an agentic-traces run, so the selector never offers a model
  // that would draw an empty chart. If the intersection is still loading or
  // empty, the allow-list alone is offered so the selector is never blank.
  const selectedSequence = Sequence.AgenticTraces;
  const agenticModels = useMemo(() => {
    const allowed = modelRoutesForTab('profit-estimator').map((route) => route.model);
    const withData = modelsWithAgenticData(
      availableModels,
      availabilityRows,
      (m) => DISPLAY_MODEL_TO_DB[m] ?? [m],
    );
    const both = allowed.filter((m) => withData.includes(m));
    return both.length > 0 ? both : allowed;
  }, [availableModels, availabilityRows]);
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
  const [priceSource, setPriceSource] = useState<PriceSource>('openrouter');
  const [customInputPrice, setCustomInputPrice] = useState('1');
  const [customCachedPrice, setCustomCachedPrice] = useState('0.1');
  const [customOutputPrice, setCustomOutputPrice] = useState('1');
  const [targetValue, setTargetValue] = useState<number>(DEFAULT_PROFIT_INTERACTIVITY);
  const [targetRaw, setTargetRaw] = useState<string>(String(DEFAULT_PROFIT_INTERACTIVITY));
  const [selectedPercentile, setSelectedPercentile] = useState<Percentile>(initialPercentile);
  const [visibilityIntent, setVisibilityIntent] = useState<CalculatorVisibilityIntent | null>(null);
  const utilization = usePercentField(DEFAULT_UTILIZATION_PCT, 'profit_utilization_set');
  const labCut = usePercentField(DEFAULT_LAB_CUT_PCT, 'profit_lab_cut_set');

  const { hardwareConfig, getResults, loading, error, hasData, availableHwKeys } =
    useThroughputData(
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
  const openRouterQuery = useOpenRouterPricing(openRouterModelId, priceSource === 'openrouter');

  const pricing = useMemo<TokenRevenuePricing | null>(() => {
    if (priceSource === 'custom') {
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
  }, [priceSource, customInputPrice, customCachedPrice, customOutputPrice, openRouterQuery.data]);

  const assumptions = useMemo(
    () => ({ utilizationPct: utilization.value, labCutPct: labCut.value }),
    [utilization.value, labCut.value],
  );

  // Price every SKU first, then build the legend from the ones that produced a
  // bar. A config the target falls outside of (or that cannot be priced) is
  // named in the caption instead of being offered as a legend chip.
  const fullEstimate = useMemo(() => {
    if (!hasData || !pricing) return { rows: [], skipped: [] };
    const results = getResults(targetValue, mode, interpolationCostProvider);
    return estimateProfitRows(
      results,
      (hwKey) => ({
        powerKwPerGpu: getGpuSpecs(hwKey).power,
        costPerGpuHour: costPerGpuHourFor(hwKey),
      }),
      pricing,
      assumptions,
    );
  }, [
    hasData,
    pricing,
    getResults,
    targetValue,
    mode,
    interpolationCostProvider,
    costPerGpuHourFor,
    assumptions,
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
    if (priceSource !== 'openrouter') return null;
    // A model with no OpenRouter listing never starts the query, and TanStack v5
    // leaves a disabled query `isPending`, so check the id before the fetch state.
    if (openRouterModelId === null) return t.pricingUnavailable(null);
    if (openRouterQuery.isLoading) return t.pricingLoading;
    if (!openRouterQuery.data) return t.pricingUnavailable(openRouterModelId);
    return null;
  }, [priceSource, openRouterQuery.isLoading, openRouterQuery.data, openRouterModelId, t]);

  const costTier = costTierLabel(COST_PROVIDER_TIER[costProvider], locale);
  const priceSourceLabel =
    pricing?.source === 'openrouter' ? 'OpenRouter' : locale === 'zh' ? '自定义' : 'custom';

  const tcoBadges = useMemo(() => {
    const bases = new Set<string>();
    for (const key of legendHwKeys) {
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
  }, [legendHwKeys, costPerGpuHourFor]);

  // Rendered as the chart's figcaption so it is part of the PNG export.
  const caption = useMemo(() => {
    if (!pricing) return null;
    // Right padding keeps the title and price lines clear of the export
    // button, which sits in the figure corner.
    return (
      <div className="mb-2 pr-12" data-testid="profit-caption">
        <Heading as="h2" level="card">
          <ModelLogo model={selectedModel} className="mr-2 size-6 align-[-0.3em]" />
          {t.chartTitle(
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
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {t.tcoBadgesLabel}{' '}
          {tcoBadges.map((badge) => (
            <Badge key={badge.base} variant="outline">
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
        </p>
      </div>
    );
  }, [
    pricing,
    selectedModel,
    locale,
    percentileLabel,
    targetValue,
    costTier,
    costProvider,
    assumptions.utilizationPct,
    selectedRunDate,
    tcoBadges,
    priceSourceLabel,
    t,
  ]);

  const handleExportCsv = useCallback(() => {
    const rows = estimate.rows.map((row) => [
      rowLabel(row, hardwareConfig),
      row.precision?.toUpperCase() ?? '',
      Math.round(row.revenue),
      Math.round(row.tco),
      Math.round(row.grossMargin),
      Math.round(row.labCut),
      Math.round(row.profit),
      row.revenue > 0 ? (row.profit / row.revenue).toFixed(4) : '',
      row.revenuePerGpuHour.toFixed(4),
      Math.round(row.gpuHoursPerGwYear),
    ]);
    exportToCsv(`InferenceX_profit_estimator_${selectedModel}`, [...t.csvHeaders], rows, [
      t.captionFormula(assumptions.utilizationPct, assumptions.labCutPct),
    ]);
  }, [estimate.rows, hardwareConfig, selectedModel, t, assumptions]);

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
            <DashboardSectionHeader title={t.title} actions={<ChartShareActions />} />

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
                      options={PRICE_SOURCE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: locale === 'zh' ? option.labelZh : option.label,
                      }))}
                      value={[priceSource]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        // Seed the custom fields from the live catalog so switching
                        // over starts from a real price instead of $1/M.
                        if (next === 'custom' && openRouterQuery.data) {
                          setCustomInputPrice(
                            formatTokenPrice(openRouterQuery.data.inputPerMillion),
                          );
                          setCustomCachedPrice(
                            formatTokenPrice(cachedInputPricePerMillion(openRouterQuery.data)),
                          );
                          setCustomOutputPrice(
                            formatTokenPrice(openRouterQuery.data.outputPerMillion),
                          );
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
              {priceSource === 'custom' && (
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
                exportFileName={`InferenceX_profit_estimator_${selectedModel}`}
              />
              <ProfitEstimatorChart
                rows={estimate.rows}
                hardwareConfig={hardwareConfig}
                colorResolver={resolveColor}
                assumptions={assumptions}
                caption={caption}
              />
              <div className="mt-3">
                <InfoFold
                  title={t.formulaTitle}
                  toggleLabel={t.formulaToggle}
                  testId="profit-formula-notes"
                >
                  {t.captionFormula(assumptions.utilizationPct, assumptions.labCutPct)}
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

'use client';

import { useCallback, useMemo, useState } from 'react';

import ProfitEstimatorChart from '@/components/calculator/ProfitEstimatorChart';
import {
  resolveCalculatorTarget,
  resolveCalculatorTargetInputValue,
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
import { formatTokenPrice } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegendItem from '@/components/ui/chart-legend-item';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import {
  ModelSelector,
  PercentileSelector,
  PrecisionSelector,
  ScenarioSelector,
} from '@/components/ui/chart-selectors';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { getGpuSpecs, getModelSortIndex } from '@/lib/constants';
import { getOpenRouterModelId, Percentile, Sequence, type Model } from '@/lib/data-mappings';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import {
  clampPercent,
  DEFAULT_LAB_CUT_PCT,
  DEFAULT_PROFIT_INTERACTIVITY,
  DEFAULT_UTILIZATION_PCT,
  estimateProfitRows,
  formatUsdCompact,
  type ProfitEstimatorSkipReason,
} from './profit-estimator';
import { profitEstimatorChartStrings, rowLabel } from './ProfitEstimatorChart';
import type { CostProvider } from './types';
import { useThroughputData } from './useThroughputData';

type PriceSource = 'openrouter' | 'custom';

const COST_PROVIDER_OPTIONS: { value: CostProvider; label: string; labelZh: string }[] = [
  { value: 'costh', label: 'Hyperscaler', labelZh: '超大规模云服务商' },
  { value: 'costn', label: 'Neocloud', labelZh: 'Neocloud' },
  { value: 'costr', label: '3yr Rental', labelZh: '3 年租赁' },
];

const PRICE_SOURCE_OPTIONS: { value: PriceSource; label: string; labelZh: string }[] = [
  { value: 'openrouter', label: 'OpenRouter', labelZh: 'OpenRouter' },
  { value: 'custom', label: 'Custom $/M tok', labelZh: '自定义 $/M tok' },
];

const STRINGS = {
  en: {
    title: 'Profit Estimator',
    description:
      'What one all-in utility gigawatt-year of each chip earns at a chosen interactivity. Each bar is that year’s revenue at the utilization you set, split into compute expense (TCO), the model lab’s cut of gross margin, and what is left for the operator. Every figure is US$ per GW per year.',
    costProviderLabel: 'Cost Provider',
    costProviderTooltip:
      'The TCO tier used for the compute-expense segment: Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental, in $/GPU/hr from the SemiAnalysis AI Cloud TCO Model.',
    costProviderPlaceholder: 'Cost provider',
    priceSourceLabel: 'Token Price',
    priceSourceTooltip:
      'Where the sale price per million tokens comes from. OpenRouter reads the public catalog price for this model; Custom lets you type your own input and output prices.',
    priceSourcePlaceholder: 'Token price',
    inputPriceLabel: 'Input $/M tok',
    outputPriceLabel: 'Output $/M tok',
    targetLabel: 'Target Interactivity (tok/s/user)',
    targetTooltip:
      'The interactivity operating point used for interpolation. Throughput per chip is read off each config’s Pareto frontier at this speed.',
    targetAgenticLabel: (percentile: string) => `Target ${percentile} Interactivity (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `The ${percentile} interactivity operating point used for agentic workload interpolation.`,
    utilizationLabel: 'Utilization (%)',
    utilizationTooltip:
      'Share of benchmarked throughput that is actually sold. 60% means the fleet bills 60% of the tokens it could produce. Revenue scales with it; compute expense does not, since the chips are paid for whether or not they are busy.',
    labCutLabel: 'Lab Cut (% of margin)',
    labCutTooltip:
      'Share of gross margin (revenue minus compute expense) paid to the model lab. It is zero when the margin is negative.',
    errorLoading: 'Error loading data. Please try a different selection.',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
    pricingLoading: 'Loading OpenRouter pricing…',
    pricingUnavailable: (modelId: string | null) =>
      modelId
        ? `OpenRouter has no price for ${modelId}. Switch Token Price to Custom to enter one.`
        : 'This model has no OpenRouter listing. Switch Token Price to Custom to enter a price.',
    captionPrices: (input: string, cached: string, output: string, source: string) =>
      `Sale price: $${input}/M input, $${cached}/M cached input, $${output}/M output (${source}).`,
    captionFormula: (util: number, labCut: number) =>
      `Revenue = $/GPU/hr × GPU-hours per GW-year × ${util}% utilization. GPU-hours = (1,000,000 kW ÷ all-in kW per GPU) × 8,760 h. Lab cut = ${labCut}% of gross margin when positive.`,
    skipped: (entries: string) => `Not priced: ${entries}.`,
    skipReason: {
      'no-power': 'no all-in power figure',
      'no-cost': 'no TCO for this tier',
      'no-token-mix': 'no input/output token mix recorded',
    } satisfies Record<ProfitEstimatorSkipReason, string>,
    segmentKey: {
      tco: 'Compute expense (TCO)',
      labCut: 'Model lab cut',
      profit: 'Operator profit',
      loss: 'Operator loss',
    },
  },
  zh: {
    title: '利润估算器',
    description:
      '在选定的交互性下，每款芯片一个全电源配置吉瓦年能赚多少。每根柱形是按所设利用率计算的当年收入，拆分为算力支出（TCO）、模型实验室从毛利中抽取的分成，以及运营方所剩的利润。所有数字均为每吉瓦每年美元。',
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '算力支出分段采用的 TCO 层级：Hyperscaler（如 AWS/GCP）、Neocloud（如 CoreWeave）或 3 年租赁，单位为 $/GPU/hr，来自 SemiAnalysis AI Cloud TCO 模型。',
    costProviderPlaceholder: '成本供应商',
    priceSourceLabel: 'Token 售价',
    priceSourceTooltip:
      '每百万 token 售价的来源。OpenRouter 读取该模型的公开目录价格；自定义则可自行输入输入/输出价格。',
    priceSourcePlaceholder: 'Token 售价',
    inputPriceLabel: '输入 $/M tok',
    outputPriceLabel: '输出 $/M tok',
    targetLabel: '目标交互性 (tok/s/user)',
    targetTooltip: '用于插值的交互性操作点。按此速度在各配置的 Pareto 前沿上读取每芯片吞吐量。',
    targetAgenticLabel: (percentile: string) => `目标 ${percentile} 交互性 (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `用于智能体工作负载插值的 ${percentile} 交互性操作点。`,
    utilizationLabel: '利用率 (%)',
    utilizationTooltip:
      '实际售出的基准吞吐量比例。60% 表示集群只计费其可产出 token 的 60%。收入随之缩放；算力支出不变，因为芯片无论忙闲都要付费。',
    labCutLabel: '实验室分成（占毛利 %）',
    labCutTooltip: '支付给模型实验室的毛利（收入减算力支出）比例。毛利为负时为零。',
    errorLoading: '加载数据出错，请尝试其他选择。',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
    pricingLoading: '正在加载 OpenRouter 价格…',
    pricingUnavailable: (modelId: string | null) =>
      modelId
        ? `OpenRouter 没有 ${modelId} 的价格。请将 Token 售价切换为自定义并输入价格。`
        : '该模型没有 OpenRouter 条目。请将 Token 售价切换为自定义并输入价格。',
    captionPrices: (input: string, cached: string, output: string, source: string) =>
      `售价：输入 $${input}/M，缓存输入 $${cached}/M，输出 $${output}/M（${source}）。`,
    captionFormula: (util: number, labCut: number) =>
      `收入 = $/GPU/hr × 每吉瓦年 GPU 小时数 × ${util}% 利用率。GPU 小时数 = (1,000,000 kW ÷ 每 GPU 全电源配置 kW) × 8,760 h。实验室分成 = 毛利为正时的 ${labCut}%。`,
    skipped: (entries: string) => `未定价：${entries}。`,
    skipReason: {
      'no-power': '缺少全电源配置功率数据',
      'no-cost': '该层级无 TCO 数据',
      'no-token-mix': '未记录输入/输出 token 比例',
    } satisfies Record<ProfitEstimatorSkipReason, string>,
    segmentKey: {
      tco: '算力支出（TCO）',
      labCut: '模型实验室分成',
      profit: '运营方利润',
      loss: '运营方亏损',
    },
  },
} as const;

const SLIDER_CLASS =
  'w-full h-2 appearance-none rounded-full bg-secondary cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0';

export default function ProfitEstimatorDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  return (
    <GlobalFilterProvider
      initialModel={urlSeed?.model}
      initialSequence={urlSeed?.sequence}
      initialPrecisions={urlSeed?.precisions}
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

  const {
    selectedModel,
    effectiveSequence: selectedSequence,
    effectivePrecisions: selectedPrecisions,
  } = useGlobalFilterSelection();
  const { setSelectedModel, setSelectedSequence, setSelectedPrecisions } = useGlobalFilterActions();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availablePrecisions, availableSequences, availableModels } =
    useGlobalFilterAvailability();
  const mode = 'interactivity_to_throughput' as const;

  const [costProvider, setCostProvider] = useState<CostProvider>('costh');
  const [priceSource, setPriceSource] = useState<PriceSource>('openrouter');
  const [customInputPrice, setCustomInputPrice] = useState('1');
  const [customOutputPrice, setCustomOutputPrice] = useState('1');
  const [requestedTargetValue, setRequestedTargetValue] = useState<number>(
    DEFAULT_PROFIT_INTERACTIVITY,
  );
  const [inputValue, setInputValue] = useState<string>(String(DEFAULT_PROFIT_INTERACTIVITY));
  const [isTargetInputFocused, setIsTargetInputFocused] = useState(false);
  const [selectedPercentile, setSelectedPercentile] = useState<Percentile>(initialPercentile);
  const [visibilityIntent, setVisibilityIntent] = useState<CalculatorVisibilityIntent | null>(null);
  const [highContrast, setHighContrast] = useState(false);
  const utilization = usePercentField(DEFAULT_UTILIZATION_PCT, 'profit_utilization_set');
  const labCut = usePercentField(DEFAULT_LAB_CUT_PCT, 'profit_lab_cut_set');

  const { hardwareConfig, ranges, getResults, loading, error, hasData, availableHwKeys } =
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

  const isAgenticSequence = selectedSequence === Sequence.AgenticTraces;
  const featureGateUnlocked = useFeatureGate();
  const percentileLabel = selectedPercentile.toUpperCase();

  const openRouterModelId = getOpenRouterModelId(selectedModel);
  const openRouterQuery = useOpenRouterPricing(openRouterModelId, priceSource === 'openrouter');

  const pricing = useMemo<TokenRevenuePricing | null>(() => {
    if (priceSource === 'custom') {
      const input = Number.parseFloat(customInputPrice);
      const output = Number.parseFloat(customOutputPrice);
      if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) {
        return null;
      }
      return { source: 'normalized', inputPerMillion: input, outputPerMillion: output };
    }
    return openRouterQuery.data ?? null;
  }, [priceSource, customInputPrice, customOutputPrice, openRouterQuery.data]);

  const selectionKey = `${selectedModel}|${selectedSequence}|${[...selectedPrecisions]
    .toSorted()
    .join(',')}|${selectedRunDate}|${[...availableHwKeys].toSorted().join(',')}`;

  const visibleHwKeys = useMemo(
    () => resolveCalculatorVisibility(visibilityIntent, selectionKey, availableHwKeys),
    [visibilityIntent, selectionKey, availableHwKeys],
  );
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({ highContrast, activeKeys: visibleKeysArray });

  const targetValue = useMemo(
    () => resolveCalculatorTarget(requestedTargetValue, hasData, ranges.interactivity),
    [hasData, ranges.interactivity, requestedTargetValue],
  );
  const currentRange = ranges.interactivity;

  const assumptions = useMemo(
    () => ({ utilizationPct: utilization.value, labCutPct: labCut.value }),
    [utilization.value, labCut.value],
  );

  const estimate = useMemo(() => {
    if (!hasData || !pricing) return { rows: [], skipped: [] };
    const results = getResults(targetValue, mode, costProvider, visibleHwKeys);
    return estimateProfitRows(
      results,
      (hwKey) => {
        const specs = getGpuSpecs(hwKey);
        return { powerKwPerGpu: specs.power, costPerGpuHour: specs[costProvider] };
      },
      pricing,
      assumptions,
    );
  }, [hasData, pricing, getResults, targetValue, mode, costProvider, visibleHwKeys, assumptions]);

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setRequestedTargetValue(value);
    setInputValue(String(value));
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed) && parsed >= 0) setRequestedTargetValue(parsed);
  }, []);

  const handleInputFocus = useCallback(() => {
    setInputValue(String(targetValue));
    setIsTargetInputFocused(true);
  }, [targetValue]);

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed < 0) {
      setInputValue(String(targetValue));
    } else {
      const { min, max } = ranges.interactivity;
      const clamped = Math.max(min, Math.min(max, parsed));
      setRequestedTargetValue(clamped);
      setInputValue(String(clamped));
    }
    setIsTargetInputFocused(false);
    track('profit_target_set', { mode, value: targetValue });
  }, [inputValue, targetValue, mode, ranges.interactivity]);

  const handleModelChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedModel(value as Model);
      track('profit_model_selected', { model: value });
    },
    [setSelectedModel],
  );

  const handleSequenceChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedSequence(value as Sequence);
      track('profit_sequence_selected', { sequence: value });
    },
    [setSelectedSequence],
  );

  const handlePrecisionChange = useCallback(
    (value: string[]) => {
      setVisibilityIntent(null);
      setSelectedPrecisions(value);
      track('profit_precision_selected', { precision: value.join(',') });
    },
    [setSelectedPrecisions],
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
      const visibleLegendKeys = availableHwKeys.filter((key) => visibleHwKeys.has(key));
      const allVisible = visibleLegendKeys.length === availableHwKeys.length;
      const isVisible = visibleHwKeys.has(hwKey);
      let next: Set<string>;
      if (isVisible && allVisible) {
        next = new Set([hwKey]);
      } else if (isVisible && visibleLegendKeys.length === 1) {
        next = new Set(availableHwKeys);
      } else {
        next = new Set(visibleHwKeys);
        if (isVisible) next.delete(hwKey);
        else next.add(hwKey);
      }
      setVisibilityIntent({
        scopeKey: selectionKey,
        visible: next,
        known: new Set(availableHwKeys),
      });
      track('profit_gpu_toggled', { gpu: hwKey });
    },
    [availableHwKeys, visibleHwKeys, selectionKey],
  );

  const handleResetGpus = useCallback(() => {
    setVisibilityIntent({
      scopeKey: selectionKey,
      visible: new Set(availableHwKeys),
      known: new Set(availableHwKeys),
    });
    track('profit_gpu_reset', { gpuCount: availableHwKeys.length });
  }, [availableHwKeys, selectionKey]);

  const legendItems = useMemo(
    () =>
      Object.entries(hardwareConfig)
        .filter(([key]) => availableHwKeys.includes(key))
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
    [hardwareConfig, availableHwKeys, visibleHwKeys, resolveColor, toggleGpuVisibility],
  );

  const pricingNotice = useMemo(() => {
    if (priceSource !== 'openrouter') return null;
    if (openRouterQuery.isPending) return t.pricingLoading;
    if (!openRouterQuery.data) return t.pricingUnavailable(openRouterModelId);
    return null;
  }, [priceSource, openRouterQuery.isPending, openRouterQuery.data, openRouterModelId, t]);

  const segmentKey = useMemo(() => {
    // Swatches are drawn in the neutral foreground colour: on the chart each
    // segment takes its SKU's colour, so the key describes texture, not hue.
    const ink = 'var(--foreground)';
    const hasLoss = estimate.rows.some((row) => row.profit < 0);
    const items: { key: string; label: string; style: React.CSSProperties }[] = [
      { key: 'tco', label: t.segmentKey.tco, style: { background: 'var(--muted)' } },
      {
        key: 'labCut',
        label: t.segmentKey.labCut,
        style: { background: ink, opacity: 0.45, boxShadow: `inset 0 0 0 1px ${ink}` },
      },
      { key: 'profit', label: t.segmentKey.profit, style: { background: ink } },
    ];
    if (hasLoss) {
      items.push({
        key: 'loss',
        label: t.segmentKey.loss,
        style: {
          backgroundImage: `repeating-linear-gradient(45deg, ${ink} 0 1.5px, transparent 1.5px 4px)`,
          boxShadow: `inset 0 0 0 1px ${ink}`,
        },
      });
    }
    return (
      <ul
        className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        data-testid="profit-segment-key"
      >
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[2px]" style={item.style} aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>
    );
  }, [estimate.rows, t]);

  const caption = useMemo(() => {
    if (!pricing) return null;
    const sourceLabel =
      pricing.source === 'openrouter'
        ? `OpenRouter · ${pricing.openRouterModelId ?? ''}`.trim()
        : locale === 'zh'
          ? '自定义'
          : 'custom';
    const cached = pricing.cachedInputPerMillion ?? pricing.inputPerMillion * 0.1;
    const skippedText =
      estimate.skipped.length > 0
        ? t.skipped(
            estimate.skipped
              .map((s) => {
                const config = hardwareConfig[s.hwKey];
                const name = config ? getDisplayLabel(config) : s.hwKey;
                return `${s.precision ? `${name} (${s.precision.toUpperCase()})` : name} — ${t.skipReason[s.reason]}`;
              })
              .join('; '),
          )
        : null;
    return (
      <div
        className="flex flex-col gap-1 text-xs text-muted-foreground"
        data-testid="profit-caption"
      >
        {segmentKey}
        <span>
          {t.captionPrices(
            formatTokenPrice(pricing.inputPerMillion),
            formatTokenPrice(cached),
            formatTokenPrice(pricing.outputPerMillion),
            sourceLabel,
          )}
        </span>
        <span>{t.captionFormula(assumptions.utilizationPct, assumptions.labCutPct)}</span>
        {skippedText && <span data-testid="profit-skipped">{skippedText}</span>}
      </div>
    );
  }, [pricing, locale, estimate.skipped, hardwareConfig, t, assumptions, segmentKey]);

  const summary = useMemo(() => {
    if (estimate.rows.length === 0) return null;
    const best = estimate.rows.toSorted((a, b) => b.profit - a.profit)[0];
    return { label: rowLabel(best, hardwareConfig), profit: best.profit };
  }, [estimate.rows, hardwareConfig]);

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
            <DashboardSectionHeader
              title={t.title}
              description={t.description}
              actions={<ChartShareActions />}
            />

            <TooltipProvider delayDuration={0}>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                  isAgenticSequence && featureGateUnlocked ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
                }`}
              >
                <ModelSelector
                  id="profit-model"
                  data-testid="profit-model-selector"
                  value={selectedModel}
                  onChange={handleModelChange}
                  open={openDropdown === 'model'}
                  onOpenChange={handleDropdownOpenChange('model')}
                  availableModels={availableModels}
                />
                <ScenarioSelector
                  id="profit-sequence"
                  data-testid="profit-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  open={openDropdown === 'sequence'}
                  onOpenChange={handleDropdownOpenChange('sequence')}
                  availableSequences={availableSequences}
                  model={selectedModel}
                />
                {isAgenticSequence && featureGateUnlocked && (
                  <PercentileSelector
                    id="profit-percentile"
                    data-testid="profit-percentile-selector"
                    value={selectedPercentile}
                    onChange={handlePercentileChange}
                  />
                )}
                <PrecisionSelector
                  id="profit-precision"
                  data-testid="profit-precision-selector"
                  value={selectedPrecisions}
                  onChange={handlePrecisionChange}
                  open={openDropdown === 'precision'}
                  onOpenChange={handleDropdownOpenChange('precision')}
                  availablePrecisions={availablePrecisions}
                />

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
                        setCostProvider(next as CostProvider);
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={1}
                    value={labCut.raw}
                    onChange={(e) => labCut.onChange(e.target.value)}
                    onBlur={labCut.onBlur}
                  />
                </div>
                {priceSource === 'custom' && (
                  <>
                    <div className="flex flex-col space-y-1.5">
                      <Label htmlFor="profit-input-price">{t.inputPriceLabel}</Label>
                      <Input
                        id="profit-input-price"
                        data-testid="profit-input-price"
                        type="number"
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
                      <Label htmlFor="profit-output-price">{t.outputPriceLabel}</Label>
                      <Input
                        id="profit-output-price"
                        data-testid="profit-output-price"
                        type="number"
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
                  </>
                )}
              </div>

              {!loading && hasData && (
                <div className="space-y-2">
                  <LabelWithTooltip
                    htmlFor="profit-target"
                    label={
                      isAgenticSequence ? t.targetAgenticLabel(percentileLabel) : t.targetLabel
                    }
                    tooltip={
                      isAgenticSequence ? t.targetAgenticTooltip(percentileLabel) : t.targetTooltip
                    }
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input
                        id="profit-target"
                        type="range"
                        min={currentRange.min}
                        max={currentRange.max}
                        step={1}
                        value={targetValue}
                        onChange={handleSliderChange}
                        onPointerUp={() =>
                          track('profit_target_slider_set', { mode, value: targetValue })
                        }
                        className={SLIDER_CLASS}
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
                      data-testid="profit-target-input"
                      aria-label={
                        isAgenticSequence ? t.targetAgenticLabel(percentileLabel) : t.targetLabel
                      }
                      value={resolveCalculatorTargetInputValue(
                        inputValue,
                        targetValue,
                        isTargetInputFocused,
                      )}
                      onFocus={handleInputFocus}
                      onChange={handleInputChange}
                      onBlur={handleInputBlur}
                      className="w-24"
                      min={0}
                    />
                  </div>
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
                {visibleHwKeys.size < availableHwKeys.length && (
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
                <div className="flex items-center gap-2">
                  <Switch
                    id="profit-high-contrast"
                    data-testid="profit-high-contrast"
                    checked={highContrast}
                    onCheckedChange={(checked: boolean) => {
                      setHighContrast(checked);
                      track('profit_high_contrast_toggled', { enabled: checked });
                    }}
                  />
                  <Label
                    htmlFor="profit-high-contrast"
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {t.highContrast}
                  </Label>
                </div>
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
          {summary && (
            <p className="mb-2 text-sm text-muted-foreground" data-testid="profit-summary">
              {locale === 'zh'
                ? `运营方利润最高：${summary.label}，${formatUsdCompact(summary.profit)}/GW/yr`
                : `Highest operator profit: ${summary.label} at ${formatUsdCompact(summary.profit)}/GW/yr`}
            </p>
          )}
          {pricing ? (
            <div>
              <ProfitEstimatorChart
                rows={estimate.rows}
                hardwareConfig={hardwareConfig}
                colorResolver={resolveColor}
                assumptions={assumptions}
                caption={caption}
              />
            </div>
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

'use client';

import { TcoBasisToggle, useShowsTcoBasisSelector } from '@/components/ui/tco-basis-toggle';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DISPLAY_MODEL_TO_DB, HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { Info, Plus, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ProfitEstimatorChart from '@/components/calculator/ProfitEstimatorChart';
import {
  resolveCalculatorVisibility,
  type CalculatorVisibilityIntent,
} from '@/components/calculator/ThroughputCalculatorDisplay';
import { profitTargetUrlValue } from '@/components/calculator/url-seed';
import { CalculatorUrlSeedBoundary } from '@/components/calculator/url-seed-boundary';
import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/providers/GlobalFilterContext';
import {
  cachedInputPricePerMillion,
  formatTokenPrice,
  formatTokenPriceLabel,
} from '@/components/inference/token-revenue';
import { COST_TIER_LABELS, type CostTier } from '@/components/inference/metric-registry';
import type { TokenRevenuePricing } from '@/components/inference/types';
import ComparisonChangelog from '@/components/inference/ui/ComparisonChangelog';
import {
  isRunComparisonEntry,
  makeRunComparisonEntry,
} from '@/components/inference/utils/comparisonEntry';
import { dataRunsForDate } from '@/components/inference/utils/runEnumeration';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartShareActions, PricesSourceLink } from '@/components/ui/chart-display-helpers';
import { ModelSelector } from '@/components/ui/chart-selectors';
import { ControlPanel } from '@/components/ui/control-panel';
import { MobileControlSection } from '@/components/ui/mobile-control-section';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { TcoPriceTable } from '@/components/ui/editable-tco-badges';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Heading, HeadingQualifier } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ModelLogo } from '@/components/ui/model-logo';
import { MultiSelect } from '@/components/ui/multi-select';
import { InfoHelp } from '@/components/ui/option-info';
import { lockedCostProviderOptions, useLockedTierDialog } from '@/components/ui/tco-model-dialog';
import { CaptionPercentInput } from '@/components/ui/caption-percent-input';
import { ResultContext, sourceLinkClassName } from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ALL_IN_MEASURED_NOTE, POWER_BASIS_LABELS } from '@/lib/power/power-basis';
import { AIR_COOLED_SYSTEM_PUE, LIQUID_COOLED_RACK_PUE } from '@/lib/power/facility-pue';
import { useComparisonChangelogs } from '@/hooks/api/use-comparison-changelogs';
import { useOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import { useHeldHeight } from '@/hooks/useHeldHeight';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics/analytics';
import { selectionAnalyticsContext } from '@/lib/analytics/selection-context';
import { getGpuSpecs, getHardwareConfig, getModelSortIndex } from '@/lib/catalog/constants';
import { exportToCsv } from '@/lib/export/csv-export';
import {
  getModelLabel,
  getOpenRouterModelId,
  getSequenceLabel,
  Percentile,
  Sequence,
  type Model,
} from '@/lib/catalog/data-mappings';
import { modelRoutesForTab } from '@/lib/routing/model-routes';
import { profitRouteForTab, type ProfitRouteTab } from '@/lib/routing/profit-estimator-routes';
import { rememberChartStateInUrl } from '@/lib/routing/url-state';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn, getDisplayLabel } from '@/lib/shared/utils';

import {
  applyCacheHitMode,
  clampPercent,
  DEFAULT_CACHE_HIT_MODE,
  DEFAULT_UTILIZATION_PCT,
  listPricingToTokenRevenuePricing,
  modelsWithAgenticData,
  parseTokenPriceInput,
  profitModelDefaults,
  type CacheHitMode,
  type ProfitBasis,
  type ProfitEstimatorRow,
} from './profit-estimator';
import { powerBasisLabel, profitEstimatorChartStrings, rowLabel } from './ProfitEstimatorChart';
import { estimateProfitByPower, type ProfitPowerBasis } from './profit-power';
import {
  buildProfitHistoryResults,
  historyFadeShare,
  orderProfitRowsForHistory,
  PROFIT_HISTORY_MAX_GPUS,
  profitHistoryAvailableDates,
  profitHistoryChipOptions,
  profitHistoryCurrentRunIds,
  profitHistoryDateRanks,
  profitHistoryEntryLabel,
  profitHistoryLegendKeys,
  profitHistoryMissing,
  shadeHistoryColor,
} from './profit-history';
import type { CostProvider } from './types';
import { useProfitHistory } from './useProfitHistory';
import { useThroughputData } from './useThroughputData';

type PriceSource = 'openrouter' | 'list' | 'custom';

function defaultPriceSource(model: Model): PriceSource {
  return profitModelDefaults(model).listPricing ? 'list' : 'openrouter';
}

type ProfitCostProvider = CostProvider | 'custom';

const COST_PROVIDER_TIER: Record<ProfitCostProvider, CostTier> = {
  costh: 'hyperscaler',
  costr: 'rental',
  custom: 'custom',
};

const COST_PROVIDER_OPTIONS: { value: ProfitCostProvider; label: string; labelZh: string }[] = [
  ...(['costh', 'costr'] as const).map((value) => ({
    value,
    label: COST_TIER_LABELS[COST_PROVIDER_TIER[value]].option,
    labelZh: COST_TIER_LABELS[COST_PROVIDER_TIER[value]].optionZh,
  })),
  { value: 'custom', label: 'Custom $/GPU/hr', labelZh: '自定义 $/GPU/hr' },
];

function costProviderOptionLabel(provider: ProfitCostProvider, locale: 'en' | 'zh'): string {
  const option = COST_PROVIDER_OPTIONS.find((entry) => entry.value === provider);
  if (!option) return provider;
  return locale === 'zh' ? option.labelZh : option.label;
}

const CUSTOM_COST_SEED: CostProvider = 'costh';

const DEFAULT_COST_PROVIDER: Record<ProfitBasis, CostProvider> = {
  'chip-hour': 'costr',
  'gw-year': 'costh',
};

function baseGpuOf(hwKey: string): string {
  return hwKey.split('_')[0] ?? hwKey;
}

export function parseCustomCostInput(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

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
      'gw-year': 'Revenue & profit estimator per gigawatt',
      'chip-hour': 'Revenue & profit estimator',
    },
    betaQualifier: 'Beta',
    description:
      'Estimated revenue, compute cost, model license fee and operator profit for each chip from measured throughput at a target interactivity, per GPU-hour or per gigawatt-year',
    chartGroup: 'Chart config',
    basisLabel: 'Estimate basis',
    basisTooltip:
      'Per GPU-hour shows what one chip earns and costs in an hour. Per gigawatt counts how many of each chip one gigawatt of all-in utility power runs for a year, so chips with different power draw share one budget.',
    basisOptions: {
      'chip-hour': 'Per GPU-hour',
      'gw-year': 'Per gigawatt (Beta)',
    } satisfies Record<ProfitBasis, string>,
    benchmarkGroup: 'Benchmark config',
    secondaryControls: 'More chart controls',
    changed: 'changed',
    powerLabel: 'Power estimation',
    powerTooltip:
      'All in Measured uses the best power-valid curve at the selected target. Compare both uses that same curve for both bars when available. Pricing, utilization and unit costs stay the same.',
    powerOptions: {
      provisioned: POWER_BASIS_LABELS['utility-provisioned'].en,
      modeled: POWER_BASIS_LABELS['utility-modeled'].en,
      compare: 'Compare both',
    },
    powerBarLabels: {
      provisioned: POWER_BASIS_LABELS['utility-provisioned'].en,
      modeled: POWER_BASIS_LABELS['utility-modeled'].en,
      extrapolated: 'Full-chassis extrapolation',
    },
    powerPreview: `${ALL_IN_MEASURED_NOTE.en} Host power follows the AgentX workload state, including whether KV cache offload is on.`,
    powerDetails: `GPU power is interpolated between the same throughput points. Includes PUE ${AIR_COOLED_SYSTEM_PUE} (air-cooled chassis) or ${LIQUID_COOLED_RACK_PUE} (liquid-cooled NVL72) and 10% headroom. Aggregate multinode hosts use the measured deployment mean. NVL72 trays share one modeled rack equally and use measured Grace-socket power when the run has validated socket telemetry (otherwise modeled Grace power); the two are not interpolated together. Full-chassis extrapolation fills an eight-GPU server with replicas of the measured 1/2/4-GPU workload at the same per-GPU power and throughput; it does not measure a partly idle server.`,
    csvPowerHeaders: ['Power basis', 'Power model revision'],
    pricingGroup: 'Pricing config',
    costProviderLabel: 'Cost provider',
    costProviderTooltip:
      'The TCO tier used for the compute-expense segment: owning at large hyperscaler purchasing volume (e.g. AWS/GCP) or renting on a 3-year commit, in $/GPU/hr from the SemiAnalysis AI Cloud TCO Model. Custom lets you type your own $/GPU/hr per chip. Locked rental terms (on demand through 2 year commit) are published in the TCO model.',
    customCostLabel: (gpu: string) => `${gpu} $/GPU/hr`,
    costProviderPlaceholder: 'Cost provider',
    priceSourceLabel: 'Token price',
    priceSourceTooltip:
      "Where the sale price per million tokens comes from. OpenRouter reads the public catalog price for this model; the lab's list price is its published API rate, offered where third-party hosts undercut it; Custom lets you type your own input and output prices.",
    priceSourcePlaceholder: 'Token price',
    inputPriceLabel: 'Input $/M tok',
    outputPriceLabel: 'Output $/M tok',
    cachedPriceLabel: 'Cached input $/M tok',
    targetAgenticLabel: (percentile: string) => `Target ${percentile} interactivity (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `The ${percentile} interactivity operating point used for agentic workload interpolation.`,
    cacheHitLabel: 'Cache hit rates',
    cacheHitTooltip:
      'Which cache hit rate to use for cached-input pricing. Actual uses the server-measured rate from the benchmark run. Theoretical roofline (default) uses the infinite-cache rate computed from the trace, representing the maximum reuse potential with unbounded cache capacity.',
    cacheHitOptions: {
      actual: 'Actual',
      theoretical: 'Theoretical roofline',
    } satisfies Record<CacheHitMode, string>,
    utilizationLabel: 'Utilization (%)',
    utilizationTooltip:
      'Utilization % factors in the swings & dips of token traffic throughout day & night in addition to efficiency losses of scaling out large scale deployments.',
    labCutLabel: 'Model license fee (%)',
    labCutTooltip:
      'Share of revenue paid to the model lab as a license fee on every token sold. It is owed even when compute alone exceeds revenue, so the operator can show a loss.',
    errorLoading: 'Error loading data. Please try a different selection.',
    utilizationShort: 'Utilization',
    labCutShort: 'License fee',
    highContrast: 'High contrast',
    pricingLoading: 'Loading OpenRouter pricing…',
    pricingUnavailable: (modelId: string | null) =>
      modelId
        ? `OpenRouter has no price for ${modelId}. Switch Token price to Custom to enter one.`
        : 'This model has no OpenRouter listing. Switch Token price to Custom to enter a price.',
    chartTitle: {
      'gw-year': (model: string, workload: string) =>
        `${model} ${workload} revenue & profit estimates per gigawatt per year`,
      'chip-hour': (model: string, workload: string) =>
        `${model} ${workload} revenue & profit estimates per chip per hour`,
    },
    chartQualifier: (percentile: string, target: number) =>
      `at ${percentile} ${target} tok/s/user interactivity`,
    sellingPriceLabel: 'Selling price per million tokens',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `Input: $${input} · Cached input: $${cached} · Output: $${output} (${source})`,
    sourceLabel: 'Source:',
    formulaTitle: {
      'gw-year': 'Revenue per gigawatt formula',
      'chip-hour': 'Revenue per chip-hour formula',
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
    compareHistory: 'Compare history',
    gpuConfig: 'Chip config',
    gpuConfigTooltip: `Select up to ${PROFIT_HISTORY_MAX_GPUS} chip configurations to compare how their estimated revenue and profit have moved over time. Each config is priced again on every compared date (the ends of the date range, plus any date or run added from the Config Changelog below) using the run measured then, so software updates show up as a change in the bar.`,
    gpuConfigPlaceholder: 'Select chip config',
    comparisonDateRange: 'Comparison date range',
    comparisonDateRangeTooltip:
      'Select the start and end dates for the historical comparison. The chart adds a bar for each selected chip config at both dates, next to its bar for the run date shown above. Dates in between can be added one at a time from the Config Changelog.',
    dateRangePlaceholder: 'Select date range',
    historyNote: (dates: string) =>
      `Compare history: lighter bars are the same chip configs priced on ${dates}, using the same target, prices, and TCO tier`,
    historyNoData: (entries: string) => `No estimate at the target on ${entries}`,
    csvDateHeader: 'Run date',
  },
  zh: {
    title: {
      'gw-year': '每吉瓦收入与利润估算器',
      'chip-hour': '收入与利润估算器',
    },
    betaQualifier: 'Beta',
    description:
      '基于目标交互性下的实测吞吐量，按每 GPU 小时或每吉瓦年估算各芯片的收入、算力支出、模型许可费与运营方利润',
    chartGroup: '图表配置',
    basisLabel: '估算口径',
    basisTooltip:
      '每 GPU 小时口径展示单颗芯片一小时的收入与成本。每吉瓦口径按一吉瓦全电源配置功率一年可运行的芯片数量折算，让功耗不同的芯片在同一功率预算下比较。',
    basisOptions: {
      'chip-hour': '每 GPU 小时',
      'gw-year': '每吉瓦（Beta）',
    } satisfies Record<ProfitBasis, string>,
    benchmarkGroup: '基准测试配置',
    secondaryControls: '更多图表设置',
    changed: '项已更改',
    powerLabel: '功耗估算方式',
    powerTooltip:
      '整体实测功耗在选定目标下采用功耗有效的最优曲线。对比两种估算方式时，若实测估算可用，两根柱子采用同一条曲线。价格、利用率和单位成本保持不变。',
    powerOptions: {
      provisioned: POWER_BASIS_LABELS['utility-provisioned'].zh,
      modeled: POWER_BASIS_LABELS['utility-modeled'].zh,
      compare: '对比两种估算方式',
    },
    powerBarLabels: {
      provisioned: POWER_BASIS_LABELS['utility-provisioned'].zh,
      modeled: POWER_BASIS_LABELS['utility-modeled'].zh,
      extrapolated: '整机外推',
    },
    powerPreview: `${ALL_IN_MEASURED_NOTE.zh} 主机功耗按 AgentX 工作负载状态建模，并区分是否启用 KV cache offload。`,
    powerDetails: `GPU 功耗在相同的吞吐量数据点间插值，计入 PUE（风冷机箱为 ${AIR_COOLED_SYSTEM_PUE}，液冷 NVL72 为 ${LIQUID_COOLED_RACK_PUE}）和 10% 功耗余量。聚合多节点按部署平均功耗估算各台服务器。NVL72 tray 平均分摊同一个建模机架的功耗；运行带有已验证的 Grace socket 遥测时使用实测功耗，否则使用 Grace 功耗估算值，两者不会相互插值。整机外推假设八卡服务器部署多个相同的实测单卡、双卡或四卡实例，每卡功耗和吞吐量保持不变；它不代表部分 GPU 闲置时的整机实测功耗。`,
    csvPowerHeaders: ['功耗口径', '功耗模型版本'],
    pricingGroup: '定价配置',
    costProviderLabel: '计价方式',
    costProviderTooltip:
      '算力支出分段采用的 TCO 层级：按超大规模云厂商的大批量采购价格自购（如 AWS/GCP）或 3 年承诺租赁，单位为 $/GPU/hr，来自 SemiAnalysis AI Cloud TCO 模型。选择自定义可为每种芯片输入自己的 $/GPU/hr。带锁的租赁期限（按需至 2 年承诺）收录于 TCO 模型。',
    customCostLabel: (gpu: string) => `${gpu} $/GPU/hr`,
    costProviderPlaceholder: '计价方式',
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
    cacheHitLabel: 'Cache 命中率',
    cacheHitTooltip:
      '缓存输入定价所用的 cache 命中率。“实测”使用基准测试运行中服务端实测的命中率。“理论上限”（默认）使用由 trace 计算的无限缓存命中率，代表缓存容量不受限时的最大复用潜力。',
    cacheHitOptions: {
      actual: '实测',
      theoretical: '理论上限',
    } satisfies Record<CacheHitMode, string>,
    utilizationLabel: '利用率 (%)',
    utilizationTooltip:
      '利用率 % 考虑了 token 流量在昼夜间的起伏波动，以及大规模部署横向扩展时的效率损失。',
    labCutLabel: '模型许可费（%）',
    labCutTooltip:
      '每售出一个 token 以许可费形式支付给模型实验室的收入比例。即使算力支出已超过收入也需支付，因此运营方可能亏损。',
    errorLoading: '加载数据出错，请尝试其他选择。',
    utilizationShort: '利用率',
    labCutShort: '许可费',
    highContrast: '高对比度',
    pricingLoading: '正在加载 OpenRouter 价格…',
    pricingUnavailable: (modelId: string | null) =>
      modelId
        ? `OpenRouter 没有 ${modelId} 的价格。请将 Token 售价切换为自定义并输入价格。`
        : '该模型没有 OpenRouter 条目。请将 Token 售价切换为自定义并输入价格。',
    chartTitle: {
      'gw-year': (model: string, workload: string) =>
        `${model} ${workload} 每吉瓦每年收入与利润估算`,
      'chip-hour': (model: string, workload: string) =>
        `${model} ${workload} 每芯片每小时收入与利润估算`,
    },
    chartQualifier: (percentile: string, target: number) =>
      `（${percentile} 交互性 ${target} tok/s/user）`,
    sellingPriceLabel: '每百万 token 售价',
    sellingPrices: (input: string, cached: string, output: string, source: string) =>
      `输入：$${input} · 缓存输入：$${cached} · 输出：$${output}（${source}）`,
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
    compareHistory: '对比历史趋势',
    gpuConfig: '芯片配置',
    gpuConfigTooltip: `最多选择 ${PROFIT_HISTORY_MAX_GPUS} 个芯片配置，对比其收入与利润估算随时间的变化。每个配置都会用当日实测的运行结果，在每个对比日期（日期范围的起止两端，以及从下方配置变更日志中添加的日期或运行）重新估价，软件更新带来的差异会直接体现在柱形上。`,
    gpuConfigPlaceholder: '选择芯片配置',
    comparisonDateRange: '对比日期范围',
    comparisonDateRangeTooltip:
      '选择历史对比的起止日期。图表会在上方所示运行日期的柱形旁，为所选芯片配置在这两个日期各增加一根柱形。范围内的其他日期可在配置变更日志中逐个添加。',
    dateRangePlaceholder: '选择日期范围',
    historyNote: (dates: string) =>
      `对比历史趋势：较浅的柱形为同一芯片配置在 ${dates} 的估价，目标、价格与 TCO 层级保持一致`,
    historyNoData: (entries: string) => `${entries} 在目标交互性下无法估算`,
    csvDateHeader: '运行日期',
  },
} as const;

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
          track('profit_formula_toggled', { enabled: !open });
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

function blurOnWheel(event: React.WheelEvent<HTMLInputElement>): void {
  event.currentTarget.blur();
}

export const PROFIT_BASIS_TAB: Record<ProfitBasis, ProfitRouteTab> = {
  'chip-hour': 'profit-estimator',
  'gw-year': 'profit-estimator-per-gigawatt',
};

export default function ProfitEstimatorDisplay({
  routeModel,
  basis,
}: {
  routeModel: Model;
  basis: ProfitBasis;
}) {
  return (
    <CalculatorUrlSeedBoundary routeModel={routeModel}>
      {(urlSeed) => (
        <GlobalFilterProvider
          initialModel={urlSeed.model}
          initialSequence={Sequence.AgenticTraces}
          initialRunDate={urlSeed.runDate}
          initialRunId={urlSeed.runId}
        >
          <ProfitEstimatorInner initialTarget={urlSeed.profitTarget} basis={basis} />
        </GlobalFilterProvider>
      )}
    </CalculatorUrlSeedBoundary>
  );
}

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
  initialTarget,
  basis,
}: {
  initialTarget?: number;
  basis: ProfitBasis;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const chartStrings = profitEstimatorChartStrings(locale);
  const { setUrlParam, getUrlParam } = useUrlState();
  const router = useRouter();
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown();
  const { resolvedTheme } = useTheme();
  const { interceptLocked: interceptLockedTier, dialog: tcoModelDialog } =
    useLockedTierDialog('profit_cost_provider');

  const {
    tcoBasis,
    selectedModel,
    effectiveSequence,
    sequenceResolved,
    effectivePrecisions: selectedPrecisions,
  } = useGlobalFilterSelection();
  const showsTcoBasis = useShowsTcoBasisSelector();
  const { setSelectedModel, setSelectedSequence } = useGlobalFilterActions();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availableModels, availability } = useGlobalFilterAvailability();
  const selectedSequence = Sequence.AgenticTraces;
  const agenticModels = useMemo(() => {
    const allowed = modelRoutesForTab(PROFIT_BASIS_TAB[basis]).map((route) => route.model);
    const withData = modelsWithAgenticData(
      availableModels,
      availability?.lines,
      (m) => DISPLAY_MODEL_TO_DB[m] ?? [m],
    );
    const both = allowed.filter((m) => withData.includes(m));
    return both.length > 0 ? both : allowed;
  }, [availableModels, availability, basis]);
  const modelAllowed = agenticModels.includes(selectedModel);
  useEffect(() => {
    if (!modelAllowed && agenticModels[0]) {
      setSelectedModel(agenticModels[0], { userSelection: false });
    }
  }, [modelAllowed, agenticModels, setSelectedModel]);
  useEffect(() => {
    if (sequenceResolved && effectiveSequence !== Sequence.AgenticTraces) {
      setSelectedSequence(Sequence.AgenticTraces);
    }
  }, [sequenceResolved, effectiveSequence, setSelectedSequence]);
  const mode = 'interactivity_to_throughput' as const;

  const [costProvider, setCostProvider] = useState<ProfitCostProvider>(
    DEFAULT_COST_PROVIDER[basis],
  );
  const [priceSource, setPriceSource] = useState<PriceSource>(() =>
    defaultPriceSource(selectedModel),
  );
  const [customInputPrice, setCustomInputPrice] = useState('1');
  const [customCachedPrice, setCustomCachedPrice] = useState('0.1');
  const [customOutputPrice, setCustomOutputPrice] = useState('1');
  const [targetValue, setTargetValue] = useState<number>(
    () => initialTarget ?? profitModelDefaults(selectedModel).interactivity,
  );
  const [targetRaw, setTargetRaw] = useState<string>(() => String(targetValue));
  useEffect(() => {
    setUrlParam('c_ivtarget', profitTargetUrlValue(selectedModel, targetValue));
  }, [selectedModel, targetValue, setUrlParam]);
  const featureGateUnlocked = useFeatureGate();
  const powerControlsEnabled = basis === 'gw-year' && featureGateUnlocked;
  const [requestedPowerBasis, setPowerBasis] = useState<ProfitPowerBasis>('provisioned');
  const powerBasis = powerControlsEnabled ? requestedPowerBasis : 'provisioned';
  useEffect(() => {
    const value = getUrlParam('c_power');
    setPowerBasis(value === 'modeled' || value === 'compare' ? value : 'provisioned');
  }, [getUrlParam]);
  const [cacheHitMode, setCacheHitMode] = useState<CacheHitMode>(DEFAULT_CACHE_HIT_MODE);
  useEffect(() => {
    const value = getUrlParam('c_chmode');
    setCacheHitMode(value === 'actual' ? 'actual' : DEFAULT_CACHE_HIT_MODE);
  }, [getUrlParam]);
  const isMobile = useIsMobileViewport();
  const utilization = usePercentField(DEFAULT_UTILIZATION_PCT, 'profit_utilization_set');
  const labCut = usePercentField(
    profitModelDefaults(selectedModel).labCutPct,
    'profit_lab_cut_set',
  );
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
  const effectivePriceSource: PriceSource =
    priceSource === 'list' && !listPricing ? 'openrouter' : priceSource;
  const selectedPercentile = Percentile.P90;
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
    tcoBasis,
    basis === 'gw-year' && powerBasis !== 'provisioned',
  );

  const [selectedGPUs, setSelectedGPUs] = useState<string[]>([]);
  const [selectedDateRange, setSelectedDateRange] = useState({ startDate: '', endDate: '' });
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  useEffect(() => {
    const gpus = getUrlParam('i_gpus');
    if (gpus) setSelectedGPUs(gpus.split(',').filter(Boolean).slice(0, PROFIT_HISTORY_MAX_GPUS));
    const startDate = getUrlParam('i_dstart') || '';
    const endDate = getUrlParam('i_dend') || '';
    if (startDate && endDate) setSelectedDateRange({ startDate, endDate });
    const dates = getUrlParam('i_dates');
    if (dates) setSelectedDates(dates.split(',').filter(Boolean));
    setHistoryHydrated(true);
  }, [getUrlParam]);
  useEffect(() => {
    if (historyHydrated) setUrlParam('i_dates', selectedDates.join(','));
  }, [historyHydrated, selectedDates, setUrlParam]);

  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );
  const historyChipOptions = useMemo(
    () => profitHistoryChipOptions(availability, dbModelKeys, selectedPrecisions, selectedModel),
    [availability, dbModelKeys, selectedPrecisions, selectedModel],
  );
  useEffect(() => {
    if (!availability || selectedGPUs.length === 0 || historyChipOptions.length === 0) return;
    const offered = new Set(historyChipOptions.map((o) => o.value));
    const kept = selectedGPUs.filter((hw) => offered.has(hw));
    if (kept.length === selectedGPUs.length) return;
    setSelectedGPUs(kept);
    setUrlParam('i_gpus', kept.join(','));
    if (kept.length === 0) {
      setSelectedDateRange({ startDate: '', endDate: '' });
      setSelectedDates([]);
      setUrlParam('i_dstart', '');
      setUrlParam('i_dend', '');
    }
  }, [availability, historyChipOptions, selectedGPUs, setUrlParam]);
  const historyAvailableDates = useMemo(
    () => profitHistoryAvailableDates(availability, dbModelKeys, selectedPrecisions, selectedGPUs),
    [availability, dbModelKeys, selectedPrecisions, selectedGPUs],
  );
  useEffect(() => {
    if (!historyHydrated || !availability || selectedGPUs.length === 0) return;
    const { startDate, endDate } = selectedDateRange;
    if (!startDate || !endDate) return;
    const available = new Set(historyAvailableDates);
    if (available.has(startDate) && available.has(endDate)) return;
    setSelectedDateRange({ startDate: '', endDate: '' });
    setSelectedDates([]);
    setUrlParam('i_dstart', '');
    setUrlParam('i_dend', '');
  }, [
    historyHydrated,
    availability,
    selectedGPUs.length,
    selectedDateRange,
    historyAvailableDates,
    setUrlParam,
  ]);

  const handleHistoryGpuChange = useCallback(
    (next: string[]) => {
      setSelectedGPUs(next);
      setUrlParam('i_gpus', next.join(','));
      if (next.length === 0) {
        setSelectedDateRange({ startDate: '', endDate: '' });
        setSelectedDates([]);
        setUrlParam('i_dstart', '');
        setUrlParam('i_dend', '');
      }
      track('profit_history_gpu_selected', { gpus: next, count: next.length });
    },
    [setUrlParam],
  );
  const handleHistoryAddDate = useCallback((entry: string) => {
    setSelectedDates((prev) => (prev.includes(entry) ? prev : [...prev, entry]));
  }, []);
  const handleHistoryRemoveDate = useCallback((entry: string) => {
    setSelectedDates((prev) => prev.filter((d) => d !== entry));
  }, []);
  const handleHistoryAddAllDates = useCallback((entries: string[]) => {
    setSelectedDates((prev) => [...new Set([...prev, ...entries])]);
  }, []);
  const handleHistoryDateRangeChange = useCallback(
    (range: { startDate: string; endDate: string }) => {
      setSelectedDateRange(range);
      setUrlParam('i_dstart', range.startDate);
      setUrlParam('i_dend', range.endDate);
      track('profit_history_date_range_changed', {
        start_date: range.startDate,
        end_date: range.endDate,
      });
    },
    [setUrlParam],
  );

  const historyChangelogs = useComparisonChangelogs(
    selectedGPUs,
    selectedDateRange,
    historyAvailableDates,
    'agentic_traces',
  );
  const historyRunScope = useMemo(
    () => ({
      modelDbKeys: dbModelKeys,
      selectedGPUs,
      selectedPrecisions,
      benchmarkType: 'agentic_traces' as const,
    }),
    [dbModelKeys, selectedGPUs, selectedPrecisions],
  );
  const historyCurrentRunIds = useMemo(
    () =>
      profitHistoryCurrentRunIds(historyChangelogs.changelogs, selectedRunDate, historyRunScope),
    [historyChangelogs.changelogs, selectedRunDate, historyRunScope],
  );

  const history = useProfitHistory({
    model: selectedModel,
    sequence: selectedSequence,
    selectedGPUs,
    selectedDates,
    dateRange: selectedDateRange,
    currentRunDate: selectedRunDate,
    currentRunIds: historyCurrentRunIds,
    enabled: hasData,
    includePower: basis === 'gw-year' && powerBasis !== 'provisioned',
  });
  const historyActive = history.comparisonDates.length > 0;
  const historyRunNumbering = useMemo(() => {
    const numbering = new Map<string, number>();
    for (const { date, runConfigs } of historyChangelogs.changelogs) {
      dataRunsForDate(runConfigs, historyRunScope).forEach((run, i) => {
        numbering.set(makeRunComparisonEntry(date, run.runId), i + 1);
      });
    }
    return numbering;
  }, [historyChangelogs.changelogs, historyRunScope]);
  useEffect(() => {
    const runConfigsByDate = new Map(
      historyChangelogs.changelogs.map((c) => [c.date, c.runConfigs] as const),
    );
    setSelectedDates((prev) => {
      let changed = false;
      const out: string[] = [];
      for (const entry of prev) {
        if (isRunComparisonEntry(entry)) {
          out.push(entry);
          continue;
        }
        const rc = runConfigsByDate.get(entry);
        const runs = rc ? dataRunsForDate(rc, historyRunScope) : [];
        if (runs.length > 1) {
          changed = true;
          for (const run of runs) out.push(makeRunComparisonEntry(entry, run.runId));
        } else {
          out.push(entry);
        }
      }
      return changed ? [...new Set(out)] : prev;
    });
  }, [historyChangelogs.changelogs, historyRunScope]);
  const historyEntryLabel = useCallback(
    (entry: string) => profitHistoryEntryLabel(entry, historyRunNumbering),
    [historyRunNumbering],
  );
  const loading = throughputLoading || history.loading;
  const rootRef = useHeldHeight<HTMLDivElement>(loading);
  const controlsRef = useHeldHeight<HTMLElement>(loading);

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
          next[base] = String(getGpuSpecs(base, tcoBasis)[CUSTOM_COST_SEED]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [customCostBases, tcoBasis]);
  const costPerGpuHourFor = useCallback(
    (hwKey: string): number => {
      const base = baseGpuOf(hwKey);
      if (costProvider === 'custom') return parseCustomCostInput(customCosts[base]) ?? 0;
      return getGpuSpecs(base, tcoBasis)[costProvider];
    },
    [costProvider, customCosts, tcoBasis],
  );
  const interpolationCostProvider: CostProvider =
    costProvider === 'custom' ? CUSTOM_COST_SEED : costProvider;

  const enterCustomCosts = useCallback(() => {
    if (costProvider === 'custom') return;
    const seedFrom = costProvider;
    setCustomCosts((prev) => {
      const next = { ...prev };
      for (const base of customCostBases) {
        next[base] = String(getGpuSpecs(base, tcoBasis)[seedFrom]);
      }
      return next;
    });
    setCostProvider('custom');
  }, [costProvider, customCostBases, tcoBasis]);
  const handleCostProviderChange = useCallback(
    (next: string) => {
      if (interceptLockedTier(next)) return;
      if (next === 'custom') enterCustomCosts();
      else setCostProvider(next as ProfitCostProvider);
      track('profit_cost_provider_changed', { provider: next });
    },
    [interceptLockedTier, enterCustomCosts],
  );
  const handleCustomCostChange = useCallback(
    (base: string, raw: string) => {
      if (costProvider !== 'custom') {
        enterCustomCosts();
        track('profit_cost_provider_changed', { provider: 'custom', via: 'tco_badge' });
      }
      setCustomCosts((prev) => ({ ...prev, [base]: raw }));
    },
    [costProvider, enterCustomCosts],
  );
  const handleCustomCostReset = useCallback(() => {
    setCustomCosts((prev) => {
      const next = { ...prev };
      for (const base of customCostBases) {
        next[base] = String(getGpuSpecs(base, tcoBasis)[CUSTOM_COST_SEED]);
      }
      return next;
    });
    setCostProvider(CUSTOM_COST_SEED);
    track('profit_cost_provider_changed', {
      provider: CUSTOM_COST_SEED,
      via: 'tco_reset',
    });
  }, [customCostBases, tcoBasis]);
  const handleCustomCostCommit = useCallback((base: string, raw: string) => {
    track('profit_custom_cost_set', { gpu: base, value: raw });
  }, []);

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
    () => ({ utilizationPct: utilization.value, labCutPct: labCut.value, basis, powerBasis }),
    [utilization.value, labCut.value, basis, powerBasis],
  );

  const fullEstimate = useMemo(() => {
    if (!hasData || !pricing) return { rows: [], skipped: [] };
    const curvePowerBasis = basis === 'gw-year' ? powerBasis : 'provisioned';
    const current = getResults(
      targetValue,
      mode,
      interpolationCostProvider,
      undefined,
      false,
      curvePowerBasis,
    );
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
            powerBasis: curvePowerBasis,
            currentRunIds: historyCurrentRunIds,
          }),
        ]
      : current;
    const pricedResults = applyCacheHitMode(results, cacheHitMode);
    const estimated = estimateProfitByPower(
      pricedResults,
      (hwKey) => ({
        powerKwPerGpu: getGpuSpecs(hwKey).power,
        costPerGpuHour: costPerGpuHourFor(hwKey),
      }),
      pricing,
      assumptions,
      powerBasis,
      targetValue,
      t.powerBarLabels,
    );
    if (!historyActive) return estimated;
    return {
      ...estimated,
      rows: orderProfitRowsForHistory(estimated.rows).map((row) =>
        row.date ? { ...row, dateLabel: historyEntryLabel(row.date) } : row,
      ),
    };
  }, [
    hasData,
    pricing,
    getResults,
    basis,
    cacheHitMode,
    powerBasis,
    t.powerBarLabels,
    targetValue,
    mode,
    interpolationCostProvider,
    costPerGpuHourFor,
    assumptions,
    historyActive,
    history.rowsByDate,
    historyCurrentRunIds,
    selectedGPUs,
    selectedPrecisions,
    selectedPercentile,
    historyEntryLabel,
  ]);

  const legendHwKeys = useMemo(
    () => profitHistoryLegendKeys(availableHwKeys, fullEstimate.rows, historyActive),
    [fullEstimate.rows, availableHwKeys, historyActive],
  );

  const selectionKey = `${selectedModel}|${selectedSequence}|${[...selectedPrecisions]
    .toSorted()
    .join(',')}|${selectedRunDate}|${[...legendHwKeys].toSorted().join(',')}`;

  const visibleHwKeys = useMemo(
    () => resolveCalculatorVisibility(visibilityIntent, selectionKey, legendHwKeys),
    [visibilityIntent, selectionKey, legendHwKeys],
  );
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const [highContrast, setHighContrast] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const { resolveColor } = useThemeColors({ highContrast, activeKeys: visibleKeysArray });

  const historyRanks = useMemo(
    () => profitHistoryDateRanks(fullEstimate.rows),
    [fullEstimate.rows],
  );
  const colorForRow = useCallback(
    (row: ProfitEstimatorRow) => {
      const base = resolveColor(row.hwKey);
      if (!row.date) return base;
      const theme = isDarkTheme(resolvedTheme) ? 'dark' : 'light';
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

  const handleBasisChange = useCallback(
    (next: ProfitBasis) => {
      if (next === basis) return;
      rememberChartStateInUrl();
      const pathname = profitRouteForTab(window.location.pathname, PROFIT_BASIS_TAB[next]);
      if (pathname === null) return;
      track('profit_basis_changed', { basis: next });
      router.push(`${pathname}${window.location.search}${window.location.hash}`, { scroll: false });
    },
    [basis, router],
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
    track('profit_gpu_reset', { gpu_count: legendHwKeys.length });
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
    if (openRouterModelId === null) return t.pricingUnavailable(null);
    if (openRouterQuery.isLoading) return t.pricingLoading;
    if (!openRouterQuery.data) return t.pricingUnavailable(openRouterModelId);
    return null;
  }, [effectivePriceSource, openRouterQuery.isLoading, openRouterQuery.data, openRouterModelId, t]);

  const costTier = costProviderOptionLabel(costProvider, locale);
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

  const tcoBadges = useMemo(() => {
    const bases = new Set<string>();
    for (const key of legendHwKeys) {
      if (!visibleHwKeys.has(key)) continue;
      const base = key.split('_')[0];
      if (base in HW_REGISTRY) bases.add(base);
    }
    if (costProvider === 'custom') {
      for (const key of availableHwKeys) {
        const base = baseGpuOf(key);
        if (base in HW_REGISTRY && parseCustomCostInput(customCosts[base]) === undefined) {
          bases.add(base);
        }
      }
    }
    return [...bases]
      .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map((base) => ({
        base,
        label: HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase(),
        value:
          costProvider === 'custom' ? (customCosts[base] ?? '') : String(costPerGpuHourFor(base)),
        overridden:
          costProvider === 'custom' &&
          parseCustomCostInput(customCosts[base]) !== getGpuSpecs(base, tcoBasis)[CUSTOM_COST_SEED],
      }));
  }, [
    legendHwKeys,
    visibleHwKeys,
    availableHwKeys,
    costPerGpuHourFor,
    costProvider,
    customCosts,
    tcoBasis,
  ]);

  const costProviderControl = (
    <span className="inline-flex items-center gap-0.5" data-testid="profit-cost-selector">
      <SearchableSelect
        triggerId="profit-cost"
        triggerAriaLabel={t.costProviderLabel}
        value={costProvider}
        onValueChange={handleCostProviderChange}
        placeholder={t.costProviderPlaceholder}
        initialLabel={costTier}
        searchable={false}
        trackPrefix="profit_cost_provider"
        size="sm"
        className="w-auto max-w-full text-xs"
        contentClassName="w-80"
        groups={[
          {
            label: '',
            options: [
              ...COST_PROVIDER_OPTIONS.map((provider) => ({
                value: provider.value,
                label: locale === 'zh' ? provider.labelZh : provider.label,
                testId: `cost-provider-${provider.value}`,
              })),
              ...lockedCostProviderOptions(locale),
            ],
          },
        ]}
      />
      <InfoHelp
        label={t.costProviderLabel}
        value="profit-cost"
        analyticsEvent="selector_help_opened"
        align="start"
      >
        {t.costProviderTooltip}
      </InfoHelp>
    </span>
  );

  const utilizationControl = (
    <span className="inline-flex items-center gap-1" data-testid="profit-utilization-control">
      <label htmlFor="profit-utilization" className="font-medium text-foreground">
        {t.utilizationShort}
      </label>
      <CaptionPercentInput
        id="profit-utilization"
        testId="profit-utilization-input"
        ariaLabel={t.utilizationLabel}
        value={utilization.raw}
        onChange={utilization.onChange}
        onBlur={utilization.onBlur}
      />
      <InfoHelp
        label={t.utilizationLabel}
        value="profit-utilization"
        analyticsEvent="selector_help_opened"
        align="start"
      >
        {t.utilizationTooltip}
      </InfoHelp>
    </span>
  );
  const labCutControl = (
    <span className="inline-flex items-center gap-1" data-testid="profit-lab-cut-control">
      <label htmlFor="profit-lab-cut" className="font-medium text-foreground">
        {t.labCutShort}
      </label>
      <CaptionPercentInput
        id="profit-lab-cut"
        testId="profit-lab-cut-input"
        ariaLabel={t.labCutLabel}
        value={labCut.raw}
        onChange={labCut.onChange}
        onBlur={labCut.onBlur}
      />
      <InfoHelp
        label={t.labCutLabel}
        value="profit-lab-cut"
        analyticsEvent="selector_help_opened"
        align="start"
      >
        {t.labCutTooltip}
      </InfoHelp>
    </span>
  );

  const historyMissing = useMemo(() => {
    if (!historyActive) return [];
    return profitHistoryMissing(
      fullEstimate.rows,
      history.comparisonDates,
      selectedGPUs,
      (hwKey) => {
        const config = hardwareConfig[hwKey] || getHardwareConfig(hwKey);
        return config ? getDisplayLabel(config) : hwKey;
      },
      historyEntryLabel,
      selectedRunDate,
      historyCurrentRunIds,
    );
  }, [
    historyActive,
    fullEstimate.rows,
    history.comparisonDates,
    selectedGPUs,
    hardwareConfig,
    historyEntryLabel,
    selectedRunDate,
    historyCurrentRunIds,
  ]);

  const caption = useMemo(() => {
    if (!pricing) return null;
    return (
      <div className="mb-2 md:pr-12" data-testid="profit-caption">
        <Heading as="h2" level="card">
          <ModelLogo model={selectedModel} className="mr-2 size-6 align-[-0.3em]" />
          {t.chartTitle[basis](
            getModelLabel(selectedModel),
            getSequenceLabel(Sequence.AgenticTraces, locale),
          )}
          <HeadingQualifier>{t.chartQualifier(percentileLabel, targetValue)}</HeadingQualifier>
        </Heading>
        {powerControlsEnabled && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="profit-power-note">
            {t.powerLabel}: {t.powerOptions[powerBasis]}
          </p>
        )}
        {historyActive && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="profit-history-note">
            {t.historyNote(
              history.comparisonDates.map(historyEntryLabel).join(locale === 'zh' ? '、' : ', '),
            )}
            {historyMissing.length > 0 && <> · {t.historyNoData(historyMissing.join(', '))}</>}
          </p>
        )}
      </div>
    );
  }, [
    pricing,
    powerBasis,
    powerControlsEnabled,
    selectedModel,
    locale,
    percentileLabel,
    targetValue,
    basis,
    t,
    historyActive,
    history.comparisonDates,
    historyEntryLabel,
    historyMissing,
  ]);

  const footer = pricing ? (
    <div className="mt-3" data-testid="profit-footer">
      <ResultContext
        locale={locale}
        layout="footer"
        costTier={costTier}
        costTierControl={costProviderControl}
        utilization={`${assumptions.utilizationPct}%`}
        utilizationControl={utilizationControl}
        utilizationControlId="profit-utilization"
        licenseFee={`${assumptions.labCutPct}%`}
        licenseFeeControl={labCutControl}
        licenseFeeControlId="profit-lab-cut"
        controlsEnd={
          tcoBadges.length > 0 ? (
            <TcoPriceTable
              items={tcoBadges}
              editable
              onChange={handleCustomCostChange}
              onCommit={handleCustomCostCommit}
              inputLabel={t.customCostLabel}
              onReset={
                tcoBadges.some((item) => item.overridden) ? handleCustomCostReset : undefined
              }
              resetTestId="profit-tco-reset"
              testId="profit-tco-badges"
              cellTestId="profit-tco-badge"
              inputIdPrefix="profit-custom-cost"
            />
          ) : undefined
        }
        date={selectedRunDate}
        source="SemiAnalysis InferenceX™"
        metaEnd={costProvider === 'custom' ? undefined : <PricesSourceLink />}
      />
      <p className="mb-2 text-xs text-muted-foreground" data-testid="profit-selling-prices">
        <span className="font-medium text-foreground">{t.sellingPriceLabel}:</span>{' '}
        {t.sellingPrices(
          formatTokenPriceLabel(pricing.inputPerMillion),
          formatTokenPriceLabel(cachedInputPricePerMillion(pricing)),
          formatTokenPriceLabel(pricing.outputPerMillion),
          priceSourceLabel,
        )}
        {effectivePriceSource === 'list' && listPricing && (
          <>
            {' '}
            <Link
              target="_blank"
              className={sourceLinkClassName}
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
  ) : null;

  const exportFileName =
    basis === 'gw-year'
      ? `InferenceX_profit_estimator_per_gigawatt_${selectedModel}`
      : `InferenceX_profit_estimator_${selectedModel}`;

  const handleExportCsv = useCallback(() => {
    const usd = (value: number) => (basis === 'gw-year' ? Math.round(value) : value.toFixed(4));
    const includeBasis = powerControlsEnabled && powerBasis !== 'provisioned';
    const basisColumns = (row: ProfitEstimatorRow) => {
      const source = row.powerSource;
      if (!source) return [t.powerBarLabels.provisioned, ''];
      return [powerBasisLabel(source, locale), source.modelRevision];
    };
    const rows = estimate.rows.map((row) => [
      rowLabel({ ...row, date: undefined }, hardwareConfig),
      row.precision?.toUpperCase() ?? '',
      row.dateLabel ?? row.date ?? selectedRunDate ?? '',
      usd(row.revenue),
      usd(row.tco),
      usd(row.grossMargin),
      usd(row.labCut),
      usd(row.profit),
      row.revenue > 0 ? (row.profit / row.revenue).toFixed(4) : '',
      row.revenuePerGpuHour.toFixed(4),
      ...(basis === 'gw-year' ? [Math.round(row.gpuHours)] : []),
      ...(includeBasis ? basisColumns(row) : []),
    ]);
    const [sku, precision, ...rest] = t.csvHeaders[basis];
    const headers = [
      sku,
      precision,
      t.csvDateHeader,
      ...rest,
      ...(includeBasis ? t.csvPowerHeaders : []),
    ];
    exportToCsv(exportFileName, headers, rows, [
      t.captionFormula[basis](assumptions.utilizationPct, assumptions.labCutPct),
      `${t.cacheHitLabel}: ${t.cacheHitOptions[cacheHitMode]}`,
      ...(powerControlsEnabled
        ? [
            `${t.powerLabel}: ${t.powerOptions[powerBasis]}`,
            ...(powerBasis === 'provisioned' ? [] : [t.powerPreview, t.powerDetails]),
          ]
        : []),
    ]);
  }, [
    estimate.rows,
    hardwareConfig,
    exportFileName,
    t,
    locale,
    assumptions,
    basis,
    selectedRunDate,
    cacheHitMode,
    powerBasis,
    powerControlsEnabled,
  ]);

  if (!loading && error) {
    console.error(error);
    return <EmptyState className="h-64">{t.errorLoading}</EmptyState>;
  }

  const secondaryCount =
    (cacheHitMode === DEFAULT_CACHE_HIT_MODE ? 0 : 1) +
    (powerBasis === 'provisioned' ? 0 : 1) +
    (priceSource === defaultPriceSource(selectedModel) ? 0 : 1) +
    (selectedGPUs.length > 0 ? 1 : 0) +
    (selectedDateRange.startDate && selectedDateRange.endDate ? 1 : 0);

  const benchmarkExtras = (
    <>
      <div className="flex min-w-0 flex-col space-y-1.5">
        <LabelWithTooltip
          htmlFor="profit-cache-hit"
          label={t.cacheHitLabel}
          tooltip={t.cacheHitTooltip}
        />
        <div data-testid="profit-cache-hit-selector">
          <MultiSelect
            triggerId="profit-cache-hit"
            options={Object.entries(t.cacheHitOptions).map(([value, label]) => ({
              value,
              label,
            }))}
            value={[cacheHitMode]}
            onChange={(values) => {
              const next = values[0];
              if (next !== 'actual' && next !== 'theoretical') return;
              setCacheHitMode(next);
              setUrlParam('c_chmode', next === DEFAULT_CACHE_HIT_MODE ? '' : next);
              track('profit_cache_hit_mode_changed', { mode: next });
            }}
            open={openDropdown === 'cacheHit'}
            onOpenChange={handleDropdownOpenChange('cacheHit')}
            minSelections={1}
            maxSelections={1}
            showClearAll={false}
            searchable={false}
            plainSelectedText
            showSelectionSummary={false}
          />
        </div>
      </div>
      {powerControlsEnabled && (
        <div className="flex min-w-0 flex-col space-y-1.5">
          <LabelWithTooltip
            htmlFor="profit-power"
            label={t.powerLabel}
            tooltip={`${t.powerTooltip} ${t.powerPreview} ${t.powerDetails}`}
          />
          <div data-testid="profit-power-selector">
            <MultiSelect
              triggerId="profit-power"
              options={Object.entries(t.powerOptions).map(([value, label]) => ({
                value,
                label,
              }))}
              value={[powerBasis]}
              onChange={(values) => {
                const next = values[0];
                if (next !== 'provisioned' && next !== 'modeled' && next !== 'compare') return;
                setPowerBasis(next);
                setUrlParam('c_power', next === 'provisioned' ? '' : next);
                track('profit_power_basis_changed', { basis: next });
              }}
              open={openDropdown === 'power'}
              onOpenChange={handleDropdownOpenChange('power')}
              minSelections={1}
              maxSelections={1}
              showClearAll={false}
              searchable={false}
              plainSelectedText
              showSelectionSummary={false}
            />
          </div>
        </div>
      )}
    </>
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <section ref={controlsRef} data-testid="profit-controls">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader
              title={t.title[basis]}
              qualifier={t.betaQualifier}
              description={t.description}
              actions={<ChartShareActions />}
            />

            <TooltipProvider delayDuration={0}>
              <div className="grid min-w-0 items-start gap-x-6 gap-y-4 xl:grid-cols-12">
                <ControlPanel
                  legend={t.benchmarkGroup}
                  data-testid="profit-benchmark-panel"
                  className={cn(
                    'grid-cols-1 items-end md:grid-cols-3',
                    // Four benchmark columns fit only on a full row; beside the pricing panel a
                    // fourth column wraps the target label to three lines and the rows misalign.
                    powerControlsEnabled && effectivePriceSource === 'custom' && 'xl:grid-cols-4',
                    effectivePriceSource === 'custom' ? 'xl:col-span-12' : 'xl:col-span-8',
                  )}
                >
                  <div className="min-w-0">
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
                  <div className="flex min-w-0 flex-col space-y-1.5">
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
                  {!isMobile && <div className="hidden md:contents">{benchmarkExtras}</div>}
                </ControlPanel>
                <MobileControlSection
                  label={t.secondaryControls}
                  count={secondaryCount}
                  countLabel={t.changed}
                  testId="profit-secondary-controls"
                >
                  {isMobile && (
                    <div className="grid min-w-0 gap-3 md:hidden">{benchmarkExtras}</div>
                  )}
                  <ControlPanel
                    legend={t.pricingGroup}
                    data-testid="profit-pricing-panel"
                    className={cn(
                      'grid-cols-1 items-end',
                      effectivePriceSource === 'custom'
                        ? 'xl:col-span-12 xl:grid-cols-4'
                        : cn('xl:col-span-4', showsTcoBasis && 'sm:grid-cols-2'),
                    )}
                  >
                    <div className="flex min-w-0 flex-col space-y-1.5">
                      <LabelWithTooltip
                        htmlFor="profit-price-source"
                        label={t.priceSourceLabel}
                        tooltip={t.priceSourceTooltip}
                      />
                      <div data-testid="profit-price-source-selector">
                        <MultiSelect
                          triggerId="profit-price-source"
                          options={priceSourceOptions(listPricing?.vendor ?? null).map(
                            (option) => ({
                              value: option.value,
                              label: locale === 'zh' ? option.labelZh : option.label,
                            }),
                          )}
                          value={[effectivePriceSource]}
                          onChange={(values) => {
                            const next = values[0];
                            if (!next) return;
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
                    {effectivePriceSource === 'custom' && (
                      <div
                        data-testid="profit-custom-prices"
                        className="grid min-w-0 items-end gap-4 md:grid-cols-3 xl:col-span-3"
                      >
                        <div className="flex min-w-0 flex-col space-y-1.5">
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
                        <div className="flex min-w-0 flex-col space-y-1.5">
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
                        <div className="flex min-w-0 flex-col space-y-1.5">
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

                    {showsTcoBasis && (
                      <div className="flex min-w-0 max-w-48 flex-col space-y-1.5">
                        <LabelWithTooltip
                          label={locale === 'zh' ? 'TCO 口径' : 'TCO basis'}
                          tooltip={
                            locale === 'zh'
                              ? '外部客户价格或内部持有成本；目前仅影响 TPUv7。'
                              : 'External customer pricing or internal owner cost; currently affects only TPUv7.'
                          }
                        />
                        <TcoBasisToggle source="profit" className="md:h-9" />
                      </div>
                    )}
                  </ControlPanel>
                  <div className="grid min-w-0 items-start gap-x-6 gap-y-4 xl:col-span-12 xl:grid-cols-12">
                    <ControlPanel
                      legend={t.chartGroup}
                      data-testid="profit-chart-panel"
                      className="xl:col-span-8"
                    >
                      <div className="flex min-w-0 flex-col space-y-1.5">
                        <LabelWithTooltip label={t.basisLabel} tooltip={t.basisTooltip} />
                        <SegmentedToggle<ProfitBasis>
                          role="group"
                          value={basis}
                          options={(['chip-hour', 'gw-year'] as const).map((value) => ({
                            value,
                            label: t.basisOptions[value],
                            testId: `profit-basis-${value}`,
                          }))}
                          onValueChange={handleBasisChange}
                          ariaLabel={t.basisLabel}
                          testId="profit-basis-toggle"
                          className="w-fit self-start md:h-9"
                        />
                      </div>
                    </ControlPanel>
                    <ControlPanel
                      legend={t.compareHistory}
                      data-testid="profit-history-panel"
                      className="xl:col-span-4"
                    >
                      <div
                        className={cn(
                          'grid min-w-0 gap-3',
                          selectedGPUs.length > 0 && 'md:grid-cols-2 xl:grid-cols-1',
                        )}
                      >
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
                  </div>
                </MobileControlSection>
              </div>
            </TooltipProvider>

            {selectedGPUs.length > 0 && (
              <div data-testid="profit-history-changelog">
                <ComparisonChangelog
                  changelogs={historyChangelogs.changelogs}
                  selectedGPUs={selectedGPUs}
                  selectedPrecisions={selectedPrecisions}
                  modelDbKeys={dbModelKeys}
                  selectedSequence={selectedSequence}
                  loading={historyChangelogs.loading}
                  totalDatesQueried={historyChangelogs.totalDatesQueried}
                  selectedDates={selectedDates}
                  selectedDateRange={selectedDateRange}
                  onAddDate={handleHistoryAddDate}
                  onRemoveDate={handleHistoryRemoveDate}
                  onAddAllDates={handleHistoryAddAllDates}
                  firstAvailableDate={historyAvailableDates[0]}
                  analyticsSection="profit"
                />
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
              className="mb-3 rounded-md border border-border/30 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              data-testid="profit-pricing-notice"
            >
              {pricingNotice}
            </div>
          )}
          {pricing ? (
            <figure data-testid="profit-figure" className="relative min-w-0">
              <ChartButtons
                chartId="profit-estimator-chart"
                analyticsPrefix="profit_estimator"
                analyticsContext={selectionAnalyticsContext({
                  model: selectedModel,
                  sequence: selectedSequence,
                  precisions: selectedPrecisions,
                  gpuCount: selectedGPUs.length,
                })}
                className="md:absolute md:top-0 md:right-0 md:z-10 md:mb-0"
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
                footer={footer}
                legendElement={
                  legendItems.length > 0 ? (
                    <div data-testid="profit-legend" className="contents">
                      <ChartLegend
                        variant="sidebar"
                        legendItems={legendItems}
                        isLegendExpanded={isLegendExpanded}
                        onExpandedChange={(expanded) => {
                          setIsLegendExpanded(expanded);
                          track('profit_legend_expanded', { enabled: expanded });
                        }}
                        switches={[
                          {
                            id: 'profit-high-contrast',
                            label: t.highContrast,
                            checked: highContrast,
                            onCheckedChange: (checked: boolean) => {
                              setHighContrast(checked);
                              track('profit_high_contrast_toggled', { enabled: checked });
                            },
                          },
                        ]}
                        reset={{
                          id: 'profit-reset-filter',
                          disabled: visibleHwKeys.size >= legendHwKeys.length,
                          onClick: handleResetGpus,
                        }}
                        enableTooltips={true}
                      />
                    </div>
                  ) : undefined
                }
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
      {tcoModelDialog}
    </div>
  );
}

'use client';

import { useCallback, useMemo, useState } from 'react';

import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

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
import {
  includesJalapenoResult,
  includesTpuv7Result,
  includesVeraRubinResult,
  JalapenoOfficialPreviewNotice,
  Tpuv7OfficialPreviewNotice,
  VeraRubinOfficialPreviewNotice,
} from '@/components/official-preview-notice';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import ChartLegend from '@/components/ui/chart-legend';
import {
  ModelSelector,
  PercentileSelector,
  PrecisionSelector,
  ScenarioSelector,
} from '@/components/ui/chart-selectors';
import { ControlPanel } from '@/components/ui/control-panel';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { TcoBasisToggle, useShowsTcoBasisSelector } from '@/components/ui/tco-basis-toggle';
import { lockedCostProviderOptions, useLockedTierDialog } from '@/components/ui/tco-model-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { getModelSortIndex } from '@/lib/constants';
import { exportToCsv } from '@/lib/csv-export';
import {
  getModelLabel,
  getSequenceLabel,
  Percentile,
  Sequence,
  type Model,
} from '@/lib/data-mappings';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { readUrlParams, writeUrlParams } from '@/lib/url-state';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import {
  DEFAULT_FIRST_TOKEN_CAPS,
  DEFAULT_FIRST_TOKEN_MIN_INTERACTIVITY,
  formatFirstTokenCaps,
  parseFirstTokenCaps,
  selectFirstTokenWinners,
  ZH_MEDIAN,
  zhStatPhrase,
  type FirstTokenCell,
} from './first-token-limits';
import FirstTokenLimitsChart, { configLabel, formatCost } from './FirstTokenLimitsChart';
import { getCostProviderLabel, getCostTypeLabel } from './ThroughputBarChart';
import type { CostProvider, CostType } from './types';
import { useThroughputData } from './useThroughputData';

const COST_PROVIDER_OPTIONS: {
  value: CostProvider;
  label: string;
  labelZh: string;
}[] = [
  {
    value: 'costh',
    label: 'Owning at Large Hyperscaler Volume',
    labelZh: '自有 - 超大规模云大批量',
  },
  { value: 'costr', label: 'Rent - 3 Year Commit', labelZh: '租赁 - 3 年承诺' },
];

const COST_TYPE_OPTIONS: { value: CostType; label: string; labelZh: string }[] = [
  { value: 'total', label: 'Total Tokens', labelZh: '总 Token' },
  { value: 'input', label: 'Input Tokens', labelZh: '输入 Token' },
  { value: 'output', label: 'Output Tokens', labelZh: '输出 Token' },
];

const STRINGS = {
  en: {
    title: 'First-Token Limits',
    description:
      'Which chip wins depends on how long a user may wait for the first token. For each cap on time to first token, this reads the measured configurations that also clear the interactivity floor and keeps the cheapest one per vendor. Measured rows only: no interpolation, and every bar links to the run behind it.',
    benchmarkGroup: 'Benchmark Config',
    chartGroup: 'Chart Config',
    costProviderLabel: 'Cost Provider',
    costProviderTooltip:
      'The pricing tier the bars are costed at. Owning at large hyperscaler purchasing volume (e.g. AWS/GCP) or renting on a 3-year commit. Locked rental terms (on demand through 2 year commit) are published in the SemiAnalysis AI Cloud TCO Model.',
    costProviderPlaceholder: 'Cost provider',
    tokenTypeLabel: 'Token Type',
    tokenTypeTooltip:
      'Whether cost is per million total, input, or output tokens. Disaggregated configs report input and output throughput per prefill and per decode chip, so their input- and output-basis costs are not per chip overall.',
    tokenTypePlaceholder: 'Token type',
    minInteractivityLabel: (stat: string) => `Minimum ${stat} Interactivity (tok/s/user)`,
    minInteractivityTooltip: (stat: string) =>
      `Only rows whose ${stat} interactivity is at or above this floor are eligible. Set it to the streaming speed the workload needs; a cap on first-token wait is then applied on top.`,
    capsLabel: 'TTFT Caps (s, comma-separated)',
    capsTooltip:
      'The ladder of maximum first-token waits to compare, in seconds. Each cap gets its own group of bars. Up to eight values.',
    capsPlaceholder: formatFirstTokenCaps(DEFAULT_FIRST_TOKEN_CAPS),
    highContrast: 'High Contrast',
    errorLoading: 'Error loading data. Please try a different selection.',
    noData:
      'No measured data for the current selection. Try another model, workload, or precision.',
    noneQualify: (min: number, stat: string) =>
      `No measured configuration reaches ${min} tok/s/user ${stat} interactivity for this selection. Lower the floor to compare first-token limits.`,
    noTtft: (stat: string) =>
      `The measured rows for this selection report no ${stat} time to first token, so there is nothing to cap. Try another workload or run date.`,
    captionFloor: (min: number, stat: string) => `≥${min} tok/s/user ${stat} interactivity`,
    captionRows: (qualifying: number, measured: number) =>
      `${qualifying} of ${measured} measured rows clear the floor`,
    captionSource: 'Source: SemiAnalysis InferenceX',
    unofficialRun: 'Unofficial run',
    note: 'Note:',
    methodology: (ttftStat: string, ivStat: string) =>
      ` Cost is $ per million tokens at 100% utilization from the SemiAnalysis AI Cloud TCO Model. The ${ivStat} interactivity floor and the ${ttftStat} time-to-first-token cap are separate percentile statistics on the same row: a row that clears both did so on each measure, which does not mean every individual request did. Bars are measured rows, not interpolated frontier points, so a cheaper configuration can sit just outside a cap and only appear under the next one.`,
    source: 'Source: ',
    colCap: 'TTFT cap (s)',
    colSeries: 'Series',
    colConfig: 'Configuration',
    colPrecision: 'Precision',
    colConcurrency: 'Concurrency',
    colTp: 'TP',
    colTtft: (stat: string) => `${stat} TTFT (s)`,
    colInteractivity: (stat: string) => `${stat} interactivity (tok/s/user)`,
    colCost: (unit: string) => `Cost ($${unit})`,
    colRun: 'Run',
    viewRun: 'View',
  },
  zh: {
    title: '首 token 延迟约束',
    description:
      '哪款芯片最优，取决于用户能接受多长的首 token 等待。本页面按每一档首 token 延迟（TTFT）上限，从同时满足交互性下限的实测配置中，逐厂商选出成本最低的一个。仅使用实测数据，不做插值，每个柱形都可追溯到对应的运行记录。',
    benchmarkGroup: '基准测试配置',
    chartGroup: '图表配置',
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '柱形成本采用的定价层级。按超大规模云厂商大批量采购价自有（如 AWS/GCP）或 3 年承诺租赁。带锁的租赁期限（按需至 2 年承诺）收录于 SemiAnalysis AI Cloud TCO 模型。',
    costProviderPlaceholder: '成本供应商',
    tokenTypeLabel: 'Token 类型',
    tokenTypeTooltip:
      '成本按每百万总 token、输入 token 还是输出 token 计。分离式配置的输入、输出吞吐量分别按 prefill 芯片和 decode 芯片统计，因此其输入、输出口径的成本并非按全部芯片计。',
    tokenTypePlaceholder: 'Token 类型',
    minInteractivityLabel: (stat: string) => `${zhStatPhrase('交互性', stat, '最低')} (tok/s/user)`,
    minInteractivityTooltip: (stat: string) =>
      `${zhStatPhrase('交互性', stat, '仅')}不低于该下限的数据行参与比较。请设为工作负载所需的流式输出速度，再在此基础上施加首 token 延迟上限。`,
    capsLabel: 'TTFT 上限（秒，逗号分隔）',
    capsTooltip:
      '要对比的各档首 token 最长等待时间，单位为秒。每一档上限对应一组柱形，最多 8 个值。',
    capsPlaceholder: formatFirstTokenCaps(DEFAULT_FIRST_TOKEN_CAPS),
    highContrast: '高对比度',
    errorLoading: '加载数据出错，请尝试其他选择。',
    noData: '当前选择没有实测数据。请尝试其他模型、工作负载或精度。',
    noneQualify: (min: number, stat: string) =>
      `${zhStatPhrase('交互性', stat, '当前选择下没有实测配置的')}达到 ${min} tok/s/user。请降低下限后再比较首 token 延迟约束。`,
    noTtft: (stat: string) =>
      `${zhStatPhrase('首 token 延迟', stat, '当前选择的实测数据行未报告')}，无法施加上限。请尝试其他工作负载或运行日期。`,
    captionFloor: (min: number, stat: string) =>
      `${zhStatPhrase('交互性', stat)} ≥${min} tok/s/user`,
    captionRows: (qualifying: number, measured: number) =>
      `${measured} 行实测数据中有 ${qualifying} 行满足下限`,
    captionSource: '来源：SemiAnalysis InferenceX',
    unofficialRun: '非官方运行',
    note: '注：',
    methodology: (ttftStat: string, ivStat: string) =>
      ` 成本为 100% 利用率下的每百万 token 成本，取自 SemiAnalysis AI Cloud TCO 模型。${zhStatPhrase('交互性', ivStat)}下限与${zhStatPhrase('首 token 延迟', ttftStat, '')}上限是同一数据行上两个独立的分位数统计：同时满足两者，表示该行在两项指标上分别达标，不代表每个请求都同时达标。柱形为实测数据行而非插值的前沿点，因此更便宜的配置可能刚好超出某一档上限，只出现在下一档中。`,
    source: '来源：',
    colCap: 'TTFT 上限 (s)',
    colSeries: '系列',
    colConfig: '配置',
    colPrecision: '精度',
    colConcurrency: '并发数',
    colTp: 'TP',
    colTtft: (stat: string) => `${zhStatPhrase('TTFT', stat)} (s)`,
    colInteractivity: (stat: string) => `${zhStatPhrase('交互性', stat)} (tok/s/user)`,
    colCost: (unit: string) => `成本 ($${unit})`,
    colRun: '运行记录',
    viewRun: '查看',
  },
} as const;

const STAT_LABELS = {
  en: { median: 'Median' },
  zh: { median: ZH_MEDIAN },
} as const;

interface FirstTokenRow {
  key: string;
  cap: number;
  series: string;
  config: string;
  precision: string;
  concurrency: number;
  tp: number;
  ttft: number;
  interactivity: number;
  cost: number;
  runUrl: string | null;
}

export default function FirstTokenLimitsDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  return (
    <GlobalFilterProvider
      initialModel={urlSeed?.model}
      initialSequence={urlSeed?.sequence}
      initialPrecisions={urlSeed?.precisions}
      initialRunDate={urlSeed?.runDate}
      initialRunId={urlSeed?.runId}
    >
      <FirstTokenLimitsInner initialPercentile={urlSeed?.percentile ?? Percentile.P90} />
    </GlobalFilterProvider>
  );
}

function FirstTokenLimitsInner({ initialPercentile }: { initialPercentile: Percentile }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { setUrlParam } = useUrlState();
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown();
  const { interceptLocked: interceptLockedTier, dialog: tcoModelDialog } = useLockedTierDialog(
    'first_token_cost_provider',
  );

  const {
    tcoBasis,
    selectedModel,
    effectiveSequence: selectedSequence,
    effectivePrecisions: selectedPrecisions,
  } = useGlobalFilterSelection();
  const showsTcoBasis = useShowsTcoBasisSelector();
  const { setSelectedModel, setSelectedSequence, setSelectedPrecisions } = useGlobalFilterActions();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availablePrecisions, availableSequences, availableModels } =
    useGlobalFilterAvailability();

  const [costProvider, setCostProvider] = useState<CostProvider>('costh');
  const [costType, setCostType] = useState<CostType>('total');
  const [selectedPercentile, setSelectedPercentile] = useState<Percentile>(initialPercentile);
  const [visibilityIntent, setVisibilityIntent] = useState<CalculatorVisibilityIntent | null>(null);
  const [highContrast, setHighContrast] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  // Both inputs are URL-seeded so an article can link the exact figure. Empty
  // means "use the sequence-aware default", which is why the defaults are not
  // written into the URL.
  const [minInteractivityInput, setMinInteractivityInput] = useState<string>(
    () => readUrlParams().c_ivmin ?? '',
  );
  const [capsInput, setCapsInput] = useState<string>(() => readUrlParams().c_ttft ?? '');

  // Unofficial-run overlay (`?unofficialrun=…`): each loaded run gets its own
  // bar per cap, chosen from its own rows only, in the run's palette color.
  const { isUnofficialRun, unofficialBenchmarkRows, unofficialRunInfos, runIndexByUrl } =
    useUnofficialRun();
  const overlayInput = useMemo(
    () => ({ rows: unofficialBenchmarkRows, runIndexByUrl }),
    [unofficialBenchmarkRows, runIndexByUrl],
  );

  const {
    gpuDataByGroupKey,
    gpuGroupMeta,
    overlayGpuDataByGroupKey,
    overlayGroupMeta,
    hardwareConfig,
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
    undefined,
    true,
    costType,
    tcoBasis,
  );

  const isAgenticSequence = selectedSequence === Sequence.AgenticTraces;
  const featureGateUnlocked = useFeatureGate();
  // Agentic rows are read at the selected percentile; fixed sequences at the
  // median, the same split as the inference chart's interactivity and TTFT axes.
  const statLabel = isAgenticSequence
    ? selectedPercentile.toUpperCase()
    : STAT_LABELS[locale].median;

  const defaultMinInteractivity = isAgenticSequence
    ? DEFAULT_FIRST_TOKEN_MIN_INTERACTIVITY.agentic
    : DEFAULT_FIRST_TOKEN_MIN_INTERACTIVITY.fixed;
  const minInteractivity = useMemo(() => {
    const parsed = Number.parseFloat(minInteractivityInput);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultMinInteractivity;
  }, [minInteractivityInput, defaultMinInteractivity]);
  const caps = useMemo(
    () => parseFirstTokenCaps(capsInput) ?? [...DEFAULT_FIRST_TOKEN_CAPS],
    [capsInput],
  );

  // One legend governs a chip's official and overlay bars together; overlay-only
  // hardware is merged in so its bar can be hidden. See docs/tco-calculator.md.
  const legendHwKeys = useMemo(() => {
    if (!isUnofficialRun || overlayAvailableHwKeys.length === 0) return availableHwKeys;
    return [...new Set([...availableHwKeys, ...overlayAvailableHwKeys])];
  }, [isUnofficialRun, availableHwKeys, overlayAvailableHwKeys]);

  const selectionKey = `${selectedModel}|${selectedSequence}|${[...selectedPrecisions]
    .toSorted()
    .join(',')}|${selectedRunDate}|${[...availableHwKeys].toSorted().join(',')}`;

  const visibleHwKeys = useMemo(
    () => resolveCalculatorVisibility(visibilityIntent, selectionKey, legendHwKeys),
    [visibilityIntent, selectionKey, legendHwKeys],
  );
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({ highContrast, activeKeys: visibleKeysArray });

  const runInfoByIndex = useMemo(() => {
    const map: Record<number, { branch: string; url: string }> = {};
    unofficialRunInfos.forEach((info, idx) => {
      map[idx] = { branch: info.branch || `run ${info.id}`, url: info.url };
    });
    return map;
  }, [unofficialRunInfos]);
  const overlayLabels = useMemo(
    () =>
      Object.fromEntries(Object.entries(runInfoByIndex).map(([idx, info]) => [idx, info.branch])),
    [runInfoByIndex],
  );

  const result = useMemo(
    () =>
      selectFirstTokenWinners({
        official: gpuDataByGroupKey,
        officialMeta: gpuGroupMeta,
        overlay: overlayGpuDataByGroupKey,
        overlayMeta: overlayGroupMeta,
        overlayLabels,
        caps,
        minInteractivity,
        costProvider,
        costType,
        visibleHwKeys,
      }),
    [
      gpuDataByGroupKey,
      gpuGroupMeta,
      overlayGpuDataByGroupKey,
      overlayGroupMeta,
      overlayLabels,
      caps,
      minInteractivity,
      costProvider,
      costType,
      visibleHwKeys,
    ],
  );
  const hasAnyData = hasData || hasOverlayData;
  const hasBars = result.cells.some((cell) => cell.winner !== null);

  const handleModelChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedModel(value as Model);
      track('first_token_model_selected', { model: value });
    },
    [setSelectedModel],
  );
  const handleSequenceChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedSequence(value as Sequence);
      track('first_token_sequence_selected', { sequence: value });
    },
    [setSelectedSequence],
  );
  const handlePrecisionChange = useCallback(
    (value: string[]) => {
      setVisibilityIntent(null);
      setSelectedPrecisions(value);
      track('first_token_precision_selected', { precision: value.join(',') });
    },
    [setSelectedPrecisions],
  );
  const handlePercentileChange = useCallback(
    (value: Percentile) => {
      setSelectedPercentile(value);
      setUrlParam('i_pctl', value);
      track('first_token_percentile_selected', { percentile: value });
    },
    [setUrlParam],
  );

  const handleMinInteractivityChange = useCallback((raw: string) => {
    setMinInteractivityInput(raw);
    const parsed = Number.parseFloat(raw);
    writeUrlParams({ c_ivmin: Number.isFinite(parsed) && parsed >= 0 ? raw : '' });
  }, []);
  const handleMinInteractivityBlur = useCallback(() => {
    track('first_token_min_interactivity_set', { value: minInteractivity });
  }, [minInteractivity]);

  const handleCapsChange = useCallback((raw: string) => {
    setCapsInput(raw);
    const parsed = parseFirstTokenCaps(raw);
    writeUrlParams({ c_ttft: parsed ? formatFirstTokenCaps(parsed) : '' });
  }, []);
  const handleCapsBlur = useCallback(() => {
    // Normalize what was typed to the ladder actually in use, so the field and
    // the chart agree; an unusable entry falls back to the default ladder.
    const parsed = parseFirstTokenCaps(capsInput);
    setCapsInput(parsed ? formatFirstTokenCaps(parsed) : '');
    track('first_token_caps_set', { caps: formatFirstTokenCaps(caps) });
  }, [capsInput, caps]);

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
      setVisibilityIntent({ scopeKey: selectionKey, visible: next, known: new Set(legendHwKeys) });
      track('first_token_gpu_toggled', { gpu: hwKey });
    },
    [legendHwKeys, visibleHwKeys, selectionKey],
  );
  const removeGpu = useCallback(
    (hwKey: string) => {
      const next = new Set(visibleHwKeys);
      next.delete(hwKey);
      setVisibilityIntent({ scopeKey: selectionKey, visible: next, known: new Set(legendHwKeys) });
      track('first_token_gpu_removed', { gpu: hwKey });
    },
    [visibleHwKeys, selectionKey, legendHwKeys],
  );

  const legendItems = useMemo(() => {
    const availableSet = new Set(legendHwKeys);
    const runItems = result.series
      .filter((series) => series.runIndex !== undefined)
      .map((series) => {
        const info = unofficialRunInfos[series.runIndex!];
        return {
          name: `✕ unofficial-run-${info?.id ?? series.runIndex}`,
          label: series.label,
          color: overlayRunColor(series.runIndex!),
          title: `${t.unofficialRun}: ${series.label}`,
          hw: `overlay-run-${info?.id ?? series.runIndex}`,
          isActive: true,
          // A label for the run, not a series the legend can hide: per-run
          // removal lives in the unofficial-run banner.
          isRemovable: false,
          onClick: () => {},
        };
      });
    return [
      ...runItems,
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
    result.series,
    unofficialRunInfos,
    hardwareConfig,
    visibleHwKeys,
    resolveColor,
    toggleGpuVisibility,
    t,
  ]);

  const costUnit = getCostTypeLabel(costType);
  const tableRows = useMemo<FirstTokenRow[]>(
    () =>
      result.cells.flatMap((cell: FirstTokenCell) => {
        if (!cell.winner) return [];
        const { winner } = cell;
        const runUrl =
          winner.runIndex === undefined
            ? (winner.point.sourceRow?.run_url ?? null)
            : (runInfoByIndex[winner.runIndex]?.url ?? null);
        return [
          {
            key: `${cell.cap}|${cell.series.key}`,
            cap: cell.cap,
            series: cell.series.label,
            config: configLabel(winner.hwKey, hardwareConfig),
            precision: winner.precision.toUpperCase(),
            concurrency: winner.point.concurrency,
            tp: winner.point.tp,
            ttft: winner.ttft,
            interactivity: winner.interactivity,
            cost: winner.cost,
            runUrl,
          },
        ];
      }),
    [result.cells, hardwareConfig, runInfoByIndex],
  );

  const columns = useMemo<DataTableColumn<FirstTokenRow>[]>(
    () => [
      {
        header: t.colCap,
        cell: (r) => r.cap,
        sortValue: (r) => r.cap,
        align: 'right',
        pinned: true,
      },
      { header: t.colSeries, cell: (r) => r.series, sortValue: (r) => r.series },
      { header: t.colConfig, cell: (r) => r.config, sortValue: (r) => r.config },
      { header: t.colPrecision, cell: (r) => r.precision, sortValue: (r) => r.precision },
      {
        header: t.colConcurrency,
        cell: (r) => r.concurrency,
        sortValue: (r) => r.concurrency,
        align: 'right',
      },
      { header: t.colTp, cell: (r) => r.tp, sortValue: (r) => r.tp, align: 'right' },
      {
        header: t.colTtft(statLabel),
        cell: (r) => r.ttft.toFixed(2),
        sortValue: (r) => r.ttft,
        align: 'right',
      },
      {
        header: t.colInteractivity(statLabel),
        cell: (r) => r.interactivity.toFixed(1),
        sortValue: (r) => r.interactivity,
        align: 'right',
      },
      {
        header: t.colCost(costUnit),
        cell: (r) => formatCost(r.cost),
        sortValue: (r) => r.cost,
        align: 'right',
      },
      {
        header: t.colRun,
        cell: (r) =>
          r.runUrl ? (
            <a
              href={r.runUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
              onClick={() => track('first_token_run_link_clicked')}
            >
              {t.viewRun}
              <ExternalLinkIcon />
            </a>
          ) : (
            '—'
          ),
      },
    ],
    [t, statLabel, costUnit],
  );

  const handleExportCsv = useCallback(() => {
    const headers = [
      t.colCap,
      t.colSeries,
      t.colConfig,
      t.colPrecision,
      t.colConcurrency,
      t.colTp,
      t.colTtft(statLabel),
      t.colInteractivity(statLabel),
      t.colCost(costUnit),
      t.colRun,
    ];
    const body = tableRows.map((r) => [
      r.cap,
      r.series,
      r.config,
      r.precision,
      r.concurrency,
      r.tp,
      r.ttft,
      r.interactivity,
      r.cost,
      r.runUrl ?? '',
    ]);
    exportToCsv(`InferenceX_first_token_limits_${selectedModel}.csv`, headers, body, [
      `${getModelLabel(selectedModel)} • ${getSequenceLabel(selectedSequence, locale)}`,
      t.captionFloor(minInteractivity, statLabel),
      getCostProviderLabel(costProvider, locale),
    ]);
    track('first_token_csv_exported', { model: selectedModel });
  }, [
    t,
    statLabel,
    costUnit,
    tableRows,
    selectedModel,
    selectedSequence,
    locale,
    minInteractivity,
    costProvider,
  ]);

  const showsJalapenoPreview = includesJalapenoResult(legendHwKeys);
  const showsVeraRubinPreview = includesVeraRubinResult(legendHwKeys);
  const showsTpuv7Preview = includesTpuv7Result(legendHwKeys);

  const caption = (
    <>
      <Heading as="h2" level="card">
        {t.title}
      </Heading>
      <p className="text-sm text-muted-foreground mb-2">
        {getModelLabel(selectedModel)} • {getSequenceLabel(selectedSequence, locale)} •{' '}
        {t.captionFloor(minInteractivity, statLabel)} • {getCostProviderLabel(costProvider, locale)}{' '}
        • {t.captionRows(result.qualifyingRows, result.measuredRows)} • {t.captionSource}
      </p>
    </>
  );

  const legendElement = (
    <ChartLegend
      variant="sidebar"
      legendItems={legendItems}
      onItemRemove={removeGpu}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={(expanded) => {
        setIsLegendExpanded(expanded);
        track('first_token_legend_expanded', { expanded });
      }}
      switches={[
        {
          id: 'first-token-high-contrast',
          label: t.highContrast,
          checked: highContrast,
          onCheckedChange: (checked: boolean) => {
            setHighContrast(checked);
            track('first_token_high_contrast_toggled', { enabled: checked });
          },
        },
      ]}
    />
  );

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
      <section data-testid="first-token-controls">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader
              title={t.title}
              description={t.description}
              actions={<ChartShareActions />}
            />

            <TooltipProvider delayDuration={0}>
              <ControlPanel
                legend={t.benchmarkGroup}
                data-testid="first-token-benchmark-panel"
                className={`grid-cols-1 md:grid-cols-2 ${
                  isAgenticSequence && featureGateUnlocked ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
                }`}
              >
                <div className="min-w-0 md:col-span-2">
                  <ModelSelector
                    id="first-token-model"
                    data-testid="first-token-model-selector"
                    value={selectedModel}
                    onChange={handleModelChange}
                    open={openDropdown === 'model'}
                    onOpenChange={handleDropdownOpenChange('model')}
                    availableModels={availableModels}
                  />
                </div>
                <ScenarioSelector
                  id="first-token-sequence"
                  data-testid="first-token-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  open={openDropdown === 'sequence'}
                  onOpenChange={handleDropdownOpenChange('sequence')}
                  availableSequences={availableSequences}
                  model={selectedModel}
                />
                {isAgenticSequence && featureGateUnlocked && (
                  <PercentileSelector
                    id="first-token-percentile"
                    data-testid="first-token-percentile-selector"
                    value={selectedPercentile}
                    onChange={handlePercentileChange}
                  />
                )}
                <PrecisionSelector
                  id="first-token-precision"
                  data-testid="first-token-precision-selector"
                  value={selectedPrecisions}
                  onChange={handlePrecisionChange}
                  open={openDropdown === 'precision'}
                  onOpenChange={handleDropdownOpenChange('precision')}
                  availablePrecisions={availablePrecisions}
                />
              </ControlPanel>

              <ControlPanel
                legend={t.chartGroup}
                data-testid="first-token-chart-panel"
                className="grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
              >
                <div className="flex min-w-0 flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="first-token-cost"
                    label={t.costProviderLabel}
                    tooltip={t.costProviderTooltip}
                  />
                  <div data-testid="first-token-cost-selector">
                    <MultiSelect
                      triggerId="first-token-cost"
                      options={[
                        ...COST_PROVIDER_OPTIONS.map((provider) => ({
                          value: provider.value,
                          label: locale === 'zh' ? provider.labelZh : provider.label,
                        })),
                        ...lockedCostProviderOptions(locale),
                      ]}
                      value={[costProvider]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        if (interceptLockedTier(next)) return;
                        setCostProvider(next as CostProvider);
                        track('first_token_cost_provider_changed', { provider: next });
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

                <div className="flex min-w-0 flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="first-token-cost-type"
                    label={t.tokenTypeLabel}
                    tooltip={t.tokenTypeTooltip}
                  />
                  <div data-testid="first-token-cost-type-selector">
                    <MultiSelect
                      triggerId="first-token-cost-type"
                      options={COST_TYPE_OPTIONS.map((ct) => ({
                        value: ct.value,
                        label: locale === 'zh' ? ct.labelZh : ct.label,
                      }))}
                      value={[costType]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        setCostType(next as CostType);
                        track('first_token_cost_type_changed', { costType: next });
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

                <div className="flex min-w-0 flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="first-token-min-interactivity"
                    label={t.minInteractivityLabel(statLabel)}
                    tooltip={t.minInteractivityTooltip(statLabel)}
                  />
                  <Input
                    id="first-token-min-interactivity"
                    data-testid="first-token-min-interactivity"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={5}
                    placeholder={String(defaultMinInteractivity)}
                    value={minInteractivityInput}
                    onChange={(e) => handleMinInteractivityChange(e.target.value)}
                    onBlur={handleMinInteractivityBlur}
                  />
                </div>

                <div className="flex min-w-0 flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="first-token-caps"
                    label={t.capsLabel}
                    tooltip={t.capsTooltip}
                  />
                  <Input
                    id="first-token-caps"
                    data-testid="first-token-caps"
                    type="text"
                    inputMode="decimal"
                    placeholder={t.capsPlaceholder}
                    value={capsInput}
                    onChange={(e) => handleCapsChange(e.target.value)}
                    onBlur={handleCapsBlur}
                  />
                </div>

                {showsTcoBasis && (
                  <div className="flex min-w-0 max-w-48 flex-col space-y-1.5">
                    <LabelWithTooltip
                      label={locale === 'zh' ? 'TCO 口径' : 'TCO Basis'}
                      tooltip={
                        locale === 'zh'
                          ? '外部客户价格或内部持有成本；目前仅影响 TPUv7。'
                          : 'External customer pricing or internal owner cost; currently affects only TPUv7.'
                      }
                    />
                    <TcoBasisToggle source="first_token" className="md:h-9" />
                  </div>
                )}
              </ControlPanel>
            </TooltipProvider>
          </div>
        </Card>
      </section>

      {loading && (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      )}

      {!loading && !hasAnyData && (
        <Card>
          <div
            className="flex items-center justify-center h-64 text-muted-foreground text-center px-6"
            data-testid="first-token-no-data"
          >
            {t.noData}
          </div>
        </Card>
      )}

      {!loading && hasAnyData && (
        <Card>
          <figure data-testid="first-token-figure" className="relative rounded-lg">
            <ChartButtons
              chartId="first-token-limits"
              analyticsPrefix="first_token"
              hideZoomReset
              onExportCsv={handleExportCsv}
              exportFileName={`InferenceX_first_token_limits_${selectedModel}`}
            />
            {showsJalapenoPreview && <JalapenoOfficialPreviewNotice />}
            {showsVeraRubinPreview && <VeraRubinOfficialPreviewNotice />}
            {showsTpuv7Preview && <Tpuv7OfficialPreviewNotice />}
            {hasBars ? (
              <FirstTokenLimitsChart
                result={result}
                hardwareConfig={hardwareConfig}
                costType={costType}
                ttftStat={statLabel}
                interactivityStat={statLabel}
                colorResolver={resolveColor}
                runInfoByIndex={runInfoByIndex}
                legendElement={legendElement}
                caption={caption}
              />
            ) : (
              <>
                <figcaption>{caption}</figcaption>
                <div
                  className="flex items-center justify-center h-48 text-muted-foreground text-center px-6"
                  data-testid="first-token-none-qualify"
                >
                  {result.measuredRows + result.overlayMeasuredRows === 0
                    ? t.noTtft(statLabel)
                    : t.noneQualify(minInteractivity, statLabel)}
                </div>
              </>
            )}
          </figure>

          <p className="mt-4 text-xs text-muted-foreground">
            <strong>{t.note}</strong>
            {t.methodology(statLabel, statLabel)} {t.source}
            <a
              href={TCO_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {TCO_SOURCE_TITLE}
              <ExternalLinkIcon />
            </a>
          </p>

          {tableRows.length > 0 && (
            <div className="mt-4">
              <DataTable
                data={tableRows}
                columns={columns}
                testId="first-token-table"
                analyticsPrefix="first_token_table"
                searchable={false}
              />
            </div>
          )}
        </Card>
      )}
      {tcoModelDialog}
    </div>
  );
}

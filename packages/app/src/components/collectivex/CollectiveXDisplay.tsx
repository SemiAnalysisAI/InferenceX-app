'use client';

import { BookOpen, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { Label } from '@/components/ui/label';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCollectiveX, useCollectiveXRun, useCollectiveXRuns } from '@/hooks/api/use-collectivex';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { CollectiveXChart } from './CollectiveXChart';
import { CollectiveXCaseDetail, CollectiveXInventory } from './CollectiveXInventory';
import { CollectiveXAttemptTable, CollectiveXCoverageTable } from './CollectiveXTables';
import {
  collectiveXColorKey,
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  comparisonDifferences,
  seriesMatchesSelection,
  type CollectiveXFabricScope,
  type CollectiveXSeriesSelection,
} from './data';
import { collectiveXAvailabilityReason } from './reader';
import {
  COLLECTIVEX_VERSIONS,
  COLLECTIVEX_DEFAULT_VERSION,
  collectiveXVersionLabel,
  type CollectiveXMode,
  type CollectiveXOperation,
  type CollectiveXPercentile,
  type CollectiveXPhase,
  type CollectiveXScale,
  type CollectiveXVersion,
  type CollectiveXXAxis,
  type CollectiveXYAxis,
} from './types';

type CollectiveXTab = 'results' | 'inventory' | 'case' | 'evidence';
interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

const PERCENTILE_OPTIONS: SegmentedToggleOption<CollectiveXPercentile>[] = [
  { value: 'p50', label: 'p50' },
  { value: 'p90', label: 'p90' },
  { value: 'p95', label: 'p95' },
  { value: 'p99', label: 'p99' },
];
const TAB_VALUES: CollectiveXTab[] = ['results', 'inventory', 'case', 'evidence'];
// Neutral MVP: no promotion/cohort/eligibility layer. The view is the measured
// series set for one run, filtered by the identity axes the neutral shard carries.
// Strings that describe that retired decision layer are gone; the remaining zh
// values are preserved verbatim, and keys added for the neutral view mirror their
// en text until the repository's temporary language override is lifted.
const STRINGS = {
  en: {
    operation: {
      dispatch: 'Dispatch',
      combine: 'Combine',
      roundtrip: 'Round trip',
      'isolated-sum': 'Isolated sum',
    },
    operationHeading: {
      dispatch: 'Dispatch',
      combine: 'Combine',
      roundtrip: 'Round trip (measured)',
      'isolated-sum': 'Isolated sum (derived)',
    },
    phase: { decode: 'Decode', prefill: 'Prefill' },
    phaseValue: { decode: 'decode', prefill: 'prefill' },
    scale: { log: 'Log', linear: 'Linear' },
    xAxis: {
      'tokens-per-rank': 'Source tokens / rank',
      'global-tokens': 'Global source tokens',
    },
    yAxis: {
      latency: 'Latency',
      'tokens-per-second': 'Token rate at selected latency percentile',
      'payload-rate': 'Logical payload rate at selected latency percentile',
    },
    mode: { normal: 'Normal', 'low-latency': 'Low latency' },
    fabricScope: { all: 'All', 'scale-up': 'Scale-up', 'scale-out': 'Scale-out' },
    topologyScope: { 'scale-up': 'Scale-up', 'scale-out': 'Scale-out' },
    payloadUnit: { 'token-rank': 'Token-rank payload', 'token-expert': 'Token-expert payload' },
    combineSemantics: {
      'activation-only': 'Activation-only combine',
      'gate-weighted': 'Gate-weighted combine',
    },
    tabs: {
      results: 'EP results',
      inventory: 'Matrix case inventory',
      case: 'Selected matrix case',
      evidence: 'Evidence',
    },
    noCases: 'This run has no matrix cases to inspect.',
    all: 'All',
    loading: 'Resolving CollectiveX run...',
    unavailable: 'CollectiveX run unavailable',
    sourceUnavailable: 'The GitHub Actions run source is temporarily unavailable.',
    runsErrorMessage: 'No CollectiveX run has been published yet.',
    loadError: 'The CollectiveX dataset failed to load.',
    retry: 'Retry',
    description:
      'Expert-parallel latency and payload rate across collective libraries and systems.',
    source: 'Source',
    methodology: 'Methodology',
    sourceLinkUnavailable: 'Source unavailable because measured series span different revisions',
    refresh: 'Refresh',
    seriesCount: 'Series',
    measuredCases: 'Measured cases',
    terminalCases: 'Terminal cases',
    retainedAttempts: 'Retained attempts',
    allocations: 'Allocations',
    publishedUtc: 'Published (UTC)',
    version: 'Benchmark version',
    runControl: 'Run',
    loadRuns: 'Load runs',
    loadingRuns: 'Loading runs…',
    latestPublished: 'Latest published',
    modeControl: 'Mode',
    modeAria: 'CollectiveX mode',
    epControl: 'EP degree',
    fabricScopeControl: 'Fabric scope',
    fabricScopeAria: 'CollectiveX fabric scope',
    operationControl: 'Operation',
    phaseControl: 'Phase',
    phaseAria: 'CollectiveX phase',
    latencyPercentile: 'Latency percentile',
    percentileAria: 'CollectiveX percentile',
    sku: 'SKU',
    backend: 'Backend',
    routing: 'Routing',
    xAxisControl: 'X axis',
    xScale: 'X scale',
    xScaleAria: 'CollectiveX x scale',
    yAxisControl: 'Y axis',
    tokenRateOption: 'Token rate at latency percentile',
    yScale: 'Y scale',
    yScaleAria: 'CollectiveX y scale',
    noSeries: 'No measured series match these filters.',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
    stableOrdering: 'stable ordering passed',
    samplingContract: (trials: number, iterations: number, samples: number, warmups: number) =>
      `${trials}×${iterations} = ${samples} samples/component · ${warmups} synchronized warmups`,
    selectedFactorsDiffer: 'Selected factors differ',
    differenceLabels: {
      model: 'model',
      suite: 'suite',
      mode: 'mode',
      phase: 'phase',
      'backend implementation': 'backend implementation',
      'implementation build': 'implementation build',
      'system identity': 'system identity',
      'fabric scope': 'fabric scope',
      topology: 'topology',
      transport: 'transport',
      'world size': 'world size',
      'EP degree': 'EP degree',
      placement: 'placement',
      workload: 'workload',
      'model shape': 'model shape',
      routing: 'routing',
      'EPLB plan': 'EPLB plan',
      dtypes: 'dtypes',
      'resource profile': 'resource profile',
      measurement: 'measurement',
      'token ladder': 'token ladder',
      'component availability': 'component availability',
      correctness: 'correctness',
    },
    missingComponents: 'Unavailable components remain null and are omitted.',
    isolatedNote: 'Isolated sum is derived and never drives throughput.',
    payloadNote:
      'Payload rate is derived at the selected latency percentile and is not physical link bandwidth.',
    provenance: 'Run provenance',
    runLabel: 'Run',
    attemptLabel: 'Attempt',
    matrixLabel: 'Matrix',
    sourceBundles: 'Source bundles',
  },
  zh: {
    operation: {
      dispatch: '分发',
      combine: '合并',
      roundtrip: '往返',
      'isolated-sum': '分项之和',
    },
    operationHeading: {
      dispatch: '分发',
      combine: '合并',
      roundtrip: '往返（实测）',
      'isolated-sum': '分项之和（派生）',
    },
    phase: { decode: '解码', prefill: '预填充' },
    phaseValue: { decode: '解码', prefill: '预填充' },
    scale: { log: '对数', linear: '线性' },
    xAxis: {
      'tokens-per-rank': '每 rank 源 token 数',
      'global-tokens': '全局源 token 数',
    },
    yAxis: {
      latency: '延迟',
      'tokens-per-second': '所选延迟分位点的 token 速率',
      'payload-rate': '所选延迟分位点的逻辑载荷速率',
    },
    mode: { normal: '常规', 'low-latency': '低延迟' },
    fabricScope: { all: '全部', 'scale-up': '域内', 'scale-out': '跨域' },
    topologyScope: { 'scale-up': '域内（scale-up）', 'scale-out': '跨域（scale-out）' },
    payloadUnit: { 'token-rank': 'Token-rank 载荷', 'token-expert': 'Token-expert 载荷' },
    combineSemantics: {
      'activation-only': '仅激活值合并',
      'gate-weighted': '门控加权合并',
    },
    // English-only per the repository's temporary language override (no new
    // Chinese text); keys added for the neutral view mirror the en values.
    tabs: {
      results: 'EP results',
      inventory: 'Matrix case inventory',
      case: 'Selected matrix case',
      evidence: '证据',
    },
    noCases: 'This run has no matrix cases to inspect.',
    all: '全部',
    loading: 'Resolving CollectiveX run...',
    unavailable: 'CollectiveX run unavailable',
    sourceUnavailable: 'The GitHub Actions run source is temporarily unavailable.',
    runsErrorMessage: 'No CollectiveX run has been published yet.',
    loadError: 'The CollectiveX dataset failed to load.',
    retry: '重试',
    description: '对比集合通信库与系统的专家并行（EP）延迟和逻辑载荷速率。',
    source: '源代码',
    methodology: '测试方法',
    sourceLinkUnavailable: 'Source unavailable because measured series span different revisions',
    refresh: '刷新',
    seriesCount: 'Series',
    measuredCases: 'Measured cases',
    terminalCases: '已终结用例',
    retainedAttempts: '保留尝试',
    allocations: '独立分配',
    publishedUtc: '发布时间（UTC）',
    version: '基准版本',
    runControl: 'Run',
    loadRuns: 'Load runs',
    loadingRuns: 'Loading runs…',
    latestPublished: 'Latest published',
    modeControl: '模式',
    modeAria: 'CollectiveX 模式',
    epControl: 'EP 并行度',
    fabricScopeControl: '互联范围',
    fabricScopeAria: 'CollectiveX 互联范围',
    operationControl: '操作',
    phaseControl: '阶段',
    phaseAria: 'CollectiveX 阶段',
    latencyPercentile: '延迟分位点',
    percentileAria: 'CollectiveX 延迟分位点',
    sku: 'SKU',
    backend: '后端',
    routing: '路由',
    xAxisControl: 'X 轴',
    xScale: 'X 轴刻度',
    xScaleAria: 'CollectiveX X 轴刻度',
    yAxisControl: 'Y 轴',
    tokenRateOption: '延迟分位点对应的 token 速率',
    yScale: 'Y 轴刻度',
    yScaleAria: 'CollectiveX Y 轴刻度',
    noSeries: 'No measured series match these filters.',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
    stableOrdering: '排名顺序稳定性已通过',
    samplingContract: (trials: number, iterations: number, samples: number, warmups: number) =>
      `${trials}×${iterations} = 每个分项 ${samples} 个样本 · ${warmups} 次同步预热`,
    selectedFactorsDiffer: '所选配置存在差异',
    differenceLabels: {
      model: '模型',
      suite: '测试套件',
      mode: '模式',
      phase: '阶段',
      'backend implementation': '后端实现',
      'implementation build': '实现构建',
      'system identity': '系统标识',
      'fabric scope': '互联范围',
      topology: '拓扑',
      transport: '传输方式',
      'world size': '全局 rank 数',
      'EP degree': 'EP 并行度',
      placement: '放置方式',
      workload: '工作负载',
      'model shape': '模型形状',
      routing: '路由',
      'EPLB plan': 'EPLB 方案',
      dtypes: '数据类型',
      'resource profile': '资源配置',
      measurement: '测量协议',
      'token ladder': 'token 梯度',
      'component availability': '测量分项可用性',
      correctness: '正确性',
    },
    missingComponents: '不可用的测量分项保持为空，并从图表中省略。',
    isolatedNote: '分项之和为派生值，不用于计算吞吐量。',
    payloadNote: '逻辑载荷速率按所选延迟分位点派生，不代表物理链路带宽。',
    provenance: '发布数据溯源',
    runLabel: 'Run',
    attemptLabel: 'Attempt',
    matrixLabel: 'Matrix',
    sourceBundles: '源产物包',
  },
} as const;
const CONCLUSION_CLASSES: Record<string, string> = {
  success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failure: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
};
const CONCLUSION_FALLBACK_CLASS =
  'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';

function formatDate(value: string, locale: 'en' | 'zh'): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function selectOptions(
  values: string[],
  allLabel: string,
  uppercase = false,
): SelectOption<string>[] {
  return values.map((value) => ({
    value,
    label: value === 'all' ? allLabel : uppercase ? value.toUpperCase() : value,
  }));
}

// A single source link is only meaningful when every measured series was built
// from the same revision; a run that mixes revisions has no canonical source.
function runSourceSha(series: { build: { source_sha: string } }[]): string | null {
  const sourceSha = series[0]?.build.source_sha;
  return sourceSha && series.every((item) => item.build.source_sha === sourceSha)
    ? sourceSha
    : null;
}

export default function CollectiveXDisplay() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [version, setVersion] = useState<CollectiveXVersion>(COLLECTIVEX_DEFAULT_VERSION);
  // JIT run picker: `runsRequested` gates the run listing behind the "Load runs"
  // button; `selectedRunId` (null = the latest published run) pins the view to one
  // specific run's dataset. Runs are keyed by their GitHub Actions run id.
  const [runsRequested, setRunsRequested] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const latestQuery = useCollectiveX(version);
  const runsQuery = useCollectiveXRuns(version, runsRequested);
  const runQuery = useCollectiveXRun(version, selectedRunId);
  // A pinned run overrides latest; both resolve to the same
  // { dataset, run_id, run_attempt } shape the rest of the view consumes.
  const activeQuery = selectedRunId === null ? latestQuery : runQuery;
  const { data, error, isLoading, isFetching } = activeQuery;
  const [tab, setTab] = useState<CollectiveXTab>('results');
  const [mode, setMode] = useState<CollectiveXMode>('normal');
  const [epSize, setEpSize] = useState(8);
  const [fabricScope, setFabricScope] = useState<CollectiveXFabricScope>('all');
  const [operation, setOperation] = useState<CollectiveXOperation>('roundtrip');
  const [phase, setPhase] = useState<CollectiveXPhase>('decode');
  const [percentile, setPercentile] = useState<CollectiveXPercentile>('p99');
  const [xAxis, setXAxis] = useState<CollectiveXXAxis>('tokens-per-rank');
  const [yAxis, setYAxis] = useState<CollectiveXYAxis>('latency');
  const [xScale, setXScale] = useState<CollectiveXScale>('log');
  const [yScale, setYScale] = useState<CollectiveXScale>('log');
  const [sku, setSku] = useState('all');
  const [backend, setBackend] = useState('all');
  const [routing, setRouting] = useState('all');
  const [activeSeriesIds, setActiveSeriesIds] = useState<Set<string>>(new Set());
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const operationOptions: SelectOption<CollectiveXOperation>[] = [
    { value: 'dispatch', label: t.operation.dispatch },
    { value: 'stage', label: 'Stage' },
    { value: 'combine', label: t.operation.combine },
    { value: 'roundtrip', label: t.operation.roundtrip },
    { value: 'isolated-sum', label: t.operation['isolated-sum'] },
  ];
  const phaseOptions: SegmentedToggleOption<CollectiveXPhase>[] =
    mode === 'low-latency'
      ? [{ value: 'decode', label: t.phase.decode }]
      : [
          { value: 'decode', label: t.phase.decode },
          { value: 'prefill', label: t.phase.prefill },
        ];
  const scaleOptions: SegmentedToggleOption<CollectiveXScale>[] = [
    { value: 'log', label: t.scale.log },
    { value: 'linear', label: t.scale.linear },
  ];
  const xAxisOptions: SelectOption<CollectiveXXAxis>[] = [
    { value: 'tokens-per-rank', label: t.xAxis['tokens-per-rank'] },
    { value: 'global-tokens', label: t.xAxis['global-tokens'] },
  ];
  const fabricScopeOptions: SegmentedToggleOption<CollectiveXFabricScope>[] = [
    { value: 'all', label: t.fabricScope.all },
    { value: 'scale-up', label: t.fabricScope['scale-up'] },
    { value: 'scale-out', label: t.fabricScope['scale-out'] },
  ];
  const versionOptions: SelectOption<CollectiveXVersion>[] = COLLECTIVEX_VERSIONS.map((value) => ({
    value,
    label: collectiveXVersionLabel(value),
  }));
  const runList = runsQuery.data ?? [];
  const runOptions: SelectOption<string>[] = useMemo(
    () => [
      { value: 'latest', label: t.latestPublished },
      ...runList.map((run) => ({
        value: run.run_id,
        label: `#${run.run_id} · ${run.conclusion ?? 'pending'} · ${run.covered_skus.length} SKU · ${formatDate(run.generated_at, locale)}`,
      })),
    ],
    [locale, runList, t.latestPublished],
  );
  // Runs are per-version; changing the version drops any pinned run and folds
  // the picker back to its JIT button.
  useEffect(() => {
    setSelectedRunId(null);
    setRunsRequested(false);
  }, [version]);
  // If a refreshed listing no longer carries the pinned run, fall back to the
  // latest run rather than a dangling id.
  useEffect(() => {
    if (
      selectedRunId !== null &&
      runsQuery.data &&
      !runsQuery.data.some((run) => run.run_id === selectedRunId)
    ) {
      setSelectedRunId(null);
    }
  }, [runsQuery.data, selectedRunId]);
  const tabOptions: { value: CollectiveXTab; label: string }[] = [
    { value: 'results', label: t.tabs.results },
    { value: 'inventory', label: t.tabs.inventory },
    { value: 'case', label: t.tabs.case },
    { value: 'evidence', label: t.tabs.evidence },
  ];

  const dataset = data?.dataset;
  const sourceSha = useMemo(() => runSourceSha(dataset?.series ?? []), [dataset?.series]);
  // Selection for the "Selected matrix case" tab. Falls back to the first
  // coverage row so the tab is never empty when the run has cases; a stale id
  // (e.g. after pinning a different run) falls back the same way.
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const selectedCase = useMemo(
    () =>
      (dataset?.coverage ?? []).find((item) => item.case_id === selectedCaseId) ??
      dataset?.coverage[0] ??
      null,
    [dataset?.coverage, selectedCaseId],
  );
  const availableModes = useMemo(
    () =>
      [...new Set(dataset?.series.map((item) => item.mode))].toSorted((left, right) =>
        left === 'normal' ? -1 : right === 'normal' ? 1 : 0,
      ),
    [dataset?.series],
  );
  const availableEpSizes = useMemo(
    () =>
      [...new Set(dataset?.series.map((item) => item.system.ep_size))].toSorted((a, b) => a - b),
    [dataset?.series],
  );
  useEffect(() => {
    if (availableModes.length > 0 && !availableModes.includes(mode)) {
      const next = availableModes[0];
      setMode(next);
      if (next === 'low-latency') setPhase('decode');
    }
    if (availableEpSizes.length > 0 && !availableEpSizes.includes(epSize)) {
      setEpSize(availableEpSizes[0]);
    }
  }, [availableEpSizes, availableModes, epSize, mode]);
  const seriesSelection = useMemo<CollectiveXSeriesSelection>(
    () => ({ mode, epSize, phase, fabricScope }),
    [epSize, fabricScope, mode, phase],
  );
  // The neutral view is the full measured series set for the run, narrowed by the
  // identity axes the shard carries: mode, EP degree, phase, and fabric scope.
  const matchedSeries = useMemo(
    () => (dataset?.series ?? []).filter((item) => seriesMatchesSelection(item, seriesSelection)),
    [dataset?.series, seriesSelection],
  );
  const skuOptions = useMemo(
    () => ['all', ...new Set(matchedSeries.map((item) => item.system.sku))],
    [matchedSeries],
  );
  const backendOptions = useMemo(
    () => ['all', ...new Set(matchedSeries.map((item) => item.backend.label))],
    [matchedSeries],
  );
  const routingOptions = useMemo(
    () => [
      'all',
      ...new Set(
        matchedSeries.map((item) => `${item.workload.routing}${item.workload.eplb ? '+eplb' : ''}`),
      ),
    ],
    [matchedSeries],
  );
  useEffect(() => {
    if (!skuOptions.includes(sku)) setSku('all');
    if (!backendOptions.includes(backend)) setBackend('all');
    if (!routingOptions.includes(routing)) setRouting('all');
  }, [backend, backendOptions, routing, routingOptions, sku, skuOptions]);
  const phaseSeries = useMemo(
    () =>
      matchedSeries.filter(
        (item) =>
          (sku === 'all' || item.system.sku === sku) &&
          (backend === 'all' || item.backend.label === backend) &&
          (routing === 'all' ||
            `${item.workload.routing}${item.workload.eplb ? '+eplb' : ''}` === routing),
      ),
    [backend, matchedSeries, routing, sku],
  );

  useEffect(() => {
    setActiveSeriesIds(new Set(phaseSeries.map((item) => item.series_id)));
  }, [phaseSeries]);

  useEffect(() => {
    const readHash = () => {
      const value = window.location.hash.replace(/^#(?:tab-)?/, '');
      if (TAB_VALUES.includes(value as CollectiveXTab)) setTab(value as CollectiveXTab);
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    window.addEventListener('popstate', readHash);
    return () => {
      window.removeEventListener('hashchange', readHash);
      window.removeEventListener('popstate', readHash);
    };
  }, []);

  const activeSeries = useMemo(
    () => phaseSeries.filter((item) => activeSeriesIds.has(item.series_id)),
    [activeSeriesIds, phaseSeries],
  );
  const colorKeys = useMemo(
    () => [...new Set(phaseSeries.map(collectiveXColorKey))],
    [phaseSeries],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    activeKeys: colorKeys,
    hcKeys: colorKeys,
    hcVendorKeyFor: (key) => key.split('_')[0],
  });
  const colors = useMemo(
    () => Object.fromEntries(colorKeys.map((key) => [key, getCssColor(resolveColor(key, key))])),
    [colorKeys, getCssColor, resolveColor],
  );
  const legendItems = useMemo(
    () =>
      phaseSeries.map((item) => ({
        name: item.series_id,
        label: collectiveXSeriesLabel(item),
        color: colors[collectiveXColorKey(item)] ?? 'var(--muted-foreground)',
        isActive: activeSeriesIds.has(item.series_id),
        title: `${item.mode} · EP${item.system.ep_size} · ${item.system.scope} · ${collectiveXTopologyLabel(item.system)} · ${item.workload.workload_id}`,
        onClick: () => {
          setActiveSeriesIds((previous) => {
            const next = new Set(previous);
            if (next.has(item.series_id)) next.delete(item.series_id);
            else next.add(item.series_id);
            return next;
          });
          track('collectivex_series_toggled', { series: item.series_id });
        },
      })),
    [activeSeriesIds, colors, phaseSeries],
  );
  const warnings = useMemo(() => comparisonDifferences(activeSeries), [activeSeries]);
  const missingComponents = activeSeries.some((item) =>
    item.points.some((point) =>
      operation === 'isolated-sum'
        ? point.components.isolated_sum === null
        : point.components[operation] === null,
    ),
  );
  const chartSemantics = useMemo(() => {
    const modes = [...new Set(phaseSeries.map((item) => item.mode))]
      .map((item) => t.mode[item])
      .join(' / ');
    const eps = [...new Set(phaseSeries.map((item) => `EP${item.system.ep_size}`))].join(' / ');
    const fabric = [...new Set(phaseSeries.map((item) => item.system.scope))]
      .map((item) => t.topologyScope[item])
      .join(' / ');
    const payload = [...new Set(phaseSeries.map((item) => item.measurement.payload_unit))]
      .map((item) => t.payloadUnit[item as keyof typeof t.payloadUnit] ?? item)
      .join(' / ');
    const combine = [...new Set(phaseSeries.map((item) => item.measurement.combine_semantics))]
      .map((item) => t.combineSemantics[item as keyof typeof t.combineSemantics] ?? item)
      .join(' / ');
    const sampling = [
      ...new Set(
        phaseSeries.map((item) =>
          t.samplingContract(
            item.measurement.trials,
            item.measurement.iters,
            item.measurement.samples_per_component,
            item.measurement.warmups,
          ),
        ),
      ),
    ].join(' / ');
    return [modes, eps, fabric, payload, combine, sampling].filter(Boolean).join(' · ');
  }, [phaseSeries, t]);

  const handleRefresh = useCallback(() => {
    track('collectivex_data_refreshed');
    void activeQuery.refetch();
    if (runsRequested) void runsQuery.refetch();
  }, [activeQuery, runsQuery, runsRequested]);
  const handleTab = useCallback((value: string) => {
    const next = value as CollectiveXTab;
    setTab(next);
    window.location.hash = `tab-${next}`;
    track('collectivex_tab_changed', { tab: next });
  }, []);
  // Inspecting a case from the inventory jumps to the detail tab.
  const handleInspectCase = useCallback(
    (caseId: string) => {
      setSelectedCaseId(caseId);
      handleTab('case');
      track('collectivex_case_inspected', { case: caseId });
    },
    [handleTab],
  );

  if (isLoading) {
    return (
      <Card data-testid="collectivex-loading" className="min-h-80 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t.loading}</p>
      </Card>
    );
  }
  if (error || !data || !dataset) {
    const availabilityReason = collectiveXAvailabilityReason(error);
    const message =
      availabilityReason === 'source-unavailable'
        ? t.sourceUnavailable
        : availabilityReason === 'runs-unavailable'
          ? t.runsErrorMessage
          : error instanceof Error
            ? error.message
            : t.loadError;
    return (
      <Card
        data-testid="collectivex-error"
        className={availabilityReason ? undefined : 'border-destructive'}
      >
        <h1 className="text-lg font-semibold">{t.unavailable}</h1>
        <p
          className={
            availabilityReason
              ? 'mt-2 text-sm text-muted-foreground'
              : 'mt-2 text-sm text-destructive'
          }
        >
          {message}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-32">
            <SelectControl
              label={t.version}
              testId="collectivex-error-version-select"
              value={version}
              options={versionOptions}
              onChange={setVersion}
            />
          </div>
          {selectedRunId !== null && (
            <Button
              variant="outline"
              data-testid="collectivex-error-latest"
              onClick={() => setSelectedRunId(null)}
            >
              {t.latestPublished}
            </Button>
          )}
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="size-4" />
            {t.retry}
          </Button>
        </div>
      </Card>
    );
  }

  const run = dataset.run;
  const conclusionClass =
    (run.conclusion && CONCLUSION_CLASSES[run.conclusion]) ?? CONCLUSION_FALLBACK_CLASS;

  return (
    <section data-testid="collectivex-display" className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">CollectiveX</h1>
              <span
                data-testid="collectivex-run-conclusion"
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${conclusionClass}`}
              >
                #{run.run_id} · {run.conclusion ?? 'pending'}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {sourceSha ? (
              <>
                <a
                  data-testid="collectivex-source-link"
                  href={`https://github.com/SemiAnalysisAI/InferenceX/tree/${sourceSha}/experimental/CollectiveX`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('collectivex_source_opened', { source_sha: sourceSha })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t.source} <ExternalLink className="size-3.5" />
                </a>
                <a
                  data-testid="collectivex-methodology-link"
                  href={`https://github.com/SemiAnalysisAI/InferenceX/blob/${sourceSha}/experimental/CollectiveX/docs/${locale === 'zh' ? 'methodology_zh.md' : 'methodology.md'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('collectivex_methodology_opened', { source_sha: sourceSha })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <BookOpen className="size-3.5" /> {t.methodology}
                </a>
              </>
            ) : (
              <span
                data-testid="collectivex-source-link"
                aria-disabled="true"
                title={t.sourceLinkUnavailable}
                className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground opacity-50"
              >
                {t.source} <ExternalLink className="size-3.5" />
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t.refresh}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat value={dataset.series.length} label={t.seriesCount} />
          <Stat value={`${run.measured_cases}/${run.requested_cases}`} label={t.measuredCases} />
          <Stat value={`${run.terminal_cases}/${run.requested_cases}`} label={t.terminalCases} />
          <Stat value={dataset.attempts.length} label={t.retainedAttempts} />
          <Stat value={run.allocation_count} label={t.allocations} />
          <Stat value={formatDate(dataset.generated_at, locale)} label={t.publishedUtc} compact />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={handleTab} className="gap-4">
        <TabsList data-testid="collectivex-tabs" className="overflow-x-auto">
          {tabOptions.map((item) => (
            <TabsTrigger key={item.value} value={item.value} id={`tab-${item.value}`}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="results" className="space-y-4">
          <Card className="py-4 md:py-5">
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <SelectControl
                label={t.version}
                testId="collectivex-version-select"
                value={version}
                options={versionOptions}
                onChange={(value) => {
                  setVersion(value);
                  track('collectivex_version_changed', { version: value });
                }}
              />
              <ControlGroup label={t.runControl}>
                {runsRequested ? (
                  runsQuery.isLoading ? (
                    <Button
                      variant="outline"
                      className="w-full justify-center"
                      disabled
                      data-testid="collectivex-runs-loading"
                    >
                      <Loader2 className="size-4 animate-spin" />
                      {t.loadingRuns}
                    </Button>
                  ) : runsQuery.error || !runsQuery.data ? (
                    <Button
                      variant="outline"
                      className="w-full justify-center"
                      data-testid="collectivex-runs-retry"
                      onClick={() => void runsQuery.refetch()}
                    >
                      <RefreshCw className="size-4" />
                      {t.retry}
                    </Button>
                  ) : (
                    <Select
                      value={selectedRunId ?? 'latest'}
                      onValueChange={(next) => {
                        setSelectedRunId(next === 'latest' ? null : next);
                        track('collectivex_run_selected', { version, run: next });
                      }}
                    >
                      <SelectTrigger
                        data-testid="collectivex-run-select"
                        className="min-w-0 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {runOptions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <Button
                    variant="outline"
                    className="w-full justify-center"
                    data-testid="collectivex-load-runs"
                    onClick={() => {
                      setRunsRequested(true);
                      track('collectivex_runs_requested', { version });
                    }}
                  >
                    {t.loadRuns}
                  </Button>
                )}
              </ControlGroup>
              <ControlGroup label={t.modeControl}>
                <SegmentedToggle
                  value={mode}
                  options={availableModes.map((value) => ({ value, label: t.mode[value] }))}
                  onValueChange={(value) => {
                    setMode(value);
                    if (value === 'low-latency') setPhase('decode');
                    track('collectivex_mode_changed', { mode: value });
                  }}
                  ariaLabel={t.modeAria}
                  testId="collectivex-mode-select"
                  className="flex w-full overflow-hidden"
                  buttonClassName="min-w-0 flex-1 justify-center px-1.5 whitespace-nowrap"
                />
              </ControlGroup>
              <SelectControl
                label={t.epControl}
                testId="collectivex-ep-select"
                value={String(epSize)}
                options={availableEpSizes.map((value) => ({
                  value: String(value),
                  label: `EP${value}`,
                }))}
                onChange={(value) => {
                  setEpSize(Number(value));
                  track('collectivex_ep_changed', { ep: Number(value) });
                }}
              />
              <ControlGroup label={t.fabricScopeControl}>
                <SegmentedToggle
                  value={fabricScope}
                  options={fabricScopeOptions}
                  onValueChange={(value) => {
                    setFabricScope(value);
                    track('collectivex_fabric_scope_changed', { fabric_scope: value });
                  }}
                  ariaLabel={t.fabricScopeAria}
                  testId="collectivex-fabric-scope-toggle"
                  className="flex w-full overflow-hidden"
                  buttonClassName="min-w-0 flex-1 justify-center px-1.5 whitespace-nowrap"
                />
              </ControlGroup>
              <SelectControl
                label={t.operationControl}
                testId="collectivex-operation-select"
                value={operation}
                options={operationOptions}
                onChange={(next) => {
                  setOperation(next);
                  if (next !== 'roundtrip' && yAxis === 'tokens-per-second') setYAxis('latency');
                  if (
                    next === 'isolated-sum' &&
                    (yAxis === 'activation-rate' || yAxis === 'total-logical-rate')
                  )
                    setYAxis('latency');
                }}
              />
              <ControlGroup label={t.phaseControl}>
                <SegmentedToggle
                  value={phase}
                  options={phaseOptions}
                  onValueChange={setPhase}
                  ariaLabel={t.phaseAria}
                  testId="collectivex-phase-toggle"
                />
              </ControlGroup>
              <ControlGroup label={t.latencyPercentile}>
                <SegmentedToggle
                  value={percentile}
                  options={PERCENTILE_OPTIONS}
                  onValueChange={setPercentile}
                  ariaLabel={t.percentileAria}
                  testId="collectivex-percentile-toggle"
                />
              </ControlGroup>
              <SelectControl
                label={t.sku}
                testId="collectivex-sku-select"
                value={sku}
                options={selectOptions(skuOptions, t.all, true)}
                onChange={setSku}
              />
              <SelectControl
                label={t.backend}
                testId="collectivex-backend-select"
                value={backend}
                options={selectOptions(backendOptions, t.all)}
                onChange={setBackend}
              />
              <SelectControl
                label={t.routing}
                testId="collectivex-routing-select"
                value={routing}
                options={selectOptions(routingOptions, t.all)}
                onChange={setRouting}
              />
              <SelectControl
                label={t.xAxisControl}
                testId="collectivex-x-axis-select"
                value={xAxis}
                options={xAxisOptions}
                onChange={setXAxis}
              />
              <ControlGroup label={t.xScale}>
                <SegmentedToggle
                  value={xScale}
                  options={scaleOptions}
                  onValueChange={setXScale}
                  ariaLabel={t.xScaleAria}
                  testId="collectivex-x-scale-toggle"
                />
              </ControlGroup>
              <SelectControl
                label={t.yAxisControl}
                testId="collectivex-y-axis-select"
                value={yAxis}
                onChange={setYAxis}
                options={[
                  { value: 'latency', label: t.yAxis.latency },
                  ...(operation === 'roundtrip'
                    ? ([
                        {
                          value: 'tokens-per-second',
                          label: t.tokenRateOption,
                        },
                      ] as const)
                    : []),
                  ...(operation === 'isolated-sum'
                    ? []
                    : ([
                        {
                          value: 'activation-rate',
                          label: 'Activation-data rate at latency percentile',
                        },
                        {
                          value: 'total-logical-rate',
                          label: 'Total logical data rate at latency percentile',
                        },
                      ] as const)),
                ]}
              />
              <ControlGroup label={t.yScale}>
                <SegmentedToggle
                  value={yScale}
                  options={scaleOptions}
                  onValueChange={setYScale}
                  ariaLabel={t.yScaleAria}
                  testId="collectivex-y-scale-toggle"
                />
              </ControlGroup>
            </div>
          </Card>
          {phaseSeries.length === 0 && (
            <Card data-testid="collectivex-empty-state" className="py-4">
              <p className="text-sm text-muted-foreground">{t.noSeries}</p>
            </Card>
          )}
          <Card data-testid="collectivex-main-chart" className="relative">
            <CollectiveXChart
              chartId="collectivex-explorer"
              testId="collectivex-explorer-chart"
              series={activeSeries}
              colors={colors}
              operation={operation}
              percentile={percentile}
              xAxis={xAxis}
              yAxis={yAxis}
              xScaleType={xScale}
              yScaleType={yScale}
              caption={
                <>
                  <h2 className="text-lg font-semibold">
                    {operation === 'stage' ? 'Stage' : t.operationHeading[operation]} ·{' '}
                    {t.phaseValue[phase]} ·{' '}
                    {yAxis === 'latency'
                      ? percentile
                      : locale === 'zh'
                        ? `${percentile} 延迟分位点`
                        : `at ${percentile} latency`}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {yAxis === 'activation-rate'
                      ? 'Activation-data rate at selected latency percentile'
                      : yAxis === 'total-logical-rate'
                        ? 'Total logical data rate at selected latency percentile'
                        : t.yAxis[yAxis]}
                  </p>
                  {chartSemantics && (
                    <p
                      data-testid="collectivex-chart-semantics"
                      className="mb-2 text-xs font-medium text-muted-foreground"
                    >
                      {chartSemantics}
                    </p>
                  )}
                </>
              }
              legendElement={
                <ChartLegend
                  variant="sidebar"
                  legendItems={legendItems}
                  disableActiveSort
                  onItemRemove={(id) =>
                    setActiveSeriesIds(
                      (previous) => new Set([...previous].filter((item) => item !== id)),
                    )
                  }
                  isLegendExpanded={legendExpanded}
                  onExpandedChange={setLegendExpanded}
                  switches={[
                    {
                      id: 'collectivex-high-contrast',
                      label: t.highContrast,
                      checked: highContrast,
                      onCheckedChange: setHighContrast,
                    },
                  ]}
                  actions={
                    activeSeries.length < phaseSeries.length
                      ? [
                          {
                            id: 'collectivex-reset-filter',
                            label: t.resetFilter,
                            onClick: () =>
                              setActiveSeriesIds(
                                new Set(phaseSeries.map((item) => item.series_id)),
                              ),
                          },
                        ]
                      : []
                  }
                />
              }
            />
            {warnings.length > 0 && (
              <p
                data-testid="collectivex-comparison-warning"
                className="mt-2 text-xs text-muted-foreground"
              >
                {t.selectedFactorsDiffer}:{' '}
                {warnings
                  .map(
                    (warning) =>
                      t.differenceLabels[warning as keyof typeof t.differenceLabels] ?? warning,
                  )
                  .join(', ')}
                .
              </p>
            )}
            {missingComponents && (
              <p className="mt-2 text-xs text-muted-foreground">{t.missingComponents}</p>
            )}
            {operation === 'isolated-sum' && (
              <p className="mt-2 text-xs text-muted-foreground">{t.isolatedNote}</p>
            )}
            {(yAxis === 'activation-rate' || yAxis === 'total-logical-rate') && (
              <p className="mt-2 text-xs text-muted-foreground">{t.payloadNote}</p>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="inventory">
          <CollectiveXInventory
            dataset={dataset}
            selectedCaseId={selectedCase?.case_id ?? ''}
            onInspectCase={handleInspectCase}
          />
        </TabsContent>
        <TabsContent value="case">
          {selectedCase ? (
            <CollectiveXCaseDetail dataset={dataset} item={selectedCase} />
          ) : (
            <Card data-testid="collectivex-case-empty" className="py-4">
              <p className="text-sm text-muted-foreground">{t.noCases}</p>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="evidence" className="space-y-4">
          <CollectiveXCoverageTable coverage={dataset.coverage} />
          <CollectiveXAttemptTable attempts={dataset.attempts} coverage={dataset.coverage} />
          <Card data-testid="collectivex-provenance">
            <h2 className="text-lg font-semibold">{t.provenance}</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Provenance label={t.runLabel} value={`#${data.run_id}`} mono />
              <Provenance label={t.attemptLabel} value={String(data.run_attempt)} mono />
              <Provenance label={t.matrixLabel} value={run.matrix_id ?? '-'} mono />
              <Provenance
                label={t.sourceBundles}
                value={dataset.source_bundle_ids.join(' · ') || '-'}
                mono
              />
            </dl>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Stat({
  value,
  label,
  compact = false,
}: {
  value: React.ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <div>
      <p className={compact ? 'text-sm font-semibold' : 'text-2xl font-semibold'}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SelectControl<T extends string | number>({
  label,
  testId,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  testId: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  // Radix Select speaks strings; numeric option values (e.g. the release version)
  // round-trip through String() and are recovered from the option list on change.
  return (
    <ControlGroup label={label}>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          const match = options.find((item) => String(item.value) === next);
          if (match) onChange(match.value);
        }}
      >
        <SelectTrigger data-testid={testId} className="min-w-0 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectItem key={String(item.value)} value={String(item.value)}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}

function Provenance({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`${mono ? 'font-mono text-xs' : 'font-medium'} mt-1 break-all`}>{value}</dd>
    </div>
  );
}

'use client';

import { BookOpen, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { Label } from '@/components/ui/label';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/searchable-select';
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
import { CollectiveXInventory } from './CollectiveXInventory';
import { collectiveXAvailabilityReason } from './reader';
import {
  CollectiveXAttemptTable,
  collectiveXCohortLabel,
  CollectiveXCoverageTable,
  CollectiveXDecisionTables,
  collectiveXReasonLabel,
} from './CollectiveXTables';
import {
  cohortMatchesSelection,
  collectiveXColorKey,
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  comparisonDifferences,
  seriesMatchesSelection,
  type CollectiveXFabricScope,
} from './data';
import {
  COLLECTIVEX_VERSIONS,
  COLLECTIVEX_DEFAULT_VERSION,
  collectiveXVersionLabel,
  type CollectiveXCohort,
  type CollectiveXMode,
  type CollectiveXOperation,
  type CollectiveXPercentile,
  type CollectiveXPhase,
  type CollectiveXScale,
  type CollectiveXSeries,
  type CollectiveXVersion,
  type CollectiveXXAxis,
  type CollectiveXYAxis,
} from './types';

type EvidenceScope = 'controlled' | 'diagnostic';
type CollectiveXTab = 'results' | 'decisions' | 'evidence';
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
const TAB_VALUES: CollectiveXTab[] = ['results', 'decisions', 'evidence'];
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
    evidenceScope: { controlled: 'Controlled', diagnostic: 'Diagnostics' },
    mode: { normal: 'Normal', 'low-latency': 'Low latency' },
    fabricScope: { all: 'All', 'scale-up': 'Scale-up', 'scale-out': 'Scale-out' },
    topologyScope: { 'scale-up': 'Scale-up', 'scale-out': 'Scale-out' },
    payloadUnit: { 'token-rank': 'Token-rank payload', 'token-expert': 'Token-expert payload' },
    combineSemantics: {
      'activation-only': 'Activation-only combine',
      'gate-weighted': 'Gate-weighted combine',
    },
    channel: { 'dev-latest': 'Published', 'latest-attempt': 'Latest attempt' },
    tabs: { results: 'EP results', decisions: 'Decisions', evidence: 'Evidence' },
    promotion: { promoted: 'Promoted', diagnostic: 'diagnostic', quarantined: 'quarantined' },
    all: 'All',
    loading: 'Resolving CollectiveX publication...',
    unavailable: 'CollectiveX publication unavailable',
    storeUnavailable: 'The isolated publication store is not attached to this deployment.',
    artifactSourceUnavailable: 'The GitHub Actions publication source is temporarily unavailable.',
    promotedUnavailable: 'No promoted CollectiveX publication is available yet.',
    attemptUnavailable: 'No CollectiveX attempt has been published yet.',
    failedValidation: 'The publication failed validation.',
    publicationAria: 'CollectiveX publication channel',
    retry: 'Retry',
    description:
      'Expert-parallel latency and payload rate across collective libraries and systems.',
    publicationReason: 'Publication reason',
    source: 'Source',
    methodology: 'Methodology',
    sourceUnavailable: 'Source unavailable because publication revisions differ',
    refresh: 'Refresh',
    decisionSeries: 'Decision series',
    controlledCohorts: 'Controlled cohorts',
    terminalCases: 'Terminal cases',
    retainedAttempts: 'Retained attempts',
    allocations: 'Allocations',
    publishedUtc: 'Published (UTC)',
    publication: 'Publication',
    version: 'Benchmark version',
    runControl: 'Run',
    loadRuns: 'Load runs',
    loadingRuns: 'Loading runs…',
    latestPublished: 'Latest published',
    coverageFull: 'Full',
    coveragePartial: 'Partial',
    evidence: 'Evidence',
    evidenceAria: 'CollectiveX evidence scope',
    modeControl: 'Mode',
    modeAria: 'CollectiveX mode',
    epControl: 'EP degree',
    fabricScopeControl: 'Fabric scope',
    fabricScopeAria: 'CollectiveX fabric scope',
    controlledCohort: 'Controlled cohort',
    diagnosticCohort: 'Diagnostic cohort',
    cohortKind: {
      library: 'Library comparisons',
      chip: 'Platform comparisons',
      system: 'Reference-system comparisons',
      routing: 'Routing sensitivities',
    },
    searchCohorts: 'Search cohorts...',
    searchCohortsAria: 'Search CollectiveX cohorts',
    clearCohortSearch: 'Clear cohort search',
    noMatchingCohorts: 'No matching cohorts',
    allDiagnosticEvidence: 'All diagnostic evidence',
    noEligibleCohort: 'No eligible cohort',
    allDiagnostics: 'All diagnostics',
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
    payloadRateOption: 'Payload rate at latency percentile',
    yScale: 'Y scale',
    yScaleAria: 'CollectiveX y scale',
    noControlledSeries: 'No decision-grade series in this cohort and phase.',
    noDiagnosticSeries: 'No diagnostic series match these filters.',
    diagnosticEvidence: 'Diagnostic evidence',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
    diagnosticWarning:
      'Diagnostic evidence is excluded from rankings, recommendations, and regression claims.',
    excluded: 'Excluded',
    stableOrdering: 'stable ordering passed',
    unstableOrdering: 'stable ordering not passed',
    samplingContract: (trials: number, iterations: number, samples: number, warmups: number) =>
      `${trials}×${iterations} = ${samples} samples/component · ${warmups} synchronized warmups`,
    selectedFactorsDiffer: 'Selected factors differ',
    differenceLabels: {
      model: 'model',
      suite: 'suite',
      'publication tier': 'publication tier',
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
    isolatedNote: 'Isolated sum is derived and never drives throughput or recommendations.',
    payloadNote:
      'Payload rate is derived at the selected latency percentile and is not physical link bandwidth.',
    unpromotedEvidence: 'Unpromoted evidence',
    unpromotedNote: 'Latest-attempt evidence does not drive rankings or recommendations.',
    provenance: 'Publication provenance',
    channelLabel: 'Channel',
    datasetDigest: 'Dataset SHA-256',
    matrixDigest: 'Matrix SHA-256',
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
    evidenceScope: { controlled: '受控对比', diagnostic: '诊断' },
    mode: { normal: '常规', 'low-latency': '低延迟' },
    fabricScope: { all: '全部', 'scale-up': '域内', 'scale-out': '跨域' },
    topologyScope: { 'scale-up': '域内（scale-up）', 'scale-out': '跨域（scale-out）' },
    payloadUnit: { 'token-rank': 'Token-rank 载荷', 'token-expert': 'Token-expert 载荷' },
    combineSemantics: {
      'activation-only': '仅激活值合并',
      'gate-weighted': '门控加权合并',
    },
    channel: { 'dev-latest': '已发布', 'latest-attempt': '最新尝试' },
    tabs: { results: 'EP 结果', decisions: '决策', evidence: '证据' },
    promotion: { promoted: '已发布', diagnostic: '诊断', quarantined: '已隔离' },
    all: '全部',
    loading: '正在解析 CollectiveX 发布数据...',
    unavailable: 'CollectiveX 发布数据不可用',
    storeUnavailable: '此部署未连接隔离式 CollectiveX 发布存储。',
    artifactSourceUnavailable: 'GitHub Actions 发布数据源暂时不可用。',
    promotedUnavailable: '尚无已发布的 CollectiveX 数据。',
    attemptUnavailable: '尚无 CollectiveX 运行尝试。',
    failedValidation: '发布数据未通过验证。',
    publicationAria: 'CollectiveX 发布通道',
    retry: '重试',
    description: '对比集合通信库与系统的专家并行（EP）延迟和逻辑载荷速率。',
    publicationReason: '发布状态原因',
    source: '源代码',
    methodology: '测试方法',
    sourceUnavailable: '发布数据包含不同代码版本，无法提供单一源代码链接',
    refresh: '刷新',
    decisionSeries: '决策级序列',
    controlledCohorts: '受控队列',
    terminalCases: '已终结用例',
    retainedAttempts: '保留尝试',
    allocations: '独立分配',
    publishedUtc: '发布时间（UTC）',
    publication: '发布数据',
    version: '基准版本',
    // English-only per the repository's temporary language override (no new
    // Chinese text); these mirror the en values until the override is lifted.
    runControl: 'Run',
    loadRuns: 'Load runs',
    loadingRuns: 'Loading runs…',
    latestPublished: 'Latest published',
    coverageFull: 'Full',
    coveragePartial: 'Partial',
    evidence: '证据范围',
    evidenceAria: 'CollectiveX 证据范围',
    modeControl: '模式',
    modeAria: 'CollectiveX 模式',
    epControl: 'EP 并行度',
    fabricScopeControl: '互联范围',
    fabricScopeAria: 'CollectiveX 互联范围',
    controlledCohort: '受控队列',
    diagnosticCohort: '诊断队列',
    cohortKind: {
      library: '通信库对比',
      chip: '平台对比',
      system: '参考系统对比',
      routing: '路由敏感性',
    },
    searchCohorts: '搜索队列…',
    searchCohortsAria: '搜索 CollectiveX 队列',
    clearCohortSearch: '清除队列搜索',
    noMatchingCohorts: '无匹配队列',
    allDiagnosticEvidence: '全部诊断证据',
    noEligibleCohort: '无符合条件的队列',
    allDiagnostics: '全部诊断证据',
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
    payloadRateOption: '延迟分位点对应的逻辑载荷速率',
    yScale: 'Y 轴刻度',
    yScaleAria: 'CollectiveX Y 轴刻度',
    noControlledSeries: '该队列和阶段没有决策级序列。',
    noDiagnosticSeries: '没有符合当前筛选条件的诊断序列。',
    diagnosticEvidence: '诊断证据',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
    diagnosticWarning: '诊断证据不会用于排名、推荐或回归结论。',
    excluded: '排除原因',
    stableOrdering: '排名顺序稳定性已通过',
    unstableOrdering: '排名顺序稳定性未通过',
    samplingContract: (trials: number, iterations: number, samples: number, warmups: number) =>
      `${trials}×${iterations} = 每个分项 ${samples} 个样本 · ${warmups} 次同步预热`,
    selectedFactorsDiffer: '所选配置存在差异',
    differenceLabels: {
      model: '模型',
      suite: '测试套件',
      'publication tier': '发布级别',
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
    isolatedNote: '分项之和为派生值，不用于计算吞吐量或生成推荐。',
    payloadNote: '逻辑载荷速率按所选延迟分位点派生，不代表物理链路带宽。',
    unpromotedEvidence: '未发布证据',
    unpromotedNote: '最新尝试中的证据不会用于排名或推荐。',
    provenance: '发布数据溯源',
    channelLabel: '通道',
    datasetDigest: '数据集 SHA-256',
    matrixDigest: '矩阵 SHA-256',
    sourceBundles: '源产物包',
  },
} as const;
const PROMOTION_CLASSES = {
  promoted: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  quarantined: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
};
const COHORT_KIND_ORDER: Record<CollectiveXCohort['kind'], number> = {
  library: 0,
  chip: 1,
  system: 2,
  routing: 3,
  'dispatch-precision': 4,
  'combine-precision': 5,
  'precision-pair': 6,
};

function precisionCohortKindLabel(kind: CollectiveXCohort['kind']): string | null {
  if (kind === 'dispatch-precision') return 'Dispatch precision';
  if (kind === 'combine-precision') return 'Combine precision';
  if (kind === 'precision-pair') return 'Precision pairs';
  return null;
}

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

function cohortSeries(cohort: CollectiveXCohort | null, series: CollectiveXSeries[]) {
  if (cohort === null) return [];
  const ids = new Set(cohort.series_ids);
  return series.filter((item) => ids.has(item.series_id));
}

function publicationSourceSha(series: CollectiveXSeries[]): string | null {
  const sourceSha = series[0]?.build.source_sha;
  return sourceSha && series.every((item) => item.build.source_sha === sourceSha)
    ? sourceSha
    : null;
}

export default function CollectiveXDisplay() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [version, setVersion] = useState<CollectiveXVersion>(COLLECTIVEX_DEFAULT_VERSION);
  // JIT run picker: `runsRequested` gates the eligible-run listing behind the
  // "Load runs" button; `selectedDigest` (null = the dev-latest channel) pins
  // the view to one specific published run's dataset.
  const [runsRequested, setRunsRequested] = useState(false);
  const [selectedDigest, setSelectedDigest] = useState<string | null>(null);
  const channelQuery = useCollectiveX('dev-latest', version);
  const runsQuery = useCollectiveXRuns(version, runsRequested);
  const runQuery = useCollectiveXRun(version, selectedDigest);
  // A pinned run overrides the dev-latest channel; both resolve to the same
  // { channel, dataset, digest } shape the rest of the view consumes.
  const activeQuery = selectedDigest === null ? channelQuery : runQuery;
  const { data, error, isLoading, isFetching } = activeQuery;
  const [tab, setTab] = useState<CollectiveXTab>('results');
  const [evidenceScope, setEvidenceScope] = useState<EvidenceScope>('controlled');
  const [mode, setMode] = useState<CollectiveXMode>('normal');
  const [epSize, setEpSize] = useState(8);
  const [fabricScope, setFabricScope] = useState<CollectiveXFabricScope>('all');
  const [controlledCohortId, setControlledCohortId] = useState('');
  const [diagnosticCohortId, setDiagnosticCohortId] = useState('all');
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
  const evidenceScopeOptions: SegmentedToggleOption<EvidenceScope>[] = [
    { value: 'controlled', label: t.evidenceScope.controlled },
    { value: 'diagnostic', label: t.evidenceScope.diagnostic },
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
        value: run.digest,
        label: `#${run.run_id} · ${
          run.coverage_scope === 'partial'
            ? `${t.coveragePartial} · ${run.covered_skus.length} SKU`
            : t.coverageFull
        } · ${formatDate(run.generated_at, locale)}`,
      })),
    ],
    [locale, runList, t.coverageFull, t.coveragePartial, t.latestPublished],
  );
  // Runs are per-version; changing the version drops any pinned run and folds
  // the picker back to its JIT button.
  useEffect(() => {
    setSelectedDigest(null);
    setRunsRequested(false);
  }, [version]);
  // If a refreshed listing no longer carries the pinned run, fall back to the
  // dev-latest channel rather than a dangling digest.
  useEffect(() => {
    if (
      selectedDigest !== null &&
      runsQuery.data &&
      !runsQuery.data.some((run) => run.digest === selectedDigest)
    ) {
      setSelectedDigest(null);
    }
  }, [runsQuery.data, selectedDigest]);
  const tabOptions: { value: CollectiveXTab; label: string }[] = [
    { value: 'results', label: t.tabs.results },
    { value: 'decisions', label: t.tabs.decisions },
    { value: 'evidence', label: t.tabs.evidence },
  ];

  const dataset = data?.dataset;
  const sourceSha = useMemo(() => publicationSourceSha(dataset?.series ?? []), [dataset?.series]);
  const seriesById = useMemo(
    () => new Map(dataset?.series.map((item) => [item.series_id, item])),
    [dataset?.series],
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
  const seriesSelection = useMemo(
    () => ({ mode, epSize, phase, fabricScope }),
    [epSize, fabricScope, mode, phase],
  );
  const eligibleCohorts = useMemo(
    () =>
      dataset?.cohorts
        .filter((item) => item.eligibility.decision_grade)
        .toSorted(
          (left, right) =>
            COHORT_KIND_ORDER[left.kind] - COHORT_KIND_ORDER[right.kind] ||
            left.label.localeCompare(right.label),
        ) ?? [],
    [dataset?.cohorts],
  );
  const allDiagnosticCohorts = useMemo(
    () =>
      dataset?.cohorts
        .filter((item) => !item.eligibility.decision_grade)
        .toSorted((left, right) => left.label.localeCompare(right.label)) ?? [],
    [dataset?.cohorts],
  );
  const controlledCohorts = useMemo(
    () =>
      eligibleCohorts.filter((cohort) =>
        cohortMatchesSelection(cohort, seriesById, seriesSelection),
      ),
    [eligibleCohorts, seriesById, seriesSelection],
  );
  const diagnosticCohorts = useMemo(
    () =>
      allDiagnosticCohorts.filter((cohort) =>
        cohortMatchesSelection(cohort, seriesById, seriesSelection),
      ),
    [allDiagnosticCohorts, seriesById, seriesSelection],
  );
  const selectedControlledCohort = useMemo(
    () =>
      controlledCohorts.find((item) => item.cohort_id === controlledCohortId) ??
      controlledCohorts[0] ??
      null,
    [controlledCohortId, controlledCohorts],
  );
  const selectedDiagnosticCohort = useMemo(
    () => diagnosticCohorts.find((item) => item.cohort_id === diagnosticCohortId) ?? null,
    [diagnosticCohortId, diagnosticCohorts],
  );
  const cohortGroups = useMemo<SearchableSelectGroup[]>(() => {
    const cohorts = evidenceScope === 'controlled' ? controlledCohorts : diagnosticCohorts;
    const groups = (Object.keys(COHORT_KIND_ORDER) as CollectiveXCohort['kind'][]).flatMap(
      (kind) => {
        const options = cohorts
          .filter((item) => item.kind === kind)
          .map((item) => ({
            value: item.cohort_id,
            label: collectiveXCohortLabel(item, seriesById, locale),
          }));
        return options.length === 0
          ? []
          : [
              {
                label: `${precisionCohortKindLabel(kind) ?? t.cohortKind[kind as keyof typeof t.cohortKind]} (${options.length})`,
                options,
              },
            ];
      },
    );
    return evidenceScope === 'controlled'
      ? groups
      : [
          {
            label: t.diagnosticEvidence,
            options: [{ value: 'all', label: t.allDiagnosticEvidence }],
          },
          ...groups,
        ];
  }, [controlledCohorts, diagnosticCohorts, evidenceScope, locale, seriesById, t]);
  useEffect(() => {
    if (selectedControlledCohort && selectedControlledCohort.cohort_id !== controlledCohortId) {
      setControlledCohortId(selectedControlledCohort.cohort_id);
    }
  }, [controlledCohortId, selectedControlledCohort]);

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

  const diagnosticSeries = useMemo(() => {
    if (!dataset) return [];
    const diagnosticMembers = new Set(allDiagnosticCohorts.flatMap((cohort) => cohort.series_ids));
    return dataset.series.filter(
      (item) => item.status === 'diagnostic' || diagnosticMembers.has(item.series_id),
    );
  }, [allDiagnosticCohorts, dataset]);
  const filteredDiagnosticSeries = useMemo(
    () => diagnosticSeries.filter((item) => seriesMatchesSelection(item, seriesSelection)),
    [diagnosticSeries, seriesSelection],
  );
  const skuOptions = useMemo(
    () => ['all', ...new Set(filteredDiagnosticSeries.map((item) => item.system.sku))],
    [filteredDiagnosticSeries],
  );
  const backendOptions = useMemo(
    () => ['all', ...new Set(filteredDiagnosticSeries.map((item) => item.backend.label))],
    [filteredDiagnosticSeries],
  );
  const routingOptions = useMemo(
    () => [
      'all',
      ...new Set(
        filteredDiagnosticSeries.map(
          (item) => `${item.workload.routing}${item.workload.eplb ? '+eplb' : ''}`,
        ),
      ),
    ],
    [filteredDiagnosticSeries],
  );
  useEffect(() => {
    if (
      diagnosticCohortId !== 'all' &&
      !diagnosticCohorts.some((cohort) => cohort.cohort_id === diagnosticCohortId)
    ) {
      setDiagnosticCohortId('all');
    }
    if (!skuOptions.includes(sku)) setSku('all');
    if (!backendOptions.includes(backend)) setBackend('all');
    if (!routingOptions.includes(routing)) setRouting('all');
  }, [
    backend,
    backendOptions,
    diagnosticCohortId,
    diagnosticCohorts,
    routing,
    routingOptions,
    sku,
    skuOptions,
  ]);
  const scopedSeries = useMemo(() => {
    if (!dataset) return [];
    if (evidenceScope === 'controlled') {
      return cohortSeries(selectedControlledCohort, dataset.series);
    }
    if (selectedDiagnosticCohort) {
      return cohortSeries(selectedDiagnosticCohort, dataset.series);
    }
    return filteredDiagnosticSeries.filter(
      (item) =>
        (sku === 'all' || item.system.sku === sku) &&
        (backend === 'all' || item.backend.label === backend) &&
        (routing === 'all' ||
          `${item.workload.routing}${item.workload.eplb ? '+eplb' : ''}` === routing),
    );
  }, [
    backend,
    dataset,
    evidenceScope,
    filteredDiagnosticSeries,
    routing,
    selectedControlledCohort,
    selectedDiagnosticCohort,
    sku,
  ]);
  const phaseSeries = useMemo(
    () => scopedSeries.filter((item) => item.phase === phase),
    [phase, scopedSeries],
  );

  useEffect(() => {
    setActiveSeriesIds(new Set(phaseSeries.map((item) => item.series_id)));
  }, [phaseSeries]);

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
        title: `${item.status} · ${item.mode} · EP${item.system.ep_size} · ${item.system.scope} · ${collectiveXTopologyLabel(item.system)} · ${item.workload.workload_id}`,
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
  const warnings = useMemo(
    () => (evidenceScope === 'diagnostic' ? comparisonDifferences(activeSeries) : []),
    [activeSeries, evidenceScope],
  );
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
      .map((item) => t.payloadUnit[item])
      .join(' / ');
    const combine = [...new Set(phaseSeries.map((item) => item.measurement.combine_semantics))]
      .map((item) => t.combineSemantics[item])
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
        ? t.artifactSourceUnavailable
        : availabilityReason === 'channel-unavailable'
          ? t.promotedUnavailable
          : error instanceof Error
            ? error.message
            : t.failedValidation;
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
          {selectedDigest !== null && (
            <Button
              variant="outline"
              data-testid="collectivex-error-latest"
              onClick={() => setSelectedDigest(null)}
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

  return (
    <section data-testid="collectivex-display" className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">CollectiveX</h1>
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${PROMOTION_CLASSES[dataset.promotion.status]}`}
              >
                {t.promotion[dataset.promotion.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
            {dataset.promotion.reason && (
              <p
                data-testid="collectivex-promotion-reason"
                className="mt-2 text-sm text-destructive"
              >
                {t.publicationReason}: {collectiveXReasonLabel(dataset.promotion.reason, locale)}
              </p>
            )}
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
                title={t.sourceUnavailable}
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
          <Stat
            value={dataset.series.filter((item) => item.status === 'decision-grade').length}
            label={t.decisionSeries}
          />
          <Stat value={eligibleCohorts.length} label={t.controlledCohorts} />
          <Stat
            value={`${dataset.promotion.terminal_cases}/${dataset.promotion.requested_cases}`}
            label={t.terminalCases}
          />
          <Stat value={dataset.attempts.length} label={t.retainedAttempts} />
          <Stat value={dataset.promotion.allocation_ids.length} label={t.allocations} />
          <Stat value={formatDate(dataset.generated_at, locale)} label={t.publishedUtc} compact />
        </div>
      </Card>

      <CollectiveXInventory dataset={dataset} />

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
                  value={selectedDigest ?? 'latest'}
                  onValueChange={(next) => {
                    setSelectedDigest(next === 'latest' ? null : next);
                    track('collectivex_run_selected', { version, run: next });
                  }}
                >
                  <SelectTrigger data-testid="collectivex-run-select" className="min-w-0 w-full">
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
          <ControlGroup label={t.evidence}>
            <SegmentedToggle
              value={evidenceScope}
              options={evidenceScopeOptions}
              onValueChange={(value) => {
                setEvidenceScope(value);
                track('collectivex_evidence_scope_changed', { scope: value });
              }}
              ariaLabel={t.evidenceAria}
              testId="collectivex-scope-toggle"
            />
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
          <div className="min-w-0 sm:col-span-2">
            <SearchableSelectControl
              label={evidenceScope === 'controlled' ? t.controlledCohort : t.diagnosticCohort}
              testId="collectivex-cohort-select"
              value={
                evidenceScope === 'controlled'
                  ? (selectedControlledCohort?.cohort_id ?? '')
                  : diagnosticCohortId
              }
              onChange={(value) => {
                if (evidenceScope === 'controlled') setControlledCohortId(value);
                else {
                  setDiagnosticCohortId(value);
                  if (value !== 'all') {
                    setSku('all');
                    setBackend('all');
                    setRouting('all');
                  }
                }
              }}
              groups={cohortGroups}
              placeholder={evidenceScope === 'controlled' ? t.noEligibleCohort : t.allDiagnostics}
              searchPlaceholder={t.searchCohorts}
              searchAriaLabel={t.searchCohortsAria}
              clearSearchLabel={t.clearCohortSearch}
              noResultsLabel={t.noMatchingCohorts}
            />
          </div>
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
          {evidenceScope === 'diagnostic' && diagnosticCohortId === 'all' && (
            <>
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
            </>
          )}
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

      <Tabs value={tab} onValueChange={handleTab} className="gap-4">
        <TabsList data-testid="collectivex-tabs" className="overflow-x-auto">
          {tabOptions.map((item) => (
            <TabsTrigger key={item.value} value={item.value} id={`tab-${item.value}`}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="results" className="space-y-4">
          {phaseSeries.length === 0 && (
            <Card data-testid="collectivex-empty-state" className="py-4">
              <p className="text-sm text-muted-foreground">
                {evidenceScope === 'controlled' ? t.noControlledSeries : t.noDiagnosticSeries}
              </p>
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
                    {evidenceScope === 'controlled'
                      ? selectedControlledCohort &&
                        collectiveXCohortLabel(selectedControlledCohort, seriesById, locale)
                      : selectedDiagnosticCohort
                        ? collectiveXCohortLabel(selectedDiagnosticCohort, seriesById, locale)
                        : t.diagnosticEvidence}{' '}
                    ·{' '}
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
            {evidenceScope === 'diagnostic' && (
              <p
                data-testid="collectivex-diagnostic-warning"
                className="mt-3 border-l-2 border-amber-500 bg-amber-500/5 py-1 pl-2 text-xs text-muted-foreground"
              >
                {t.diagnosticWarning}
              </p>
            )}
            {evidenceScope === 'diagnostic' && selectedDiagnosticCohort && (
              <p
                data-testid="collectivex-diagnostic-cohort-reasons"
                className="mt-2 text-xs text-muted-foreground"
              >
                {t.excluded}:{' '}
                {selectedDiagnosticCohort.eligibility.reasons
                  .map((reason) => collectiveXReasonLabel(reason, locale))
                  .join(', ')}
                .
              </p>
            )}
            {evidenceScope === 'controlled' && selectedControlledCohort && (
              <p
                data-testid="collectivex-controlled-stability"
                className="mt-2 text-xs text-muted-foreground"
              >
                {selectedControlledCohort.eligibility.stable_ordering
                  ? t.stableOrdering
                  : t.unstableOrdering}
                .
              </p>
            )}
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
        <TabsContent value="decisions" className="space-y-4">
          <CollectiveXDecisionTables dataset={dataset} cohort={selectedControlledCohort} />
        </TabsContent>
        <TabsContent value="evidence" className="space-y-4">
          <CollectiveXCoverageTable coverage={dataset.coverage} />
          <CollectiveXAttemptTable attempts={dataset.attempts} coverage={dataset.coverage} />
          <Card data-testid="collectivex-provenance">
            <h2 className="text-lg font-semibold">{t.provenance}</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Provenance label={t.channelLabel} value={data.channel.channel} />
              <Provenance label={t.datasetDigest} value={data.digest} mono />
              <Provenance label={t.matrixDigest} value={dataset.promotion.matrix_id ?? '-'} mono />
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

function SearchableSelectControl({
  label,
  testId,
  value,
  groups,
  onChange,
  placeholder,
  searchPlaceholder,
  searchAriaLabel,
  clearSearchLabel,
  noResultsLabel,
}: {
  label: string;
  testId: string;
  value: string;
  groups: SearchableSelectGroup[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  clearSearchLabel: string;
  noResultsLabel: string;
}) {
  return (
    <ControlGroup label={label}>
      <SearchableSelect
        groups={groups}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        triggerTestId={testId}
        searchPlaceholder={searchPlaceholder}
        searchAriaLabel={searchAriaLabel}
        clearSearchLabel={clearSearchLabel}
        noResultsLabel={noResultsLabel}
        trackPrefix="collectivex_cohort"
      />
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

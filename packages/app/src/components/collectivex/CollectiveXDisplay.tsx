'use client';

import { BookOpen, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import {
  useCollectiveXRunDatasets,
  useCollectiveXRuns,
  useDeleteCollectiveXRun,
} from '@/hooks/api/use-collectivex';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { CollectiveXChart } from './CollectiveXChart';
import { CollectiveXInventory } from './CollectiveXInventory';
import { CollectiveXKvSection } from './CollectiveXKvSection';
import { CollectiveXRunsTable } from './CollectiveXRunsTable';
import {
  collectiveXColorKey,
  collectiveXLegendLabel,
  collectiveXRunDasharray,
  collectiveXSeriesForRun,
  collectiveXTopologyLabel,
  seriesMatchesSelection,
  type CollectiveXSeriesSelection,
} from './data';
import {
  COLLECTIVEX_VERSIONS,
  COLLECTIVEX_DEFAULT_VERSION,
  collectiveXVersionLabel,
  type CollectiveXMode,
  type CollectiveXOperation,
  type CollectiveXPercentile,
  type CollectiveXPhase,
  type CollectiveXPrecision,
  type CollectiveXRunSeries,
  type CollectiveXVersion,
  type CollectiveXYAxis,
} from './types';

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
const STRINGS = {
  en: {
    operation: {
      dispatch: 'Dispatch',
      combine: 'Combine',
      roundtrip: 'Round trip',
    },
    operationHeading: {
      dispatch: 'Dispatch',
      combine: 'Combine',
      roundtrip: 'Round trip (measured)',
    },
    phase: { decode: 'Decode', prefill: 'Prefill' },
    phaseValue: { decode: 'decode', prefill: 'prefill' },
    mode: { normal: 'Normal', 'low-latency': 'Low-latency' },
    precision: { bf16: 'BF16', fp8: 'FP8' },
    yAxis: {
      latency: 'Latency',
      'tokens-per-second': 'Token rate at selected latency percentile',
      'payload-rate': 'Payload bandwidth at selected latency percentile (per chip)',
    },
    all: 'All',
    loading: 'Resolving CollectiveX run...',
    unavailable: 'CollectiveX run unavailable',
    loadError: 'The CollectiveX dataset failed to load.',
    retry: 'Retry',
    description:
      'Expert-parallel latency and payload rate across collective libraries and systems.',
    source: 'Source',
    methodology: 'Methodology',
    refresh: 'Refresh',
    seriesCount: 'Series',
    measuredCases: 'Measured cases',
    terminalCases: 'Terminal cases',
    publishedUtc: 'Published (UTC)',
    version: 'Benchmark version',
    runsHeading: 'Runs',
    runsDescription:
      'Every stored run for the selected benchmark version. Check one or more runs to compare them in the explorer.',
    runsShown: 'Runs shown',
    selectRuns: 'Select one or more runs from the table to show their data.',
    selectedRunsFailed: 'One or more selected runs failed to load.',
    runControl: 'Run',
    loadRuns: 'Load runs',
    loadingRuns: 'Loading runs…',
    latestPublished: 'Latest run',
    epControl: 'EP degree',
    operationControl: 'Operation',
    phaseControl: 'Phase',
    phaseAria: 'CollectiveX phase',
    modeControl: 'Kernel mode',
    modeAria: 'CollectiveX kernel mode',
    precisionControl: 'Precision',
    precisionAria: 'CollectiveX precision',
    latencyPercentile: 'Latency percentile',
    percentileAria: 'CollectiveX percentile',
    sku: 'SKU',
    backend: 'Backend',
    yAxisControl: 'Y axis',
    tokenRateOption: 'Token rate at latency percentile',
    noSeries: 'No measured series match these filters.',
    resetFilter: 'Reset filter',
    payloadNote:
      'Activation-data rate is derived at the selected latency percentile and is not physical link bandwidth.',
    payloadBandwidthNote:
      'Payload bandwidth is the full logical payload (incl. FP8 scale bytes) ÷ latency, per chip — a derived rate over logical bytes, not physical link bandwidth. The tooltip β/α is a least-squares fit of latency vs bytes across the ladder (β = per-chip bandwidth term, α = fixed overhead).',
    deleteRun: 'Delete run',
    deleteShownRuns: 'Delete shown runs',
    deletingShownRuns: 'Deleting shown runs…',
    deleteConfirm: (id: string) =>
      `Delete run #${id} from the dashboard database? This cannot be undone.`,
    deleteShownConfirm: (ids: readonly string[]) =>
      `Delete ${ids.length} shown ${ids.length === 1 ? 'run' : 'runs'} from the dashboard database? This cannot be undone.\n\n${ids.map((id) => `#${id}`).join('\n')}`,
    deleteTokenPrompt: 'Admin token required to delete runs:',
    deleteUnauthorized: 'Invalid admin token.',
    deleteFailed: 'Deleting the run failed. Try again.',
    deleteShownFailed: (deleted: number, total: number) =>
      `Deleted ${deleted} of ${total} shown runs before the operation failed. Try again.`,
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
    precision: { bf16: 'BF16', fp8: 'FP8' },
    scale: { log: '对数', linear: '线性' },
    xAxis: {
      'tokens-per-rank': '每 rank 源 token 数',
      'global-tokens': '全局源 token 数',
    },
    yAxis: {
      latency: '延迟',
      'tokens-per-second': '所选延迟分位点的 token 速率',
      'payload-rate': '所选延迟分位点的载荷带宽（每 Chip）',
    },
    mode: { normal: '常规', 'low-latency': '低延迟' },
    fabricScope: { all: '全部', 'scale-up': '域内', 'scale-out': '跨域' },
    topologyScope: { 'scale-up': '域内（scale-up）', 'scale-out': '跨域（scale-out）' },
    payloadUnit: { 'token-rank': 'Token-rank 载荷', 'token-expert': 'Token-expert 载荷' },
    combineSemantics: {
      'activation-only': '仅激活值合并',
      'gate-weighted': '门控加权合并',
    },
    tabs: {
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
    // English placeholders per the repository's temporary language override
    // (no new Chinese translations); localize when the override lifts.
    runsHeading: 'Runs',
    runsDescription:
      'Every stored run for the selected benchmark version. Check one or more runs to compare them in the explorer.',
    runsShown: 'Runs shown',
    selectRuns: 'Select one or more runs from the table to show their data.',
    selectedRunsFailed: 'One or more selected runs failed to load.',
    runControl: 'Run',
    loadRuns: 'Load runs',
    loadingRuns: 'Loading runs…',
    latestPublished: 'Latest run',
    modeControl: '模式',
    modeAria: 'CollectiveX 模式',
    epControl: 'EP 并行度',
    fabricScopeControl: '互联范围',
    fabricScopeAria: 'CollectiveX 互联范围',
    operationControl: '操作',
    phaseControl: '阶段',
    phaseAria: 'CollectiveX 阶段',
    precisionControl: '精度',
    precisionAria: 'CollectiveX 精度',
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
    payloadBandwidthNote:
      '载荷带宽为完整逻辑载荷（含 FP8 缩放字节）÷ 延迟（每 Chip），是基于逻辑字节的派生速率，不代表物理链路带宽。工具提示中的 β/α 为延迟对字节在整个梯度上的最小二乘拟合（β = 每 Chip 带宽项，α = 固定开销）。',
    provenance: '发布数据溯源',
    runLabel: 'Run',
    attemptLabel: 'Attempt',
    matrixLabel: 'Matrix',
    sourceBundles: '源产物包',
    deleteRun: '删除运行',
    deleteShownRuns: '删除已显示的运行',
    deletingShownRuns: '正在删除已显示的运行…',
    deleteConfirm: (id: string) => `从仪表板数据库中删除运行 #${id}？此操作无法撤销。`,
    deleteShownConfirm: (ids: readonly string[]) =>
      `从仪表板数据库中删除当前显示的 ${ids.length} 个运行？此操作无法撤销。\n\n${ids.map((id) => `#${id}`).join('\n')}`,
    deleteTokenPrompt: '删除运行需要管理员令牌：',
    deleteUnauthorized: '管理员令牌无效。',
    deleteFailed: '删除运行失败，请重试。',
    deleteShownFailed: (deleted: number, total: number) =>
      `操作失败前已删除 ${total} 个已显示运行中的 ${deleted} 个，请重试。`,
  },
} as const;
const CONCLUSION_CLASSES: Record<string, string> = {
  success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failure: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
};
const CONCLUSION_FALLBACK_CLASS =
  'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
// Remembered admin bearer token for run deletion; cleared on a 401 so a
// rotated secret re-prompts instead of failing silently forever.
const ADMIN_TOKEN_STORAGE_KEY = 'collectivex-admin-token';

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

export default function CollectiveXDisplay() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [version, setVersion] = useState<CollectiveXVersion>(COLLECTIVEX_DEFAULT_VERSION);
  const [visibleRunIds, setVisibleRunIds] = useState<Set<string>>(new Set());
  const [bulkDeletingRunIds, setBulkDeletingRunIds] = useState<Set<string>>(new Set());
  const initializedVersionRef = useRef<CollectiveXVersion | null>(null);
  const runsQuery = useCollectiveXRuns(version);
  const runList = runsQuery.data?.runs ?? [];
  const orderedVisibleRunIds = useMemo(() => {
    const liveRunIds = new Set(runList.map((run) => run.run_id));
    return [...visibleRunIds].filter((runId) => liveRunIds.has(runId));
  }, [runList, visibleRunIds]);
  const runQueries = useCollectiveXRunDatasets(version, orderedVisibleRunIds);
  const datasets = useMemo(
    () => runQueries.flatMap((query) => (query.data ? [query.data] : [])),
    [runQueries],
  );
  const selectedRunIndexById = useMemo(
    () => new Map(orderedVisibleRunIds.map((runId, index) => [runId, index])),
    [orderedVisibleRunIds],
  );
  const combinedSeries = useMemo<CollectiveXRunSeries[]>(
    () =>
      datasets.flatMap((dataset) =>
        collectiveXSeriesForRun(
          dataset.series,
          dataset.run.run_id,
          selectedRunIndexById.get(dataset.run.run_id) ?? 0,
        ),
      ),
    [datasets, selectedRunIndexById],
  );
  const loadingRunIds = useMemo(
    () =>
      new Set(
        orderedVisibleRunIds.filter(
          (_runId, index) => runQueries[index]?.isLoading || runQueries[index]?.isFetching,
        ),
      ),
    [orderedVisibleRunIds, runQueries],
  );
  const selectedRunErrors = runQueries.filter((query) => query.error).length;
  const isFetching = runsQuery.isFetching || runQueries.some((query) => query.isFetching);
  const [epSize, setEpSize] = useState(8);
  const [operation, setOperation] = useState<CollectiveXOperation>('roundtrip');
  const [phase, setPhase] = useState<CollectiveXPhase>('decode');
  // Normal (throughput) kernels are the baseline; the availability effect
  // below falls back when a slice only measured low-latency kernels.
  const [modes, setModes] = useState<CollectiveXMode[]>(['normal']);
  // Prefer FP8 when the run measured it; the availability effect below falls
  // back to bf16 for runs (or EP/phase slices) without FP8 series.
  const [precision, setPrecision] = useState<CollectiveXPrecision>('fp8');
  const [percentile, setPercentile] = useState<CollectiveXPercentile>('p99');
  const [yAxis, setYAxis] = useState<CollectiveXYAxis>('latency');
  const [sku, setSku] = useState('all');
  const [backend, setBackend] = useState('all');
  const [activeSeriesIds, setActiveSeriesIds] = useState<Set<string>>(new Set());
  const [legendExpanded, setLegendExpanded] = useState(true);
  const operationOptions: SelectOption<CollectiveXOperation>[] = [
    { value: 'dispatch', label: t.operation.dispatch },
    { value: 'stage', label: 'Stage' },
    { value: 'combine', label: t.operation.combine },
    { value: 'roundtrip', label: t.operation.roundtrip },
  ];
  const versionOptions: SelectOption<CollectiveXVersion>[] = COLLECTIVEX_VERSIONS.map((value) => ({
    value,
    label: collectiveXVersionLabel(value),
  }));

  // Runs are per-version. Start each version on its newest run with measured
  // data so an incomplete newest sweep cannot blank the explorer.
  useEffect(() => {
    initializedVersionRef.current = null;
    setVisibleRunIds(new Set());
  }, [version]);

  useEffect(() => {
    if (!runsQuery.data || initializedVersionRef.current === version) return;
    if (runsQuery.data.runs.length === 0 && !runsQuery.data.discovery_complete) return;
    const initial =
      runsQuery.data.runs.find((run) => run.measured_cases > 0) ?? runsQuery.data.runs[0];
    setVisibleRunIds(initial ? new Set([initial.run_id]) : new Set());
    initializedVersionRef.current = version;
  }, [runsQuery.data, version]);

  // A deleted run disappears from both the table and the checked set after the
  // list refetch. Preserve deliberate "none checked" state.
  useEffect(() => {
    if (!runsQuery.data || initializedVersionRef.current !== version) return;
    const liveIds = new Set(runsQuery.data.runs.map((run) => run.run_id));
    setVisibleRunIds((previous) => {
      const next = new Set([...previous].filter((runId) => liveIds.has(runId)));
      return next.size === previous.size ? previous : next;
    });
  }, [runsQuery.data, version]);

  const availableEpSizes = useMemo(
    () => [...new Set(combinedSeries.map((item) => item.system.ep_size))].toSorted((a, b) => a - b),
    [combinedSeries],
  );
  const availablePhases = useMemo(
    () =>
      [
        ...new Set(
          combinedSeries.filter((item) => item.system.ep_size === epSize).map((item) => item.phase),
        ),
      ].toSorted((left, right) =>
        left === right ? 0 : left === 'decode' ? -1 : right === 'decode' ? 1 : 0,
      ),
    [combinedSeries, epSize],
  );
  const phaseOptions: SegmentedToggleOption<CollectiveXPhase>[] = availablePhases.map((value) => ({
    value,
    label: t.phase[value],
  }));
  const availableModes = useMemo(
    () =>
      [
        ...new Set(
          combinedSeries
            .filter((item) => item.system.ep_size === epSize && item.phase === phase)
            .map((item) => item.mode),
        ),
      ].toSorted((left, right) =>
        left === right ? 0 : left === 'normal' ? -1 : right === 'normal' ? 1 : 0,
      ),
    [combinedSeries, epSize, phase],
  );
  const modeOptions: SegmentedToggleOption<CollectiveXMode>[] = availableModes.map((value) => ({
    value,
    label: t.mode[value],
  }));
  const availablePrecisions = useMemo(
    () =>
      [
        ...new Set(
          combinedSeries
            .filter(
              (item) =>
                item.system.ep_size === epSize && item.phase === phase && modes.includes(item.mode),
            )
            .map((item) => item.precision),
        ),
      ].toSorted(),
    [combinedSeries, epSize, modes, phase],
  );
  const precisionOptions: SegmentedToggleOption<CollectiveXPrecision>[] = availablePrecisions.map(
    (value) => ({ value, label: t.precision[value] }),
  );
  useEffect(() => {
    if (availableEpSizes.length > 0 && !availableEpSizes.includes(epSize)) {
      setEpSize(availableEpSizes[0]);
    }
    if (availablePhases.length > 0 && !availablePhases.includes(phase)) {
      setPhase(availablePhases[0]);
    }
    // Keep the user's full multi-mode preference while availability cascades
    // through EP/phase changes. In particular, an intermediate empty slice
    // must not erase both selections; modes that become available again should
    // still be selected. Fall back only when a settled, non-empty slice has no
    // overlap with the preference at all.
    if (availableModes.length > 0 && !modes.some((mode) => availableModes.includes(mode))) {
      setModes([availableModes[0]]);
    }
    if (availablePrecisions.length > 0 && !availablePrecisions.includes(precision)) {
      setPrecision(availablePrecisions[0]);
    }
  }, [
    availableEpSizes,
    availableModes,
    availablePhases,
    availablePrecisions,
    epSize,
    modes,
    phase,
    precision,
  ]);
  const seriesSelection = useMemo<CollectiveXSeriesSelection>(
    () => ({ epSize, phase, modes, precision }),
    [epSize, modes, phase, precision],
  );
  // SKU and EP determine topology; V1 fixes routing. EP, phase, kernel mode,
  // and precision are needed before the library/SKU comparison filters.
  const matchedSeries = useMemo(
    () => combinedSeries.filter((item) => seriesMatchesSelection(item, seriesSelection)),
    [combinedSeries, seriesSelection],
  );
  const skuOptions = useMemo(
    () => ['all', ...new Set(matchedSeries.map((item) => item.system.sku))],
    [matchedSeries],
  );
  const backendOptions = useMemo(
    () => [
      'all',
      ...new Set(
        matchedSeries
          .filter((item) => sku === 'all' || item.system.sku === sku)
          .map((item) => item.backend),
      ),
    ],
    [matchedSeries, sku],
  );
  useEffect(() => {
    if (!skuOptions.includes(sku)) setSku('all');
    if (!backendOptions.includes(backend)) setBackend('all');
  }, [backend, backendOptions, sku, skuOptions]);
  const phaseSeries = useMemo(
    () =>
      matchedSeries.filter(
        (item) =>
          (sku === 'all' || item.system.sku === sku) &&
          (backend === 'all' || item.backend === backend),
      ),
    [backend, matchedSeries, sku],
  );
  const phaseSeriesKey = phaseSeries.map((item) => item.series_id).join('\u0000');

  useEffect(() => {
    setActiveSeriesIds(new Set(phaseSeriesKey ? phaseSeriesKey.split('\u0000') : []));
  }, [phaseSeriesKey]);

  const activeSeries = useMemo(
    () => phaseSeries.filter((item) => activeSeriesIds.has(item.series_id)),
    [activeSeriesIds, phaseSeries],
  );
  const colorKeys = useMemo(
    () => [...new Set(phaseSeries.map(collectiveXColorKey))],
    [phaseSeries],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast: false,
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
        label: collectiveXLegendLabel(item),
        color: colors[collectiveXColorKey(item)] ?? 'var(--muted-foreground)',
        lineDasharray: collectiveXRunDasharray(item.run_index),
        isActive: activeSeriesIds.has(item.series_id),
        title: `#${item.run_id} · EP${item.system.ep_size} · ${collectiveXTopologyLabel(item.system)}`,
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
  const handleRefresh = useCallback(() => {
    track('collectivex_data_refreshed');
    void runsQuery.refetch();
    for (const query of runQueries) void query.refetch();
  }, [runQueries, runsQuery]);
  const deleteRun = useDeleteCollectiveXRun();
  const deletingRunIds = useMemo(() => {
    if (bulkDeletingRunIds.size > 0) return bulkDeletingRunIds;
    const runId = deleteRun.isPending ? deleteRun.variables?.runId : undefined;
    return new Set(runId ? [runId] : []);
  }, [bulkDeletingRunIds, deleteRun.isPending, deleteRun.variables?.runId]);
  const handleVisibleRunChange = useCallback((runId: string, visible: boolean) => {
    setVisibleRunIds((previous) => {
      const next = new Set(previous);
      if (visible) next.add(runId);
      else next.delete(runId);
      return next;
    });
  }, []);
  const handleDeleteRun = useCallback(
    async (runId: string) => {
      track('collectivex_run_delete_prompted', { run: runId });
      if (!window.confirm(t.deleteConfirm(runId))) return;
      const stored = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
      const token = stored || (window.prompt(t.deleteTokenPrompt)?.trim() ?? '');
      if (!token) return;
      try {
        const deleted = await deleteRun.mutateAsync({ runId, token });
        if (!deleted) {
          localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
          track('collectivex_run_delete_failed', { run: runId, reason: 'unauthorized' });
          window.alert(t.deleteUnauthorized);
          return;
        }
        localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
        setVisibleRunIds((previous) => {
          const next = new Set(previous);
          next.delete(runId);
          return next;
        });
        track('collectivex_run_delete_confirmed', { run: runId });
      } catch {
        track('collectivex_run_delete_failed', { run: runId, reason: 'error' });
        window.alert(t.deleteFailed);
      }
    },
    [deleteRun, t],
  );
  const handleDeleteShownRuns = useCallback(async () => {
    const runIds = [...orderedVisibleRunIds];
    if (runIds.length === 0) return;
    track('collectivex_shown_runs_delete_prompted', { count: runIds.length, runs: runIds });
    if (!window.confirm(t.deleteShownConfirm(runIds))) return;
    const stored = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
    const token = stored || (window.prompt(t.deleteTokenPrompt)?.trim() ?? '');
    if (!token) return;

    setBulkDeletingRunIds(new Set(runIds));
    let deletedCount = 0;
    try {
      for (const runId of runIds) {
        const deleted = await deleteRun.mutateAsync({ runId, token });
        if (!deleted) {
          localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
          track('collectivex_shown_runs_delete_failed', {
            count: runIds.length,
            deleted: deletedCount,
            reason: 'unauthorized',
          });
          window.alert(t.deleteUnauthorized);
          return;
        }
        deletedCount += 1;
        setVisibleRunIds((previous) => {
          const next = new Set(previous);
          next.delete(runId);
          return next;
        });
      }
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      track('collectivex_shown_runs_delete_confirmed', {
        count: runIds.length,
        runs: runIds,
      });
    } catch {
      track('collectivex_shown_runs_delete_failed', {
        count: runIds.length,
        deleted: deletedCount,
        reason: 'error',
      });
      window.alert(t.deleteShownFailed(deletedCount, runIds.length));
    } finally {
      setBulkDeletingRunIds(new Set());
    }
  }, [deleteRun, orderedVisibleRunIds, t]);

  if (runsQuery.isLoading) {
    return (
      <Card data-testid="collectivex-loading" className="min-h-80 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t.loadingRuns}</p>
      </Card>
    );
  }
  if (runsQuery.error || !runsQuery.data) {
    const message = runsQuery.error instanceof Error ? runsQuery.error.message : t.loadError;
    return (
      <Card data-testid="collectivex-error" className="border-destructive">
        <h1 className="text-lg font-semibold">{t.unavailable}</h1>
        <p className="mt-2 text-sm text-destructive">{message}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-32">
            <SelectControl
              label={t.version}
              testId="collectivex-error-version-select"
              value={version}
              options={versionOptions}
              onChange={(value) => {
                setVersion(value);
                track('collectivex_version_changed', { version: value });
              }}
            />
          </div>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="size-4" />
            {t.retry}
          </Button>
        </div>
      </Card>
    );
  }
  const singleDataset = datasets.length === 1 ? datasets[0] : null;
  const measuredCases = datasets.reduce((sum, dataset) => sum + dataset.run.measured_cases, 0);
  const requestedCases = datasets.reduce((sum, dataset) => sum + dataset.run.requested_cases, 0);
  const terminalCases = datasets.reduce((sum, dataset) => sum + dataset.run.terminal_cases, 0);
  const seriesCount = datasets.reduce((sum, dataset) => sum + dataset.series.length, 0);
  const singleConclusionClass =
    (singleDataset?.run.conclusion && CONCLUSION_CLASSES[singleDataset.run.conclusion]) ??
    CONCLUSION_FALLBACK_CLASS;

  return (
    <section data-testid="collectivex-display" className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">CollectiveX</h1>
              <span
                data-testid="collectivex-run-conclusion"
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                  singleDataset ? singleConclusionClass : CONCLUSION_FALLBACK_CLASS
                }`}
              >
                {singleDataset
                  ? `#${singleDataset.run.run_id} · ${singleDataset.run.conclusion ?? 'pending'}`
                  : `${datasets.length} ${t.runsShown.toLowerCase()}`}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {singleDataset && (
              <>
                <a
                  data-testid="collectivex-source-link"
                  href={`https://github.com/SemiAnalysisAI/InferenceX/tree/${singleDataset.run.source_sha}/experimental/CollectiveX`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    track('collectivex_source_opened', {
                      source_sha: singleDataset.run.source_sha,
                    })
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t.source} <ExternalLink className="size-3.5" />
                </a>
                <a
                  data-testid="collectivex-methodology-link"
                  href={`https://github.com/SemiAnalysisAI/InferenceX/blob/${singleDataset.run.source_sha}/experimental/CollectiveX/docs/methodology.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    track('collectivex_methodology_opened', {
                      source_sha: singleDataset.run.source_sha,
                    })
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <BookOpen className="size-3.5" /> {t.methodology}
                </a>
              </>
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
        {datasets.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={seriesCount} label={t.seriesCount} />
            <Stat value={`${measuredCases}/${requestedCases}`} label={t.measuredCases} />
            <Stat value={`${terminalCases}/${requestedCases}`} label={t.terminalCases} />
            <Stat value={datasets.length} label={t.runsShown} />
          </div>
        )}
      </Card>

      <Card data-testid="collectivex-runs">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t.runsHeading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.runsDescription}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end md:w-auto">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="collectivex-delete-shown-runs"
              disabled={visibleRunIds.size === 0 || deletingRunIds.size > 0}
              onClick={() => void handleDeleteShownRuns()}
            >
              {bulkDeletingRunIds.size > 0 ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {bulkDeletingRunIds.size > 0 ? t.deletingShownRuns : t.deleteShownRuns}
            </Button>
            <div className="w-full sm:w-44">
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
            </div>
          </div>
        </div>
        <CollectiveXRunsTable
          runs={runList}
          selectedRunIndexById={selectedRunIndexById}
          visibleRunIds={visibleRunIds}
          loadingRunIds={loadingRunIds}
          deletingRunIds={deletingRunIds}
          onVisibleChange={handleVisibleRunChange}
          onDelete={(runId) => void handleDeleteRun(runId)}
        />
      </Card>

      {visibleRunIds.size === 0 && (
        <Card data-testid="collectivex-no-runs-selected" className="py-6 text-center">
          <p className="text-sm text-muted-foreground">{t.selectRuns}</p>
        </Card>
      )}
      {visibleRunIds.size > 0 && datasets.length === 0 && loadingRunIds.size > 0 && (
        <Card
          data-testid="collectivex-selected-runs-loading"
          className="min-h-40 items-center justify-center"
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{t.loading}</p>
        </Card>
      )}
      {selectedRunErrors > 0 && (
        <Card data-testid="collectivex-selected-runs-error" className="border-destructive py-4">
          <p className="text-sm text-destructive">{t.selectedRunsFailed}</p>
        </Card>
      )}

      {datasets.length > 0 && (
        <>
          {phaseSeries.length === 0 && (
            <Card data-testid="collectivex-empty-state" className="py-4">
              <p className="text-sm text-muted-foreground">{t.noSeries}</p>
            </Card>
          )}
          {/* KV-transfer cases lead for kv-only runs: the EP chart below is
              legitimately empty for them and must not bury the selected data. */}
          <CollectiveXKvSection datasets={datasets} runIndexById={selectedRunIndexById} />
          <Card data-testid="collectivex-main-chart" className="relative">
            <CollectiveXChart
              chartId="collectivex-explorer"
              testId="collectivex-explorer-chart"
              series={activeSeries}
              colors={colors}
              operation={operation}
              percentile={percentile}
              yAxis={yAxis}
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
                      : t.yAxis[yAxis]}
                  </p>
                </>
              }
              legendElement={
                <ChartLegend
                  variant="sidebar"
                  legendItems={legendItems}
                  disableActiveSort
                  onItemRemove={(id) => {
                    setActiveSeriesIds(
                      (previous) => new Set([...previous].filter((item) => item !== id)),
                    );
                    track('collectivex_series_toggled', { series: id, visible: false });
                  }}
                  isLegendExpanded={legendExpanded}
                  onExpandedChange={setLegendExpanded}
                  actions={
                    activeSeries.length < phaseSeries.length
                      ? [
                          {
                            id: 'collectivex-reset-filter',
                            label: t.resetFilter,
                            onClick: () => {
                              setActiveSeriesIds(
                                new Set(phaseSeries.map((item) => item.series_id)),
                              );
                              track('collectivex_series_filter_reset');
                            },
                          },
                        ]
                      : []
                  }
                />
              }
            />
            {yAxis === 'activation-rate' && (
              <p className="mt-2 text-xs text-muted-foreground">{t.payloadNote}</p>
            )}
            {yAxis === 'payload-rate' && (
              <p className="mt-2 text-xs text-muted-foreground">{t.payloadBandwidthNote}</p>
            )}
          </Card>
          <Card className="py-4 md:py-5">
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
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
              <SelectControl
                label={t.operationControl}
                testId="collectivex-operation-select"
                value={operation}
                options={operationOptions}
                onChange={(next) => {
                  setOperation(next);
                  if (next !== 'roundtrip' && yAxis === 'tokens-per-second') setYAxis('latency');
                  track('collectivex_operation_changed', { operation: next });
                }}
              />
              <ControlGroup label={t.phaseControl}>
                <SegmentedToggle
                  value={phase}
                  options={phaseOptions}
                  onValueChange={(next) => {
                    setPhase(next);
                    track('collectivex_phase_changed', { phase: next });
                  }}
                  ariaLabel={t.phaseAria}
                  testId="collectivex-phase-toggle"
                />
              </ControlGroup>
              {availableModes.length > 1 && (
                <ControlGroup label={t.modeControl}>
                  <div
                    className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5"
                    role="group"
                    aria-label={t.modeAria}
                    data-testid="collectivex-mode-toggle"
                  >
                    {modeOptions.map((option) => {
                      const selected = modes.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={() => {
                            const next = selected
                              ? modes.filter((mode) => mode !== option.value)
                              : [...modes, option.value];
                            if (next.length === 0) return;
                            setModes(next);
                            track('collectivex_mode_changed', { modes: next });
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </ControlGroup>
              )}
              <ControlGroup label={t.precisionControl}>
                <SegmentedToggle
                  value={precision}
                  options={precisionOptions}
                  onValueChange={(next) => {
                    setPrecision(next);
                    track('collectivex_precision_changed', { precision: next });
                  }}
                  ariaLabel={t.precisionAria}
                  testId="collectivex-precision-toggle"
                />
              </ControlGroup>
              <ControlGroup label={t.latencyPercentile}>
                <SegmentedToggle
                  value={percentile}
                  options={PERCENTILE_OPTIONS}
                  onValueChange={(next) => {
                    setPercentile(next);
                    track('collectivex_percentile_changed', { percentile: next });
                  }}
                  ariaLabel={t.percentileAria}
                  testId="collectivex-percentile-toggle"
                />
              </ControlGroup>
              <SelectControl
                label={t.sku}
                testId="collectivex-sku-select"
                value={sku}
                options={selectOptions(skuOptions, t.all, true)}
                onChange={(next) => {
                  setSku(next);
                  track('collectivex_sku_changed', { sku: next });
                }}
              />
              <SelectControl
                label={t.backend}
                testId="collectivex-backend-select"
                value={backend}
                options={selectOptions(backendOptions, t.all)}
                onChange={(next) => {
                  setBackend(next);
                  track('collectivex_backend_changed', { backend: next });
                }}
              />
              <SelectControl
                label={t.yAxisControl}
                testId="collectivex-y-axis-select"
                value={yAxis}
                onChange={(next) => {
                  setYAxis(next);
                  track('collectivex_y_axis_changed', { y_axis: next });
                }}
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
                  {
                    value: 'activation-rate',
                    label: 'Activation-data rate at latency percentile',
                  },
                  {
                    value: 'payload-rate',
                    label: t.yAxis['payload-rate'],
                  },
                ]}
              />
            </div>
          </Card>
          <CollectiveXInventory
            key={`${version}-${datasets.map((dataset) => `${dataset.run.run_id}:${dataset.run.run_attempt}`).join(',')}`}
            datasets={datasets}
          />
        </>
      )}
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

'use client';

import { BookOpen, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
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
import {
  useCollectiveX,
  useCollectiveXRun,
  useCollectiveXRuns,
  useDeleteCollectiveXRun,
} from '@/hooks/api/use-collectivex';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { CollectiveXChart } from './CollectiveXChart';
import { CollectiveXInventory } from './CollectiveXInventory';
import {
  collectiveXColorKey,
  collectiveXSeriesLabel,
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
      'payload-rate': 'Payload bandwidth at selected latency percentile (per GPU)',
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
      'Payload rate is derived at the selected latency percentile and is not physical link bandwidth.',
    payloadBandwidthNote:
      'Payload bandwidth is the full logical payload (incl. FP8 scale bytes) ÷ latency, per GPU — a derived rate over logical bytes, not physical link bandwidth. The tooltip β/α is a least-squares fit of latency vs bytes across the ladder (β = per-GPU bandwidth term, α = fixed overhead).',
    deleteRun: 'Delete run',
    deleteConfirm: (id: string) =>
      `Delete run #${id} from the dashboard database? This cannot be undone.`,
    deleteTokenPrompt: 'Admin token required to delete runs:',
    deleteUnauthorized: 'Invalid admin token.',
    deleteFailed: 'Deleting the run failed. Try again.',
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
      'payload-rate': '所选延迟分位点的载荷带宽（每 GPU）',
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
      '载荷带宽为完整逻辑载荷（含 FP8 缩放字节）÷ 延迟（每 GPU），是基于逻辑字节的派生速率，不代表物理链路带宽。工具提示中的 β/α 为延迟对字节在整个梯度上的最小二乘拟合（β = 每 GPU 带宽项，α = 固定开销）。',
    provenance: '发布数据溯源',
    runLabel: 'Run',
    attemptLabel: 'Attempt',
    matrixLabel: 'Matrix',
    sourceBundles: '源产物包',
    // English placeholders per the repository's temporary language override
    // (no new Chinese translations); localize when the override lifts.
    deleteRun: 'Delete run',
    deleteConfirm: (id: string) =>
      `Delete run #${id} from the dashboard database? This cannot be undone.`,
    deleteTokenPrompt: 'Admin token required to delete runs:',
    deleteUnauthorized: 'Invalid admin token.',
    deleteFailed: 'Deleting the run failed. Try again.',
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
  // A pinned run overrides the latest run.
  const activeQuery = selectedRunId === null ? latestQuery : runQuery;
  const { data, error, isLoading, isFetching } = activeQuery;
  const [epSize, setEpSize] = useState(8);
  const [operation, setOperation] = useState<CollectiveXOperation>('roundtrip');
  const [phase, setPhase] = useState<CollectiveXPhase>('decode');
  // Normal (throughput) kernels are the baseline; the availability effect
  // below falls back when a slice only measured low-latency kernels.
  const [mode, setMode] = useState<CollectiveXMode>('normal');
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
  const runList = runsQuery.data ?? [];
  const runOptions: SelectOption<string>[] = useMemo(
    () => [
      { value: 'latest', label: t.latestPublished },
      ...runList.map((run) => ({
        value: run.run_id,
        label: `#${run.run_id} · ${run.conclusion ?? 'pending'} · ${run.measured_cases}/${run.requested_cases} cases · ${run.terminal_points}/${run.requested_points} points · ${run.covered_skus.length} SKU · ${formatDate(run.generated_at, locale)}`,
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
  const dataset = data;
  const availableEpSizes = useMemo(
    () =>
      [...new Set(dataset?.series.map((item) => item.system.ep_size))].toSorted((a, b) => a - b),
    [dataset?.series],
  );
  const availablePhases = useMemo(
    () =>
      [
        ...new Set(
          dataset?.series
            .filter((item) => item.system.ep_size === epSize)
            .map((item) => item.phase),
        ),
      ].toSorted((left, right) =>
        left === right ? 0 : left === 'decode' ? -1 : right === 'decode' ? 1 : 0,
      ),
    [dataset?.series, epSize],
  );
  const phaseOptions: SegmentedToggleOption<CollectiveXPhase>[] = availablePhases.map((value) => ({
    value,
    label: t.phase[value],
  }));
  const availableModes = useMemo(
    () =>
      [
        ...new Set(
          dataset?.series
            .filter((item) => item.system.ep_size === epSize && item.phase === phase)
            .map((item) => item.mode),
        ),
      ].toSorted((left, right) =>
        left === right ? 0 : left === 'normal' ? -1 : right === 'normal' ? 1 : 0,
      ),
    [dataset?.series, epSize, phase],
  );
  const modeOptions: SegmentedToggleOption<CollectiveXMode>[] = availableModes.map((value) => ({
    value,
    label: t.mode[value],
  }));
  const availablePrecisions = useMemo(
    () =>
      [
        ...new Set(
          dataset?.series
            .filter(
              (item) =>
                item.system.ep_size === epSize && item.phase === phase && item.mode === mode,
            )
            .map((item) => item.precision),
        ),
      ].toSorted(),
    [dataset?.series, epSize, mode, phase],
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
    if (availableModes.length > 0 && !availableModes.includes(mode)) {
      setMode(availableModes[0]);
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
    mode,
    phase,
    precision,
  ]);
  const seriesSelection = useMemo<CollectiveXSeriesSelection>(
    () => ({ epSize, phase, mode, precision }),
    [epSize, mode, phase, precision],
  );
  // SKU and EP determine topology; V1 fixes routing. EP, phase, kernel mode,
  // and precision are needed before the library/SKU comparison filters.
  const matchedSeries = useMemo(
    () => (dataset?.series ?? []).filter((item) => seriesMatchesSelection(item, seriesSelection)),
    [dataset?.series, seriesSelection],
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
        label: collectiveXSeriesLabel(item),
        color: colors[collectiveXColorKey(item)] ?? 'var(--muted-foreground)',
        isActive: activeSeriesIds.has(item.series_id),
        title: `EP${item.system.ep_size} · ${collectiveXTopologyLabel(item.system)}`,
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
    void activeQuery.refetch();
    if (runsRequested) void runsQuery.refetch();
  }, [activeQuery, runsQuery, runsRequested]);
  const deleteRun = useDeleteCollectiveXRun();
  const shownRunId = dataset?.run.run_id;
  const handleDeleteRun = useCallback(async () => {
    if (!shownRunId) return;
    track('collectivex_run_delete_prompted', { run: shownRunId });
    if (!window.confirm(t.deleteConfirm(shownRunId))) return;
    const stored = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
    const token = stored || (window.prompt(t.deleteTokenPrompt)?.trim() ?? '');
    if (!token) return;
    try {
      const deleted = await deleteRun.mutateAsync({ runId: shownRunId, token });
      if (!deleted) {
        localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        track('collectivex_run_delete_failed', { run: shownRunId, reason: 'unauthorized' });
        window.alert(t.deleteUnauthorized);
        return;
      }
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      track('collectivex_run_delete_confirmed', { run: shownRunId });
      // The deleted run can no longer be pinned; fall back to the new latest.
      setSelectedRunId(null);
    } catch {
      track('collectivex_run_delete_failed', { run: shownRunId, reason: 'error' });
      window.alert(t.deleteFailed);
    }
  }, [deleteRun, shownRunId, t]);
  if (isLoading) {
    return (
      <Card data-testid="collectivex-loading" className="min-h-80 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t.loading}</p>
      </Card>
    );
  }
  if (error || !data || !dataset) {
    const message = error instanceof Error ? error.message : t.loadError;
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
            <a
              data-testid="collectivex-source-link"
              href={`https://github.com/SemiAnalysisAI/InferenceX/tree/${run.source_sha}/experimental/CollectiveX`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('collectivex_source_opened', { source_sha: run.source_sha })}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t.source} <ExternalLink className="size-3.5" />
            </a>
            <a
              data-testid="collectivex-methodology-link"
              href={`https://github.com/SemiAnalysisAI/InferenceX/blob/${run.source_sha}/experimental/CollectiveX/docs/methodology.md`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track('collectivex_methodology_opened', { source_sha: run.source_sha })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BookOpen className="size-3.5" /> {t.methodology}
            </a>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t.refresh}
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="collectivex-delete-run"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDeleteRun()}
              disabled={deleteRun.isPending}
            >
              {deleteRun.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t.deleteRun}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={dataset.series.length} label={t.seriesCount} />
          <Stat value={`${run.measured_cases}/${run.requested_cases}`} label={t.measuredCases} />
          <Stat value={`${run.terminal_cases}/${run.requested_cases}`} label={t.terminalCases} />
          <Stat value={formatDate(run.generated_at, locale)} label={t.publishedUtc} compact />
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
              onItemRemove={(id) =>
                setActiveSeriesIds(
                  (previous) => new Set([...previous].filter((item) => item !== id)),
                )
              }
              isLegendExpanded={legendExpanded}
              onExpandedChange={setLegendExpanded}
              actions={
                activeSeries.length < phaseSeries.length
                  ? [
                      {
                        id: 'collectivex-reset-filter',
                        label: t.resetFilter,
                        onClick: () =>
                          setActiveSeriesIds(new Set(phaseSeries.map((item) => item.series_id))),
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
          {availableModes.length > 1 && (
            <ControlGroup label={t.modeControl}>
              <SegmentedToggle
                value={mode}
                options={modeOptions}
                onValueChange={(next) => {
                  setMode(next);
                  track('collectivex_mode_changed', { mode: next });
                }}
                ariaLabel={t.modeAria}
                testId="collectivex-mode-toggle"
              />
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
        key={`${dataset.version}-${run.run_id}-${run.run_attempt}`}
        dataset={dataset}
      />
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

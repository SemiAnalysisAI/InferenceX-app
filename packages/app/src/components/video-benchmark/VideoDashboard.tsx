'use client';

import { ChevronRight } from 'lucide-react';
import {
  Activity,
  Children,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';
import { pushClientSearch, replaceClientSearch } from '@/lib/routing/client-navigation';
import { MOBILE_VIEWPORT_QUERY, useIsCoarsePointer, useMediaQuery } from '@/hooks/useMediaQuery';
import { useThemeColors } from '@/hooks/useThemeColors';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/ui/share-button';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { ControlPanel } from '@/components/ui/control-panel';
import { InfoHelp } from '@/components/ui/option-info';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading, HeadingQualifier } from '@/components/ui/heading';
import { Label } from '@/components/ui/label';
import { MobileControlSection } from '@/components/ui/mobile-control-section';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { RUN_CONTEXT_GRID, RunField } from '@/components/inference/ui/WorkflowInfoDisplay';
import { hardwareLabel } from './hardware';
import { compareDeployments, layoutLabel, runtimeKey } from './deployment';
import { engineLabel, engineSort } from './engines';
import { useVideoPoints } from './use-video-points';
import type { VideoPoint } from './metrics';
import type { VideoInitialData } from './initial-data';
import {
  DEFAULT_RESULTS_STATE,
  isUnofficialRunParam,
  MAX_CHIP_CONFIGS,
  parseResultsState,
  resultProjection,
  resultsSearch,
  resultMetadata,
  workloadSummary,
  type ResultCell,
  type ResultsState,
} from './results';
import {
  chartedCells,
  comparesEngines,
  plottedXMetric,
  RESULTS_X_METRIC_KEYS,
  RESULTS_X_METRICS,
  RESULTS_Y_METRIC_KEYS,
  RESULTS_Y_METRICS,
  resultsChartSeries,
  resultsMetricLabel,
  resultsPlotSeries,
  resultsPointKey,
  resultsSelection,
  stageOpenings,
} from './results-chart';
import { optimizationsOf, runtimeLabel } from './optimizations';
import { EngineComparisonConfirmation } from '@/components/inference/ui/engine-comparison-confirmation';
import { useEngineComparisonConsent } from '@/components/inference/hooks/use-engine-comparison-consent';
import VideoDeploymentDetail from './VideoDeploymentDetail';
import VideoResultsChart, { VIDEO_RESULTS_CHART_ID, type ClipLink } from './VideoResultsChart';
import VideoCostContext from './VideoCostContext';
import VideoResultsClips from './VideoResultsClips';
import {
  defaultPairing,
  isStageParam,
  officialCounterpart,
  parseStage,
  stagePointKey,
  writeStage,
  type StagePair,
} from './clip-stage';
import { useStageValue } from './use-stage-value';
import { seeChangesPair } from './quality-method';
import { READOUT_ID } from './VideoClipReadout';
import { LossyQualityHint } from './QualityMethod';
import { resultsClipPoints } from './results-clips';
import styles from './results.module.css';

const STRINGS = {
  en: {
    title: 'VideoGenX',
    description: (touch: boolean) =>
      `Serving latency, cost and energy for one matched 20-clip video workload across hardware. ${touch ? 'Tap a point to see its clip and measurements' : 'Click a point to pin its measurements and play its clips below'}; hollow points have no clips. View telemetry opens that deployment.`,
    // A phone shows the cohort line right above this and names View telemetry on its button.
    descriptionPhone:
      'Serving latency, cost and energy across hardware. Tap a point for its clip and measurements; hollow points have no clips.',
    benchmarkConfig: 'Benchmark Config',
    model: 'Model',
    chartConfig: 'Chart config',
    runContext: 'Run context',
    compareHistory: 'Compare history',
    chipConfig: 'Chip Config',
    chipConfigHelp:
      'Select up to 4 chip configurations to compare their runs over time. This shows how software updates affect a specific deployment.',
    chipConfigPlaceholder: 'Select Chip Config',
    compareRange: 'Comparison Date Range',
    compareRangeHelp:
      'The start and end execution dates of the runs plotted for the selected chip configs.',
    compareRangePlaceholder: 'Select date range',
    secondaryControls: 'More chart controls',
    changed: 'changed',
    engine: 'Engine',
    bestEngine: 'Best',
    engineHelp:
      'Best shows the lossless engine with the largest Pareto frontier area on each GPU. Lossy optimizations are never ranked.',
    engineComparison: {
      title: 'Show two engines on the same GPU?',
      description:
        'By continuing to display two serving engines on the same GPU, I agree not to use this comparison to start engine drama on Twitter, XHS or other forums.',
      cancel: 'Cancel',
      confirm: 'I agree, show both',
    },
    date: 'Run date',
    xAxis: 'X-axis metric',
    xUnmeasured: 'Not measured yet',
    xUnmeasuredMetrics: ['Quality loss vs lossless (LPIPS)', 'Peak GPU memory'],
    yAxis: 'Y-axis metric',
    stepsUnit: 'steps',
    loading: 'Loading video results…',
    error: 'Could not load video results',
    retry: 'Retry',
    cohort: '20-clip C1 cohort · ≥10 valid per hardware',
    cohortHelp:
      'One canonical 20-clip C1 workload; at least 10 valid samples on every hardware. A fixture replay reads retained evidence and is not a new measurement.',
    replay: 'Local replay · unpublished',
    vs: 'vs.',
    howToRead: 'How to read these results',
    howToReadItems: [
      'One cohort is 20 scheduled clips at concurrency 1 (C1) per hardware. A hardware appears only with at least 10 valid clips of the same workload.',
      'Latency runs from request submit to downloaded media.',
      'Power is GPU-board power of the participating GPUs only. Host, chassis and facility power are excluded.',
      'TCO is modelled from registry $/GPU-hr and measured output, for both participating and allocated GPUs. It is not a measurement or an API bill.',
    ],
    notMeasured:
      'Not measured yet: server-side stage timing, host memory and GPU memory where not recorded, SSIM, VBench, CLIP and VLM quality, sustained load, model load, first-request latency, LoRA switch time and best topology per GPU count.',
    overlay: 'Unofficial run',
    overlayMissing:
      'No matching stored observation for this run. Loading it does not publish or generate media.',
    overlayLive: 'Unpublished run read live from its GitHub artifacts; media is not shown.',
    dismiss: 'Dismiss',
    sources: 'Read-only data',
    api: 'View API',
    csv: 'Download CSV',
  },
  zh: {
    title: 'VideoGenX',
    description: (touch: boolean) =>
      `在同一组匹配的 20 条视频工作负载上，比较各硬件的服务延迟、成本与能耗。${touch ? '轻点数据点可查看其视频和测量值' : '点击数据点可固定显示其测量值，并在下方播放其视频'}；空心点没有视频。${touch ? '轻点' : '点击'}“查看遥测”可打开对应部署。`,
    descriptionPhone:
      '比较各硬件的服务延迟、成本与能耗。轻点数据点可查看其视频和测量值；空心点没有视频。',
    benchmarkConfig: '基准测试配置',
    model: '模型',
    chartConfig: '图表配置',
    runContext: '运行信息',
    compareHistory: '对比历史趋势',
    chipConfig: '芯片配置',
    chipConfigHelp:
      '最多选择 4 个芯片配置以对比其各次运行的趋势。可用于追踪软件更新对特定部署的影响。',
    chipConfigPlaceholder: '选择芯片配置',
    compareRange: '对比日期范围',
    compareRangeHelp: '图表绘制的所选芯片配置各次运行的起止执行日期。',
    compareRangePlaceholder: '选择日期范围',
    secondaryControls: '更多图表设置',
    changed: '项已更改',
    engine: '引擎',
    bestEngine: '最优',
    engineHelp: '「最优」显示每张 GPU 上 Pareto 前沿面积最大的无损引擎。有损优化不参与评选。',
    engineComparison: {
      title: '在同一 GPU 上显示两个引擎？',
      description:
        '继续在同一 GPU 上显示两个引擎，即表示我同意不利用这组对比在 Twitter、小红书或其他论坛上挑起引擎之间的争论。',
      cancel: '取消',
      confirm: '我同意，同时显示',
    },
    date: '运行日期',
    xAxis: 'X 轴指标',
    xUnmeasured: '尚未测量',
    xUnmeasuredMetrics: ['相对无损输出的质量损失（LPIPS）', 'GPU 峰值显存'],
    yAxis: 'Y 轴指标',
    stepsUnit: '步',
    loading: '正在加载视频结果…',
    error: '无法加载视频结果',
    retry: '重试',
    cohort: '20 条视频的 C1 工作负载 · 每种硬件至少 10 个有效样本',
    cohortHelp:
      '所有硬件共用一个固定的 20 条视频 C1 工作负载，至少需要 10 个有效样本。Fixture 回放只读取已保留的证据，不是新测量。',
    replay: '本地回放 · 未发布',
    vs: 'vs',
    howToRead: '如何解读这些结果',
    howToReadItems: [
      '每种硬件的一组结果为并发 1（C1）下计划生成的 20 条视频；同一工作负载至少有 10 条有效视频时，该硬件才会显示。',
      '延迟从提交请求开始计算，到下载完生成的媒体为止。',
      '功率仅统计参与计算的 GPU 板卡，不含主机、机箱和设施功耗。',
      'TCO 根据硬件注册表中的 $/GPU-hr 和实测产出估算，同时给出参与计算和分配的 GPU 两种口径；它不是实测值，也不是 API 账单。',
    ],
    notMeasured:
      '尚未测量：服务端阶段耗时、主机内存及未记录的 GPU 显存、SSIM、VBench、CLIP 与 VLM 质量评估、持续负载、模型加载、首次请求延迟、LoRA 切换时间，以及各 GPU 数量下的最优拓扑。',
    overlay: '非官方运行',
    overlayMissing: '这个运行没有匹配的已存储观测；加载不会发布或生成媒体。',
    overlayLive: '该运行尚未发布，数据直接从其 GitHub 产物实时读取；不显示媒体。',
    dismiss: '移除',
    sources: '只读数据',
    api: '视图 API',
    csv: '下载 CSV',
  },
};
const subscribe = () => () => {};

function MetricSelect({
  id,
  label,
  value,
  groups,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  groups: SearchableSelectGroup[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <SearchableSelect
        triggerId={id}
        triggerTestId={id}
        value={value}
        onValueChange={onValueChange}
        groups={groups}
        placeholder={label}
        searchable={false}
      />
    </div>
  );
}

/** Marks a history entry this page pushed for a detail, so in-page Back pops it even after reload or Forward. */
/**
 * `ChartSection`'s markup with wrappers a phone dissolves (results.module.css), so the chart and
 * the clip blocks join the page column and each draws its own card. The first child, the chart,
 * shares a phone card with the buttons.
 */
function LiftedChartSection({
  children,
  ...buttons
}: ComponentProps<typeof ChartButtons> & { children: ReactNode }) {
  const [chart, ...rest] = Children.toArray(children);
  return (
    <section className={styles.lifted}>
      <figure className={cn('relative min-w-0', styles.lifted)}>
        <Card className={cn('relative', styles.lifted)}>
          <div className="max-md:flex max-md:min-w-0 max-md:flex-col max-md:rounded-xl max-md:border max-md:border-border/30 max-md:bg-card max-md:p-4 md:contents">
            <ChartButtons
              {...buttons}
              className="md:absolute md:top-6 md:right-6 md:z-10 md:mb-0"
            />
            {chart}
          </div>
          {rest}
        </Card>
      </figure>
    </section>
  );
}

const DETAIL_ENTRY = 'videoResultsDetail';
const onDetailEntry = () =>
  (window.history.state as Record<string, unknown> | null)?.[DETAIL_ENTRY] === true;

export default function VideoDashboard({
  initialData,
  pending = false,
  phoneGuess = false,
}: {
  initialData?: VideoInitialData;
  /** The server's guess that a phone asked for the page, until the viewport is known. */
  phoneGuess?: boolean;
  /** The server is still streaming `initialData`; show the loading state and do not read in the browser. */
  pending?: boolean;
}) {
  const locale = useLocale(),
    s = STRINGS[locale];
  const touch = useIsCoarsePointer();
  const phone = useMediaQuery(MOBILE_VIEWPORT_QUERY, phoneGuess);
  const [state, setState] = useState<ResultsState>(initialData?.state ?? DEFAULT_RESULTS_STATE);
  const latest = useRef(state);
  const { points, namedPoints, namedSource, loading, error, replay, retry } = useVideoPoints(
    state.unofficialRun,
    initialData?.history,
    pending,
  );
  // Until the reader sets the switch, a phone's narrow plot leaves the GPU-count labels off.
  const [labelsPick, setLabels] = useState<boolean | null>(null);
  const labels = labelsPick ?? !phone;
  const [legendExpanded, setLegendExpanded] = useState(true);
  /** The chart points the clip stage plays, which the chart badges. */
  const [stagePair, setStagePair] = useState<StagePair>({
    playing: null,
    baseline: null,
    posters: {},
  });
  /** What the stage compares its subject with, by `StageOption.value` (`r_vs`); null pairs it by default. */
  const against = useStageValue('vs');
  /** Whether the reader has picked a clip yet; until then playable chart points pulse. */
  const [picked, setPicked] = useState(false);
  /** The chart point the reader rests on, whose clips are read ahead for its hover card. */
  const [peek, setPeek] = useState<string | null>(null);
  // A transition, so the tap or rest that asks for the read does not wait for this page to render.
  const peekAt = useCallback((key: string) => startTransition(() => setPeek(key)), []);
  const pickAgainst = useCallback((value: string | null) => {
    setPicked(true);
    writeStage({ ...parseStage(location.search), vs: value });
  }, []);
  /** Counts requests to bring the stage into view; the stage answers once its reads land. */
  const [reveal, setReveal] = useState(0);
  const requestReveal = useCallback(() => setReveal((count) => count + 1), []);
  /** Plays the chart point with this key; a new subject returns to its default pairing. */
  const pickClip = useCallback(
    (key: string) => {
      setPicked(true);
      const stage = parseStage(location.search);
      writeStage({ ...stage, clip: key, vs: key === stagePair.playing ? stage.vs : null });
    },
    [stagePair.playing],
  );
  const onStagePair = useCallback(
    (pair: StagePair) =>
      setStagePair((previous) =>
        JSON.stringify(previous) === JSON.stringify(pair) ? previous : pair,
      ),
    [],
  );
  const clipLink = useMemo<ClipLink>(
    () => ({
      ...stagePair,
      pulse: !picked,
      onSelect: pickClip,
      onPeek: peekAt,
      onReveal: requestReveal,
    }),
    [stagePair, picked, pickClip, peekAt, requestReveal],
  );
  const overviewScroll = useRef(0);
  const pendingAnchor = useRef<string | null>(null);
  useEffect(() => {
    const read = () => {
      const next = parseResultsState(location.search);
      latest.current = next;
      setState(next);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const commit = useCallback((next: ResultsState, mode: 'replace' | 'push') => {
    latest.current = next;
    const params = new URLSearchParams(
      [...new URLSearchParams(location.search)].filter(
        ([key]) => (!key.startsWith('r_') || isStageParam(key)) && !isUnofficialRunParam(key),
      ),
    );
    for (const [key, value] of new URLSearchParams(resultsSearch(next))) params.set(key, value);
    if (mode === 'push') pushClientSearch(params, { [DETAIL_ENTRY]: true });
    else replaceClientSearch(params);
    setState(next);
  }, []);
  const update = useCallback(
    (patch: Partial<ResultsState>) => {
      commit({ ...latest.current, ...patch }, 'replace');
      track('video_results_config_changed', { controls: Object.keys(patch).join(',') });
    },
    [commit],
  );
  const openPoint = useCallback(
    (key: string, source: 'popover' | 'table') => {
      overviewScroll.current = window.scrollY;
      commit({ ...latest.current, point: key }, 'push');
      track('video_results_detail_opened', { source });
    },
    [commit],
  );
  const closeDetail = useCallback(
    (anchor: string | null = null) => {
      pendingAnchor.current = anchor;
      track('video_results_detail_closed');
      if (onDetailEntry()) window.history.back();
      else commit({ ...latest.current, point: null }, 'replace');
    },
    [commit],
  );
  // Hidden hardware is filtered here, not in the projection, so the legend can still re-show it.
  const projection = useMemo(
    () => resultProjection(points, { ...state, hidden: [] }, namedPoints),
    [points, state, namedPoints],
  );
  const { options, roster } = projection;
  // A link that names a run but no workload opens on the workload that run measured, as the
  // inference charts open on an unofficial run's model. Decided once per run, so a later pick stays.
  const openedRun = useRef<string | null>(null);
  useEffect(() => {
    const run = state.unofficialRun;
    if (run === null || openedRun.current === run) return;
    if (namedSource !== 'history' && namedSource !== 'live') return;
    openedRun.current = run;
    if (state.workload !== null || projection.overlayDeploymentCells.length > 0) return;
    let best: { workload: string; hardware: number } | null = null;
    for (const { key, slug } of options.workloads) {
      const workload = slug ?? key;
      const drawn = resultProjection(points, { ...state, hidden: [], workload }, namedPoints);
      const hardware = new Set(drawn.overlayDeploymentCells.map((cell) => cell.point.hardwareKey))
        .size;
      if (hardware > (best?.hardware ?? 0)) best = { workload, hardware };
    }
    if (best) commit({ ...latest.current, workload: best.workload }, 'replace');
  }, [state, namedSource, projection, options, points, namedPoints, commit]);
  const consent = useEngineComparisonConsent('video-results');
  const plotted = (next: ResultsState) => {
    const p = resultProjection(points, { ...next, hidden: [] }, namedPoints);
    return resultsChartSeries(
      [...p.deploymentCells, ...p.overlayDeploymentCells],
      resultsSelection(next),
    );
  };

  /** Asks before a change first puts two engines on one GPU, as the InferenceX charts do. */
  const updateSeries = (patch: Partial<ResultsState>) => {
    const current = latest.current;
    if (
      consent.accepted ||
      comparesEngines(plotted(current)) ||
      !comparesEngines(plotted({ ...current, ...patch }))
    ) {
      update(patch);
      return;
    }
    consent.request(() => update(patch));
    track('video_results_engine_comparison_opened');
  };
  const dayRuns = projection.runs.filter((run) => run.date === projection.run?.date);
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const shown = (cell: ResultCell) => !hidden.has(cell.point.hardwareKey ?? '');
  const workloadLabel = useMemo(() => {
    const point = [...namedPoints, ...points].find((p) => p.id === projection.state.workload);
    return point ? workloadSummary(point, s.stepsUnit) : null;
  }, [projection.state.workload, points, namedPoints, s]);
  const workloadOptions = useMemo(() => {
    const byId = new Map([...points, ...namedPoints].map((p) => [p.id, p]));
    const listed = options.workloads.flatMap(({ key }) => {
      const point = byId.get(key);
      return point ? [{ key, point, model: resultMetadata(point).model }] : [];
    });
    // Name a workload by its model; add its settings only when another workload shares the model.
    return listed.map(({ key, point, model }) => ({
      value: key,
      label:
        listed.filter((other) => other.model === model).length > 1
          ? workloadSummary(point, s.stepsUnit)
          : model,
    }));
  }, [options.workloads, points, namedPoints, s]);
  const allCells = [...projection.cells, ...projection.overlayCells];
  const deploymentCells = useMemo(
    () => [...projection.deploymentCells, ...projection.overlayDeploymentCells],
    [projection],
  );
  // Clips pick among the runtimes the chart draws, so they name its engine.
  const allCharted = useMemo(() => chartedCells(projection, state), [projection, state]);
  // Memoized: a render that changes none of these must not make the stage work its pairs out again.
  const charted = useMemo(
    () => allCharted.filter((cell) => !hidden.has(cell.point.hardwareKey ?? '')),
    [allCharted, hidden],
  );
  const engines = [
    ...new Set(
      deploymentCells.flatMap(({ metadata }) => (metadata.engine ? [metadata.engine] : [])),
    ),
  ].toSorted((a, b) => engineSort(a) - engineSort(b));
  const compareConfigs = projection.state.configs;
  // Chip Config plots earlier runs, so their popovers open cells outside the as-of set.
  const detailPool = [...deploymentCells, ...projection.history];
  const detailCell =
    state.point === null
      ? undefined
      : detailPool.find((cell) => shown(cell) && resultsPointKey(cell) === state.point);
  const detailSiblings =
    detailCell === undefined
      ? []
      : (deploymentCells.includes(detailCell)
          ? deploymentCells
          : projection.history.filter((cell) => cell.point.runId === detailCell.point.runId)
        )
          .filter(
            (cell) =>
              cell.point.hardwareKey === detailCell.point.hardwareKey &&
              runtimeKey(cell.point) === runtimeKey(detailCell.point) &&
              cell.overlay === detailCell.overlay,
          )
          .toSorted((a, b) => compareDeployments(a.point, b.point));
  // Left in the URL, a dead key would reopen its detail once its hardware is shown again.
  const deadPoint = state.point !== null && !loading && !error && detailCell === undefined;
  useEffect(() => {
    if (deadPoint) commit({ ...latest.current, point: null }, 'replace');
  }, [deadPoint, commit]);
  const detailHardware = detailCell?.point.hardwareKey ?? null;
  const shownDetail = useRef<string | null>(null);
  useEffect(() => {
    const previous = shownDetail.current;
    shownDetail.current = detailHardware;
    if (detailHardware !== null && previous === null) window.scrollTo({ top: 0 });
    if (detailHardware === null && previous !== null) {
      const anchor = pendingAnchor.current && document.querySelector(`#${pendingAnchor.current}`);
      pendingAnchor.current = null;
      if (anchor) anchor.scrollIntoView();
      else window.scrollTo({ top: overviewScroll.current });
    }
  }, [detailHardware]);
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast: false,
    activeKeys: roster,
  });
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  // The site palette, as on the inference chart.
  const colorFor = useCallback(
    (key: string) => (mounted ? getCssColor(resolveColor(key)) : 'var(--muted-foreground)'),
    [mounted, getCssColor, resolveColor],
  );
  const color = (cell: ResultCell) =>
    cell.overlay ? overlayRunColor(0) : colorFor(cell.point.hardwareKey ?? '');
  // A lossy named run owns its clip without leading a card.
  const clipPoints = useMemo(
    () => resultsClipPoints(charted, { tier: state.costTier }),
    [charted, state.costTier],
  );
  const stageClipPoints = useMemo(
    () => stageOpenings(projection, state, clipPoints),
    [projection, state, clipPoints],
  );
  const officialOpenings = useMemo(
    () =>
      stageOpenings(
        projection,
        state,
        resultsClipPoints(
          charted.filter((c) => !c.overlay),
          { tier: state.costTier },
        ),
      ),
    [projection, state, charted],
  );
  const chipHistory = compareConfigs.length > 0;
  const xMetric = plottedXMetric(state.xMetric, chipHistory);
  // The stage plays only a point the chart draws; a lossy one finds its twin among every deployment.
  const drawnPoints = useMemo(
    () =>
      resultsPlotSeries(deploymentCells, chipHistory ? projection.history : null, state)
        .filter((item) => !hidden.has(item.hardwareKey))
        .flatMap((item) => item.points.map(({ cell }) => cell.point)),
    [deploymentCells, chipHistory, projection.history, state, hidden],
  );
  const deploymentPoints = useMemo(
    () => [...deploymentCells, ...projection.history].map((cell) => cell.point),
    [deploymentCells, projection.history],
  );
  /** Plays `point` against the `compare` option in Wipe, then brings the stage into view. */
  const showOnStage = (point: VideoPoint, compare: string) => {
    setPicked(true);
    const own = officialCounterpart(
      point,
      deploymentPoints,
      officialOpenings,
      state.unofficialRun ?? undefined,
    );
    writeStage({
      ...parseStage(location.search),
      clip: stagePointKey(point),
      view: 'wipe',
      // A default stays out of the URL, except on a phone, which opens on another pair.
      vs: compare === defaultPairing(point, own) && !phone ? null : compare,
    });
    requestReveal();
  };
  const lossyPair = useMemo(
    () =>
      seeChangesPair(drawnPoints, deploymentPoints, { tier: state.costTier }, state.unofficialRun),
    [drawnPoints, deploymentPoints, state.costTier, state.unofficialRun],
  );
  // A chart pick or a lossless twin may sit outside the cohort, so every cell lends its cost.
  const clipCosts = useMemo(
    () =>
      Object.fromEntries(
        [...projection.history, ...deploymentCells].map((cell) => [cell.point.id, cell.cost]),
      ),
    [projection.history, deploymentCells],
  );
  const apiUrl = `/api/v1/views/video?${['view=overview', resultsSearch(state)].filter(Boolean).join('&')}`;
  const secondaryChanged = [
    state.xMetric !== DEFAULT_RESULTS_STATE.xMetric,
    state.yMetric !== DEFAULT_RESULTS_STATE.yMetric,
    state.engine !== null,
    state.date !== null || state.run !== null,
    chipHistory,
  ].filter(Boolean).length;
  const model = deploymentCells[0]?.metadata.model ?? state.model ?? s.title;
  const csvUrl = `${apiUrl}&format=csv`;
  const heading = (
    <div className="min-w-0 pr-0 md:pr-56">
      <Heading as="h2" level="card" id="video-results-chart-title">
        {model} · {RESULTS_Y_METRICS[state.yMetric].label[locale]}
        {/* A phone leaves the x metric to the axis title right under the plot. */}
        <span className="max-md:hidden">
          <HeadingQualifier>
            {s.vs} {RESULTS_X_METRICS[xMetric].label[locale]}
          </HeadingQualifier>
        </span>
      </Heading>
    </div>
  );

  const workloadLine = workloadLabel && [workloadLabel, ...engines.map(engineLabel)].join(' · ');

  return (
    <div
      className={`${styles.page} flex w-full min-w-0 flex-col gap-4`}
      data-testid="video-results"
      // The streamed dashboard remounts in place of this shell, so edits made here would be lost.
      inert={pending}
    >
      {detailCell && (
        <VideoDeploymentDetail
          cell={detailCell}
          siblings={detailSiblings}
          gpuCounts={options.gpuCounts}
          workloadLabel={workloadLabel ?? detailCell.point.workload}
          state={state}
          color={color(detailCell)}
          notMeasured={s.notMeasured}
          onBack={() => closeDetail()}
          onSelect={(cell) => {
            commit({ ...latest.current, point: resultsPointKey(cell) }, 'replace');
            track('video_results_detail_deployment_changed', {
              gpus: cell.point.participating ?? 0,
            });
          }}
          // A phone's clips section has no box of its own, so the link lands on its readout.
          onPsnr={() => closeDetail(phone ? READOUT_ID : 'comparison-clips')}
        />
      )}
      {/* Hidden, not unmounted: clip media, the selected clip group and chart state survive a detail visit. */}
      <Activity mode={detailCell ? 'hidden' : 'visible'}>
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-4">
              <DashboardSectionHeader
                title={s.title}
                className={styles.intro}
                description={
                  <>
                    {phone ? s.descriptionPhone : s.description(touch)}
                    {workloadLine && (
                      <span
                        className="mt-1 block text-xs font-medium max-md:hidden"
                        data-testid="results-workload-summary"
                      >
                        {workloadLine}
                      </span>
                    )}
                  </>
                }
                actions={
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{s.cohort}</span>
                    <InfoHelp
                      label={s.cohort}
                      value="cohort"
                      triggerTestId="results-cohort-help"
                      // Clear of Share beside it.
                      triggerClassName="[--hit-x:-2px]"
                    >
                      {s.cohortHelp}
                    </InfoHelp>
                    {replay && <span data-testid="results-replay">{s.replay}</span>}
                    <ShareButton className="max-md:hidden" />
                  </div>
                }
                headingAs="h1"
              />
              <div className={styles.controls}>
                <ControlPanel
                  legend={s.benchmarkConfig}
                  className={styles.benchmarkConfig}
                  data-testid="results-benchmark-config"
                >
                  <MetricSelect
                    id="results-workload"
                    label={s.model}
                    value={projection.state.workload ?? ''}
                    groups={[{ label: '', options: workloadOptions }]}
                    onValueChange={(workload) => {
                      if (workload === projection.state.workload) return;
                      track('video_results_workload_selected', { workload });
                      // Run, pinned point, chip configs and workload filters (including
                      // retired URL filters) belong to the previous workload.
                      update({
                        // The readable slug when it selects this workload, else its point ID.
                        workload:
                          options.workloads.find((option) => option.key === workload)?.slug ??
                          workload,
                        model: null,
                        resolution: null,
                        duration: null,
                        mode: null,
                        steps: null,
                        engine: null,
                        date: null,
                        run: null,
                        point: null,
                        configs: [],
                        compareFrom: null,
                        compareTo: null,
                      });
                    }}
                  />
                </ControlPanel>
                <MobileControlSection
                  label={s.secondaryControls}
                  count={secondaryChanged}
                  countLabel={s.changed}
                  testId="results-secondary-controls"
                >
                  <ControlPanel
                    legend={s.chartConfig}
                    className={styles.chartConfig}
                    data-testid="results-chart-config"
                  >
                    <MetricSelect
                      id="results-x-metric"
                      label={s.xAxis}
                      value={xMetric}
                      groups={[
                        {
                          label: '',
                          options: RESULTS_X_METRIC_KEYS.filter(
                            (metric) => plottedXMetric(metric, chipHistory) === metric,
                          ).map((metric) => ({
                            value: metric,
                            label: resultsMetricLabel(RESULTS_X_METRICS[metric], locale),
                          })),
                        },
                        {
                          label: s.xUnmeasured,
                          heading: (
                            <span data-testid="results-x-unmeasured">
                              {s.xUnmeasured}
                              {s.xUnmeasuredMetrics.map((metric) => (
                                <span key={metric} className="mt-1 block font-normal opacity-70">
                                  {metric}
                                </span>
                              ))}
                            </span>
                          ),
                          options: [],
                        },
                      ]}
                      onValueChange={(value) =>
                        update({ xMetric: value as ResultsState['xMetric'] })
                      }
                    />
                    <MetricSelect
                      id="results-y-metric"
                      label={s.yAxis}
                      value={state.yMetric}
                      groups={[
                        {
                          label: '',
                          options: RESULTS_Y_METRIC_KEYS.map((metric) => ({
                            value: metric,
                            label: resultsMetricLabel(RESULTS_Y_METRICS[metric], locale),
                          })),
                        },
                      ]}
                      onValueChange={(value) =>
                        update({ yMetric: value as ResultsState['yMetric'] })
                      }
                    />
                    {(options.engines.length > 1 || state.engine !== null) && (
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <LabelWithTooltip label={s.engine} tooltip={s.engineHelp} />
                        <SegmentedToggle
                          role="group"
                          value={state.engine ?? 'best'}
                          options={[
                            { value: 'best', label: s.bestEngine },
                            ...options.engines.map((engine) => ({
                              value: engine,
                              label: engineLabel(engine),
                            })),
                          ]}
                          onValueChange={(value) => {
                            track('video_results_engine_selected', { engine: value });
                            updateSeries({ engine: value === 'best' ? null : value });
                          }}
                          ariaLabel={s.engine}
                          testId="results-engine"
                        />
                      </div>
                    )}
                  </ControlPanel>
                  <ControlPanel
                    legend={s.compareHistory}
                    className={styles.compareHistory}
                    data-testid="results-compare-history"
                  >
                    <div className="grid min-w-0 gap-3">
                      <div className="flex min-w-0 flex-col space-y-1.5">
                        <LabelWithTooltip
                          htmlFor="results-chip-config"
                          label={s.chipConfig}
                          tooltip={s.chipConfigHelp}
                        />
                        <MultiSelect
                          triggerId="results-chip-config"
                          triggerTestId="results-chip-config"
                          options={projection.chipConfigs.map(({ key, point }) => ({
                            value: key,
                            label: [
                              hardwareLabel(point.hardwareKey ?? ''),
                              runtimeLabel(point.results?.engine ?? null, optimizationsOf(point)),
                              layoutLabel(point, locale),
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          }))}
                          value={compareConfigs}
                          onChange={(configs) => {
                            track('video_results_chip_config_selected', {
                              configs: configs.join(','),
                            });
                            update(
                              configs.length === 0
                                ? { configs, compareFrom: null, compareTo: null }
                                : { configs },
                            );
                          }}
                          placeholder={s.chipConfigPlaceholder}
                          maxSelections={MAX_CHIP_CONFIGS}
                          searchPlaceholder={locale === 'zh' ? '搜索…' : undefined}
                          noResultsLabel={locale === 'zh' ? '无结果' : undefined}
                          clearSearchLabel={locale === 'zh' ? '清除搜索' : undefined}
                          selectedSuffix={locale === 'zh' ? ' 已选' : undefined}
                        />
                      </div>
                      {chipHistory && (
                        <div className="flex min-w-0 flex-col space-y-1.5">
                          <LabelWithTooltip
                            htmlFor="date-picker"
                            label={s.compareRange}
                            tooltip={s.compareRangeHelp}
                          />
                          <DateRangePicker
                            dateRange={{
                              startDate: state.compareFrom ?? '',
                              endDate: state.compareTo ?? '',
                            }}
                            onChange={({ startDate, endDate }) => {
                              track('video_results_compare_range_changed', {
                                start_date: startDate,
                                end_date: endDate,
                              });
                              update({
                                compareFrom: startDate || null,
                                compareTo: endDate || null,
                              });
                            }}
                            placeholder={s.compareRangePlaceholder}
                            availableDates={options.dates}
                            isCheckingAvailableDates={loading}
                          />
                        </div>
                      )}
                    </div>
                  </ControlPanel>
                  <ControlPanel
                    legend={s.runContext}
                    className={styles.runContext}
                    data-testid="results-run-context"
                  >
                    <div className={RUN_CONTEXT_GRID}>
                      <DatePicker
                        label={s.date}
                        date={projection.run?.date}
                        onChange={(date) => update({ date, run: null })}
                        availableDates={options.dates}
                        isCheckingAvailableDates={loading}
                        isLatestRunSelected={projection.run?.id === projection.runs.at(-1)?.id}
                        onGoToLatestRun={() => update({ date: null, run: null })}
                      />
                      {projection.run && (
                        <RunField
                          runIds={dayRuns.map((run) => run.id)}
                          runs={Object.fromEntries(
                            dayRuns.map((run) => [
                              run.id,
                              {
                                conclusion: 'success',
                                runUrl: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run.id}`,
                              },
                            ]),
                          )}
                          selectedRunId={projection.run.id}
                          onSelect={(run, source) => {
                            if (!run) return;
                            track('video_results_run_selected', { source });
                            update({ date: projection.run!.date, run });
                          }}
                        />
                      )}
                    </div>
                  </ControlPanel>
                </MobileControlSection>
              </div>
            </div>
          </Card>
          <p role="status" className="sr-only">
            {loading ? s.loading : ''}
          </p>
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <span>{s.error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  track('video_results_retry');
                  retry();
                }}
              >
                {s.retry}
              </Button>
            </div>
          )}
          {state.unofficialRun && (
            <div
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/60 bg-destructive/15 px-4 py-3 text-xs md:px-6"
              data-testid="results-overlay"
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <span
                  aria-hidden="true"
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ background: overlayRunColor(0) }}
                />
                {s.overlay} #{state.unofficialRun}
              </span>
              {namedSource === 'pending' ? (
                <span className="text-muted-foreground">{s.loading}</span>
              ) : namedSource === 'live' ? (
                <span className="text-muted-foreground">{s.overlayLive}</span>
              ) : (
                !allCells.some((c) => c.point.runId === state.unofficialRun) && (
                  <span className="text-muted-foreground">{s.overlayMissing}</span>
                )
              )}
              <Button
                variant="ghost"
                size="sm"
                className="sm:ml-auto"
                data-testid="results-overlay-dismiss"
                onClick={() => {
                  // A workload only the named run publishes does not resolve without it.
                  const approved = resultProjection(points, { ...state, unofficialRun: null });
                  update({
                    unofficialRun: null,
                    ...(approved.workloadKey === null ? { workload: null } : {}),
                  });
                  track('video_results_overlay_dismissed');
                }}
              >
                {s.dismiss}
              </Button>
            </div>
          )}
          <LiftedChartSection
            chartId={VIDEO_RESULTS_CHART_ID}
            analyticsPrefix="video_results"
            setIsLegendExpanded={setLegendExpanded}
            exportFileName="videogenx-results"
            onExportCsv={() => {
              const link = document.createElement('a');
              link.href = csvUrl;
              link.download = 'videogenx-results.csv';
              link.click();
            }}
          >
            <div
              className="motion-stale flex min-w-0 flex-col gap-6"
              data-testid="video-results-chart-card"
              data-stale={(loading && deploymentCells.length > 0) || undefined}
            >
              <VideoResultsChart
                cells={deploymentCells}
                history={chipHistory ? projection.history : null}
                roster={roster}
                state={state}
                colorFor={colorFor}
                labels={labels}
                onLabelsChange={setLabels}
                legendExpanded={legendExpanded}
                onLegendExpandedChange={setLegendExpanded}
                onUpdate={updateSeries}
                onOpen={openPoint}
                clipLink={clipLink}
                loading={loading}
                phone={phone}
                heading={heading}
                lossyNote={
                  <LossyQualityHint
                    pair={lossyPair}
                    onSeeChanges={({ lossy }) => showOnStage(lossy, 'twin')}
                  />
                }
                footer={
                  <VideoCostContext
                    state={state}
                    onUpdate={update}
                    hardwareKeys={roster.filter(
                      (key) =>
                        !hidden.has(key) &&
                        deploymentCells.some((cell) => cell.point.hardwareKey === key),
                    )}
                    date={projection.run?.date ?? null}
                  />
                }
              />
            </div>
            <hr className="my-6 border-border-alt max-md:hidden" />
            <VideoResultsClips
              phone={phone}
              cohortLoading={pending || loading}
              titleRow={
                <div
                  className="flex items-start justify-between gap-3 md:hidden"
                  data-testid="results-phone-title"
                >
                  <div className="min-w-0">
                    <Heading as="h1" level="title">
                      {s.title}
                    </Heading>
                    {/* Two lines are held before the workload is known, so nothing shifts when it lands. */}
                    <p className="mt-0.5 min-h-8 text-xs font-medium text-muted-foreground">
                      {workloadLine}
                    </p>
                  </div>
                  <ShareButton />
                </div>
              }
              initialSides={initialData?.sides}
              points={clipPoints}
              openings={stageClipPoints}
              drawn={drawnPoints}
              deployments={deploymentPoints}
              officialOpenings={officialOpenings}
              onPairChange={onStagePair}
              against={against}
              onAgainstChange={pickAgainst}
              onSubjectChange={pickClip}
              onShow={showOnStage}
              peek={peek}
              reveal={reveal}
              colorFor={colorFor}
              costs={clipCosts}
              unofficialRun={state.unofficialRun ?? undefined}
            />
          </LiftedChartSection>
          {phone ? (
            // A phone folds the notes into one closed row, in the style of "How we score quality".
            <details
              className="group/how-to-read text-xs"
              data-testid="results-how-to-read"
              onToggle={(event) =>
                track('video_results_how_to_read_toggled', { enabled: event.currentTarget.open })
              }
            >
              <summary className="flex w-full cursor-pointer list-none items-center gap-2 rounded-lg border border-border/30 bg-card px-3 py-2.5 text-sm font-semibold group-open/how-to-read:rounded-b-none hover:bg-muted/10 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 transition-transform group-open/how-to-read:rotate-90"
                />
                <h2>{s.howToRead}</h2>
              </summary>
              <ul className="list-disc space-y-1.5 rounded-b-lg border border-t-0 border-border/30 bg-card p-3.5 pl-8 leading-relaxed text-muted-foreground">
                {s.howToReadItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                <li data-testid="results-not-measured">{s.notMeasured}</li>
              </ul>
            </details>
          ) : (
            <Card>
              <section
                className="flex min-w-0 flex-col gap-3"
                aria-labelledby="results-how-to-read-title"
                data-testid="results-how-to-read"
              >
                <Heading as="h2" level="card" id="results-how-to-read-title">
                  {s.howToRead}
                </Heading>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                  {s.howToReadItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  <li data-testid="results-not-measured">{s.notMeasured}</li>
                </ul>
              </section>
            </Card>
          )}
          <footer className="flex flex-wrap justify-end gap-x-4 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
            <a
              className="text-brand-fill hover:underline"
              href={csvUrl}
              download="videogenx-results.csv"
              onClick={() => track('video_results_csv_downloaded', { source: 'footer' })}
            >
              {s.csv}
            </a>
            <a
              className="text-brand-fill hover:underline"
              href={apiUrl}
              onClick={() => track('video_results_api_opened')}
            >
              {s.sources} · {s.api}
            </a>
          </footer>
        </div>
      </Activity>
      <EngineComparisonConfirmation
        copy={s.engineComparison}
        open={consent.open}
        onCancel={() => {
          consent.cancel();
          track('video_results_engine_comparison_cancelled');
        }}
        onConfirm={() => {
          consent.confirm();
          track('video_results_engine_comparison_accepted');
        }}
      />
    </div>
  );
}

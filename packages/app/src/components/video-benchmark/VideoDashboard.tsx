'use client';

import {
  Activity,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { pushClientSearch, replaceClientSearch } from '@/lib/routing/client-navigation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { ShareButton } from '@/components/ui/share-button';
import { Card } from '@/components/ui/card';
import { ControlPanel } from '@/components/ui/control-panel';
import { InfoHelp } from '@/components/ui/option-info';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobileControlSection } from '@/components/ui/mobile-control-section';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { DatePicker } from '@/components/ui/date-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { RUN_CONTEXT_GRID, RunField } from '@/components/inference/ui/WorkflowInfoDisplay';
import { hardwareLabel } from './hardware';
import { layoutLabel, leadCell } from './deployment';
import { useVideoPoints } from './use-video-points';
import type { VideoInitialData } from './initial-data';
import {
  DEFAULT_RESULTS_STATE,
  MAX_CHIP_CONFIGS,
  parseResultsState,
  resultProjection,
  resultsSearch,
  resultMetadata,
  type ResultCell,
  type ResultsState,
  type VideoMode,
} from './results';
import {
  RESULTS_X_METRIC_KEYS,
  RESULTS_X_METRICS,
  RESULTS_Y_METRIC_KEYS,
  RESULTS_Y_METRICS,
  resultsMetricLabel,
  resultsPointKey,
} from './results-chart';
import VideoDeploymentDetail from './VideoDeploymentDetail';
import VideoResultsChart from './VideoResultsChart';
import VideoCostContext from './VideoCostContext';
import VideoResultsTable from './VideoResultsTable';
import VideoResultsClips from './VideoResultsClips';
import { resultsClipPoints } from './results-clips';
import { ResultsBars, resultsNumber as n, type ResultBar } from './VideoResultsCharts';
import VideoHistory from './VideoHistory';
import styles from './results.module.css';

const STRINGS = {
  en: {
    title: 'VideoGenX',
    description:
      'Serving latency, cost and energy for one matched 20-clip video workload across hardware. Click a point to pin its measurements; View telemetry opens that deployment.',
    chartConfig: 'Chart config',
    deployment: 'Deployment',
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
    gpus: 'GPU count',
    date: 'Run date',
    xAxis: 'X-axis metric',
    yAxis: 'Y-axis metric',
    all: 'All',
    stepsUnit: 'steps',
    loading: 'Loading video results…',
    error: 'Could not load video results.',
    retry: 'Retry',
    empty: 'No measured data for this selection',
    cohort: '20-clip C1 cohort · ≥10 valid per hardware',
    cohortHelp:
      'One canonical 20-clip C1 workload; at least 10 valid samples on every hardware. Other runs remain in Performance history. A fixture replay reads retained evidence and is not a new measurement.',
    replay: 'Local replay · unpublished',
    chartTitle: (model: string, y: string, x: string) => `${model} · ${y} vs. ${x}`,
    participating: 'Participating GPUs',
    allocated: 'Allocated GPUs',
    howToRead: 'How to read these results',
    howToReadItems: [
      'One cohort is 20 scheduled clips at concurrency 1 (C1) per hardware. A hardware appears only with at least 10 valid clips of the same workload.',
      'Latency runs from request submit to downloaded media.',
      'Power is GPU-board power of the participating GPUs only. Host, chassis and facility power are excluded.',
      'TCO is modelled from registry $/GPU-hr and measured output, for both participating and allocated GPUs. It is not a measurement or an API bill.',
    ],
    notMeasured:
      'Not measured yet: server-side stage timing, host memory and GPU memory where not recorded, SSIM, VBench, CLIP and VLM quality, sustained load, model load, first-request latency, LoRA switch time and best topology per GPU count.',
    estimator: 'Profit estimator',
    utilization: 'Utilisation',
    price: 'API $ / video-s',
    priceNote: 'Scenario prices · not current API rates',
    priceDetail:
      'Scenario inputs, not measured revenue or current API prices. Enter a price for each mode; an unknown mode has no price.',
    profitNote:
      'Revenue = measured video-s/hr × utilisation × entered $/video-s. Profit subtracts all hourly GPU TCO; divide by the stated GPU count. No capacity or sustained-load claim.',
    history: 'Performance history',
    historyNote: 'Stored evidence, including unapproved, low-sample and unmatched runs.',
    overlay: 'Unofficial run',
    overlayMissing:
      'No matching stored observation for this run. Loading it does not publish or generate media.',
    dismiss: 'Dismiss',
    sources: 'Read-only data',
    api: 'View API',
    csv: 'Download CSV',
  },
  zh: {
    title: 'VideoGenX',
    description:
      '在同一组匹配的 20 条视频工作负载上，比较各硬件的服务延迟、成本与能耗。点击数据点可固定显示其测量值，再点击“查看遥测”打开对应部署。',
    chartConfig: '图表配置',
    deployment: '部署',
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
    gpus: 'GPU 数量',
    date: '运行日期',
    xAxis: 'X 轴指标',
    yAxis: 'Y 轴指标',
    all: '全部',
    stepsUnit: '步',
    loading: '正在加载视频结果…',
    error: '无法加载视频结果。',
    retry: '重试',
    empty: '当前选择没有实测数据',
    cohort: '20 条视频的 C1 工作负载 · 每种硬件至少 10 个有效样本',
    cohortHelp:
      '所有硬件共用一个固定的 20 条视频 C1 工作负载，至少需要 10 个有效样本。其他运行保留在性能历史中。Fixture 回放只读取已保留的证据，不是新测量。',
    replay: '本地回放 · 未发布',
    chartTitle: (model: string, y: string, x: string) => `${model} · ${y} vs ${x}`,
    participating: '参与计算的 GPU',
    allocated: '分配的 GPU',
    howToRead: '如何解读这些结果',
    howToReadItems: [
      '每种硬件的一组结果为并发 1（C1）下计划生成的 20 条视频；同一工作负载至少有 10 条有效视频时，该硬件才会显示。',
      '延迟从提交请求开始计算，到下载完生成的媒体为止。',
      '功率仅统计参与计算的 GPU 板卡，不含主机、机箱和设施功耗。',
      'TCO 根据硬件注册表中的 $/GPU-hr 和实测产出估算，同时给出参与计算和分配的 GPU 两种口径；它不是实测值，也不是 API 账单。',
    ],
    notMeasured:
      '尚未测量：服务端阶段耗时、主机内存及未记录的 GPU 显存、SSIM、VBench、CLIP 与 VLM 质量评估、持续负载、模型加载、首次请求延迟、LoRA 切换时间，以及各 GPU 数量下的最优拓扑。',
    estimator: '利润估算器',
    utilization: '利用率',
    price: 'API $ / video-s',
    priceNote: '场景价格，非当前 API 报价',
    priceDetail:
      '价格输入是场景假设，不是实测收入或当前 API 报价。分别填写各模式的价格；未知模式不套用价格。',
    profitNote:
      '收入 = 实测 video-s/hr × 利用率 × 输入单价。利润扣除全部每小时 GPU TCO，再除以相应 GPU 数量。不据此推断容量或持续负载能力。',
    history: '性能历史',
    historyNote: '已存储的结果，包括尚无发布批准、样本不足及工作负载未匹配的运行。',
    overlay: '非官方运行',
    overlayMissing: '这个运行没有匹配的已存储观测；加载不会发布或生成媒体。',
    dismiss: '移除',
    sources: '只读数据',
    api: '视图 API',
    csv: '下载 CSV',
  },
};
const subscribe = () => () => {};
/** Marks a history entry this page pushed for a detail, so in-page Back pops it even after reload or Forward. */
const DETAIL_ENTRY = 'videoResultsDetail';
const onDetailEntry = () =>
  (window.history.state as Record<string, unknown> | null)?.[DETAIL_ENTRY] === true;

const cellLabel = (cell: ResultCell) =>
  `${hardwareLabel(cell.point.hardwareKey ?? '')}${cell.overlay ? ` · #${cell.point.runId}` : ''}`;

export default function VideoDashboard({
  initialData,
  pending = false,
}: {
  initialData?: VideoInitialData;
  /** The server is still streaming `initialData`; show the loading state and do not read in the browser. */
  pending?: boolean;
}) {
  const locale = useLocale(),
    s = STRINGS[locale];
  const [state, setState] = useState<ResultsState>(initialData?.state ?? DEFAULT_RESULTS_STATE);
  const latest = useRef(state);
  const { points, namedPoints, loading, error, replay, retry } = useVideoPoints(
    state.unofficialRun,
    initialData?.history,
    pending,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [labels, setLabels] = useState(true);
  const overviewScroll = useRef(0);
  const pendingAnchor = useRef<string | null>(null);
  useEffect(() => {
    const read = () => {
      const next = parseResultsState(location.search);
      latest.current = next;
      setState(next);
      const params = new URLSearchParams(location.search);
      if (
        ['history-hardware', 'history-concurrency', 'history-query'].some((key) => params.has(key))
      )
        setHistoryOpen(true);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const commit = useCallback((next: ResultsState, mode: 'replace' | 'push') => {
    latest.current = next;
    const params = new URLSearchParams(
      [...new URLSearchParams(location.search)].filter(
        ([key]) => !key.startsWith('r_') && key !== 'unofficialrun' && key !== 'unofficialruns',
      ),
    );
    for (const [key, value] of new URLSearchParams(resultsSearch(next))) params.set(key, value);
    if (mode === 'push') pushClientSearch(params, { [DETAIL_ENTRY]: true });
    else replaceClientSearch(params);
    setState(next);
  }, []);
  const update = useCallback(
    (patch: Partial<ResultsState>) => {
      const changesWorkload = ['model', 'workload', 'resolution', 'duration', 'mode', 'steps'].some(
        (key) => key in patch,
      );
      commit(
        {
          ...latest.current,
          ...patch,
          ...(changesWorkload
            ? { apiPrice: null, apiPrices: { t2v: null, i2v: null, r2v: null } }
            : {}),
        },
        'replace',
      );
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
  const dayRuns = projection.runs.filter((run) => run.date === projection.run?.date);
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const shown = (cell: ResultCell) => !hidden.has(cell.point.hardwareKey ?? '');
  const workloadLabel = useMemo(() => {
    const point = [...namedPoints, ...points].find((p) => p.id === projection.state.workload);
    if (!point) return null;
    const metadata = resultMetadata(point);
    return [
      metadata.model,
      metadata.resolution,
      metadata.duration === null ? null : `${metadata.duration} s`,
      metadata.fps === null ? null : `${metadata.fps} fps`,
      metadata.steps === null ? null : `${metadata.steps} ${s.stepsUnit}`,
      metadata.mode?.toUpperCase(),
    ]
      .filter(Boolean)
      .join(' · ');
  }, [projection.state.workload, points, namedPoints, s]);
  const allCells = [...projection.cells, ...projection.overlayCells];
  const cells = allCells.filter(shown);
  const deploymentCells = useMemo(
    () => [...projection.deploymentCells, ...projection.overlayDeploymentCells],
    [projection],
  );
  const engines = [
    ...new Set(
      deploymentCells.flatMap(({ metadata }) => (metadata.engine ? [metadata.engine] : [])),
    ),
  ];
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
              cell.overlay === detailCell.overlay,
          )
          .toSorted((a, b) => (a.point.participating ?? 0) - (b.point.participating ?? 0));
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
  const colorFor = useCallback(
    (key: string) => (mounted ? getCssColor(resolveColor(key)) : 'var(--muted-foreground)'),
    [mounted, getCssColor, resolveColor],
  );
  const color = (cell: ResultCell) =>
    cell.overlay ? overlayRunColor(0) : colorFor(cell.point.hardwareKey ?? '');
  const representatives = roster.flatMap((key) =>
    [false, true].flatMap((overlay) => {
      const choices = cells.filter((c) => c.point.hardwareKey === key && c.overlay === overlay);
      const lead = leadCell(
        choices.map((c) => c.point),
        key,
        { tier: state.costTier },
      );
      const first = choices.find((c) => c.point.id === lead?.id);
      return first ? [first] : [];
    }),
  );
  const profitBars: ResultBar[] = roster
    .filter((key) => !hidden.has(key))
    .flatMap((key) => {
      const rows = representatives.filter((c) => c.point.hardwareKey === key);
      return rows.length > 0
        ? rows.map((c) => ({
            key: c.overlay ? `${key}-overlay` : key,
            label: cellLabel(c),
            color: color(c),
            value: c.profit.participating?.profitPerGpuHour ?? null,
            secondary: c.profit.allocated?.profitPerGpuHour ?? null,
          }))
        : [{ key, label: hardwareLabel(key), color: colorFor(key), value: null, secondary: null }];
    });
  const metricSelector = (key: 'xMetric' | 'yMetric') => {
    const [label, id, choices] =
      key === 'xMetric'
        ? [
            s.xAxis,
            'results-x-metric',
            RESULTS_X_METRIC_KEYS.map((metric) => ({
              value: metric,
              label: resultsMetricLabel(RESULTS_X_METRICS[metric], locale),
            })),
          ]
        : [
            s.yAxis,
            'results-y-metric',
            RESULTS_Y_METRIC_KEYS.map((metric) => ({
              value: metric,
              label: resultsMetricLabel(RESULTS_Y_METRICS[metric], locale),
            })),
          ];
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <SearchableSelect
          triggerId={id}
          triggerTestId={id}
          value={state[key]}
          onValueChange={(value) => update({ [key]: value })}
          groups={[{ label: '', options: choices }]}
          placeholder={label}
          searchable={false}
        />
      </div>
    );
  };
  const apiUrl = `/api/v1/views/video?view=overview&${resultsSearch(state)}`;
  const secondaryChanged = [
    state.xMetric !== DEFAULT_RESULTS_STATE.xMetric,
    state.yMetric !== DEFAULT_RESULTS_STATE.yMetric,
    state.gpuCount !== null,
    state.date !== null || state.run !== null,
    state.configs.length > 0,
  ].filter(Boolean).length;
  const model = deploymentCells[0]?.metadata.model ?? state.model ?? s.title;
  const details = (id: string, title: string, open: boolean | undefined, children: ReactNode) => (
    <details
      className="border-b last:border-b-0"
      data-testid={`results-${id}`}
      open={open}
      onToggle={(event) => {
        const enabled = event.currentTarget.open;
        if (id === 'history') {
          if (enabled === historyOpen) return;
          setHistoryOpen(enabled);
        }
        track(`video_results_${id.replaceAll('-', '_')}_toggled`, { enabled });
      }}
    >
      <summary className="cursor-pointer py-3 text-sm font-medium">{title}</summary>
      <div className="pb-4">{children}</div>
    </details>
  );

  return (
    <div
      className={`${styles.page} mx-auto w-full min-w-0 max-w-7xl py-4`}
      data-testid="video-results"
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
          onPsnr={() => closeDetail('comparison-clips')}
        />
      )}
      {/* Hidden, not unmounted: clip media, the selected clip group and chart state survive a detail visit. */}
      <Activity mode={detailCell ? 'hidden' : 'visible'}>
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-4">
              <DashboardSectionHeader
                title={s.title}
                description={
                  <>
                    {s.description}
                    {workloadLabel && (
                      <span
                        className="mt-1 block text-xs font-medium"
                        data-testid="results-workload-summary"
                      >
                        {[workloadLabel, ...engines].join(' · ')}
                      </span>
                    )}
                  </>
                }
                actions={
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{s.cohort}</span>
                    <InfoHelp label={s.cohort} value="cohort" triggerTestId="results-cohort-help">
                      {s.cohortHelp}
                    </InfoHelp>
                    {replay && <span data-testid="results-replay">{s.replay}</span>}
                    <ShareButton />
                  </div>
                }
                headingAs="h1"
              />
              <div className={styles.controls}>
                <MobileControlSection
                  label={s.secondaryControls}
                  count={secondaryChanged}
                  countLabel={s.changed}
                  testId="results-secondary-controls"
                >
                  <ControlPanel
                    legend={s.chartConfig}
                    className={`${styles.chartConfig} sm:grid-cols-2`}
                    data-testid="results-chart-config"
                  >
                    {metricSelector('xMetric')}
                    {metricSelector('yMetric')}
                  </ControlPanel>
                  <ControlPanel legend={s.deployment}>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Label>{s.gpus}</Label>
                      <SegmentedToggle
                        role="group"
                        value={state.gpuCount === null ? 'all' : String(state.gpuCount)}
                        options={[null, ...options.gpuCounts.toSorted((a, b) => a - b)].map(
                          (v) => ({
                            value: v === null ? 'all' : String(v),
                            label: v === null ? s.all : String(v),
                          }),
                        )}
                        onValueChange={(value) =>
                          update({ gpuCount: value === 'all' ? null : Number(value) })
                        }
                        ariaLabel={s.gpus}
                        testId="results-gpus"
                      />
                    </div>
                  </ControlPanel>
                  <ControlPanel legend={s.compareHistory} data-testid="results-compare-history">
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
                            label: `${hardwareLabel(point.hardwareKey ?? '')} · ${layoutLabel(point, locale)}`,
                          }))}
                          value={state.configs}
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
                      {state.configs.length > 0 && (
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
          {loading && (
            <p role="status" className="text-sm">
              {s.loading}
            </p>
          )}
          {error && (
            <div role="alert" className="text-sm">
              {s.error}{' '}
              <button
                className="underline"
                onClick={() => {
                  track('video_results_retry');
                  retry();
                }}
              >
                {s.retry}
              </button>
            </div>
          )}
          {state.unofficialRun && (
            <div
              className="flex flex-wrap items-center gap-3 rounded border p-3 text-xs"
              data-testid="results-overlay"
            >
              <span style={{ color: overlayRunColor(0) }}>
                {s.overlay}: {state.unofficialRun}
              </span>
              {!allCells.some((c) => c.point.runId === state.unofficialRun) && (
                <span>{s.overlayMissing}</span>
              )}
              <button
                data-testid="results-overlay-dismiss"
                className="underline"
                onClick={() => {
                  const approvedWorkloads = resultProjection(points, {
                    ...state,
                    unofficialRun: null,
                  }).options.workloads;
                  update({
                    unofficialRun: null,
                    ...(state.workload !== null &&
                    !approvedWorkloads.some((workload) => workload.key === state.workload)
                      ? { workload: null }
                      : {}),
                  });
                  track('video_results_overlay_dismissed');
                }}
              >
                {s.dismiss}
              </button>
            </div>
          )}
          <Card>
            <section
              className="flex min-w-0 flex-col gap-4"
              aria-labelledby="video-results-chart-title"
            >
              <Heading as="h2" level="card" id="video-results-chart-title">
                {s.chartTitle(
                  model,
                  RESULTS_Y_METRICS[state.yMetric].label[locale],
                  RESULTS_X_METRICS[state.xMetric].label[locale],
                )}
              </Heading>
              <VideoResultsChart
                cells={deploymentCells}
                history={state.configs.length > 0 ? projection.history : null}
                roster={roster}
                state={state}
                colorFor={colorFor}
                labels={labels}
                onLabelsChange={setLabels}
                onUpdate={update}
                onOpen={openPoint}
              />
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
              <VideoResultsTable
                rows={representatives}
                state={state}
                color={color}
                onOpen={(cell) => openPoint(resultsPointKey(cell), 'table')}
                onDeadlineChange={(deadlineSeconds) => update({ deadlineSeconds })}
                csvHref={`${apiUrl}&format=csv`}
              />
            </section>
          </Card>
          <Card>
            <VideoResultsClips
              initialSides={initialData?.sides}
              points={resultsClipPoints(cells, { tier: state.costTier })}
              colorFor={(key) =>
                representatives.some((c) => c.overlay && c.point.hardwareKey === key)
                  ? overlayRunColor(0)
                  : colorFor(key)
              }
              hidden={hidden}
              options={{ tier: state.costTier }}
              costs={Object.fromEntries(
                cells.map((c) => [
                  c.point.id,
                  {
                    participating: c.cost.participating?.perVideoSecond ?? null,
                    allocated: c.cost.allocated?.perVideoSecond ?? null,
                  },
                ]),
              )}
              unofficialRun={state.unofficialRun ?? undefined}
            />
          </Card>
          <Card className="py-1">
            {details(
              'how-to-read',
              s.howToRead,
              undefined,
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {s.howToReadItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                <li data-testid="results-not-measured">{s.notMeasured}</li>
              </ul>,
            )}
            {details(
              'profit',
              s.estimator,
              undefined,
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  {s.priceNote}. {s.priceDetail} {s.profitNote}
                </p>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {(['t2v', 'i2v', 'r2v'] as VideoMode[]).map((mode) => (
                    <div key={mode} className="flex min-w-0 flex-col gap-1.5">
                      <Label htmlFor={`results-price-${mode}`}>
                        {s.price} · {mode.toUpperCase()}
                      </Label>
                      <Input
                        id={`results-price-${mode}`}
                        type="number"
                        min="0"
                        step="0.005"
                        placeholder="—"
                        value={state.apiPrices[mode] ?? ''}
                        data-testid={`results-price-${mode}`}
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : e.target.valueAsNumber;
                          if (value === null || (Number.isFinite(value) && value >= 0))
                            update({ apiPrices: { ...state.apiPrices, [mode]: value } });
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="results-utilization">
                      {s.utilization} · {n(state.utilization * 100, 0)}%
                    </Label>
                    <input
                      id="results-utilization"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={state.utilization * 100}
                      data-testid="results-utilization"
                      onChange={(e) => update({ utilization: Number(e.target.value) / 100 })}
                    />
                  </div>
                </div>
                <div>
                  {representatives.some(
                    (c) => c.profit.participating !== null || c.profit.allocated !== null,
                  ) ? (
                    <ResultsBars
                      rows={profitBars}
                      label={s.estimator}
                      unit="$/GPU-hr"
                      secondaryLabel={s.allocated}
                    />
                  ) : (
                    <div className={`${styles.empty} text-xs`} data-testid="results-empty">
                      {s.empty}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.participating} · {s.allocated}
                </p>
              </div>,
            )}
            {details(
              'history',
              s.history,
              historyOpen,
              <>
                <p className="mb-3 text-xs text-muted-foreground">{s.historyNote}</p>
                {historyOpen && <VideoHistory />}
              </>,
            )}
          </Card>
          <footer className="flex flex-wrap justify-end gap-3 border-t py-5 text-xs text-muted-foreground">
            <a
              className="underline"
              href={`${apiUrl}&format=csv`}
              download="videogenx-results.csv"
              onClick={() => track('video_results_csv_downloaded', { source: 'footer' })}
            >
              {s.csv}
            </a>
            <a
              className="underline"
              href={apiUrl}
              onClick={() => track('video_results_api_opened')}
            >
              {s.sources} · {s.api}
            </a>
          </footer>
        </div>
      </Activity>
    </div>
  );
}

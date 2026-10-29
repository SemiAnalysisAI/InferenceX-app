'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { useThemeColors } from '@/hooks/useThemeColors';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { ShareButton } from '@/components/ui/share-button';
import { Card } from '@/components/ui/card';
import { ControlPanel } from '@/components/ui/control-panel';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { hardwareLabel, costPerGpuHour } from './hardware';
import { leadCell } from './deployment';
import { COST_TIERS, TIER_LABELS, metricValue } from './metrics';
import { useVideoPoints } from './use-video-points';
import {
  DEFAULT_RESULTS_STATE,
  parseResultsState,
  resultProjection,
  resultsSearch,
  RESULTS_HARDWARE,
  resultMetadata,
  type ResultCell,
  type ResultsState,
  type VideoMode,
} from './results';
import VideoResultsClips from './VideoResultsClips';
import {
  ResultsBars,
  ResultsLines,
  ResultsPareto,
  ResultsRatingSchema,
  resultsNumber as n,
  type ResultBar,
  type ResultSeries,
} from './VideoResultsCharts';
import VideoHistory from './VideoHistory';
import styles from './results.module.css';

const STRINGS = {
  en: {
    title: 'VideoGenX · results across hardware',
    subtitle:
      'The same prompt and seed generated on each hardware. Time to video, fidelity against the full-step clip, metered GPU-board energy and TCO cost per video-second.',
    config: 'Benchmark config',
    runConfig: 'Run config',
    model: 'Model',
    workload: 'Workload',
    gpus: 'GPU count',
    engine: 'Engine',
    date: 'Run date',
    all: 'All',
    automatic: 'Matched workload',
    automaticDetail: 'Automatically matched to',
    publishedLabel: 'Published label',
    sourceId: 'Source ID',
    stepsUnit: 'steps',
    latest: 'Latest published',
    unknown: 'Not recorded',
    hardware: 'Hardware',
    notMeasured: 'Not measured',
    loading: 'Loading published results…',
    error: 'Could not load published results.',
    retry: 'Retry',
    planned: 'planned',
    tbd: 'tbd',
    schema: 'schema',
    empty: 'No measured data for this selection',
    plannedEmpty: 'Awaiting measured evidence',
    schemaEmpty: 'Schema only · not calibrated',
    cohort:
      'One canonical 20-clip C1 workload; at least 10 valid samples on every hardware. Other runs remain in Performance history.',
    replay: 'Retained fixture replay · not a new measurement',
    hidden: 'Excluded from this comparison',
    validity: 'Validity',
    hash: 'Workload hash',
    integrity: 'Technical integrity',
    counts: 'Completion counts',
    fidelity: 'Paired fidelity',
    hashNote:
      'Model revision, step schedule, resolution, fps, prompt set and seeds remain part of the workload identity. Full-step and distilled runs are separate cohorts; paired fidelity needs its own sealed comparison.',
    sealed: 'SHA256SUMS',
    powerValid: 'Power valid',
    runtime: 'Runtime',
    verified: 'Verified',
    invalid: 'Invalid',
    scheduled: 'Scheduled',
    attempted: 'Attempted',
    completed: 'Completed',
    valid: 'Valid',
    failed: 'Failed',
    notStarted: 'Not started',
    latency: 'Latency',
    serial: 'Serial request latency',
    deadline: 'Deadline attainment',
    delivery: 'Serving delivery latency P50 / P90 / P95',
    stages: 'Server-side stage timing',
    stagesNote: 'text encode / denoise / VAE / encode',
    deadlineInput: 'Deadline (s)',
    deadlineNote:
      'Share of valid clips delivered within the selected deadline. Requires every valid request timestamp.',
    deliveryNote:
      'GPU count is the x-axis. Solid: P50 · dotted: P90 · band: P50–P95. Only observed deployments are drawn.',
    throughput: 'Throughput',
    clips: 'Valid clips per second',
    seconds: 'Video seconds generated per second',
    goodput: 'Deadline goodput',
    slo: 'SLO per-video latency distribution',
    mix: 'Workload mix: resolution × duration × mode. Each row retains its own workload identity.',
    energy: 'Resources & Energy',
    trace: 'GPU power time series',
    traceSelect: 'Trace',
    power: 'Average and observed peak power',
    memory: 'GPU memory usage',
    joules: 'GPU energy per valid clip',
    host: 'Host memory usage',
    hostNote:
      'Host RAM requires a host-side sampler; GPU memory and offload settings do not substitute for it.',
    powerNote:
      'GPU-board power of participating GPUs only. No system or facility power is inferred.',
    peak: 'observed peak',
    energyBasis: 'Energy basis',
    cost: 'Cost',
    costMetrics: 'Cost per video and per video-second',
    tier: 'Cost basis',
    estimator: 'Video profit estimator',
    participating: 'Participating GPUs',
    allocated: 'Allocated GPUs',
    utilization: 'Utilisation',
    price: 'API $ / video-s',
    priceNote:
      'Scenario inputs, not measured revenue or current API prices. Enter a price for each mode; an unknown mode has no price.',
    costNote:
      'Modelled TCO from the hardware registry and measured output rate. Both GPU bases are shown; missing allocation evidence stays unknown. Each price applies only to the selected resolution, duration and mode.',
    profitNote:
      'Revenue = measured video-s/hr × utilisation × entered $/video-s. Profit subtracts all hourly GPU TCO; divide by the stated GPU count. No capacity or sustained-load claim.',
    scenarioPrice: 'API $ / video-s · selected workload',
    quality: 'Quality',
    pixel: 'Pixel-level quality: PSNR / SSIM',
    semantic: 'Semantic / perceptual quality: VBench, CLIP, VLM judge',
    human: 'Seven-dimension human rating',
    dimensions: [
      'Prompt adherence',
      'Motion quality',
      'Temporal consistency',
      'Visual quality',
      'Aesthetics',
      'Audio sync',
      'Safety',
    ],
    stability: 'Stability',
    failures: 'Failure classification',
    sustained: 'Sustained-load behavior',
    timeout: 'Timeout',
    oom: 'OOM',
    engineError: 'Engine error',
    transport: 'Transport error',
    other: 'Unclassified',
    startup: 'Startup',
    load: 'Model load time',
    warmup: 'Compile and warmup time',
    warmupNote: 'Recorded warmup request duration only; compile time is not isolated.',
    first: 'First-request latency',
    switch: 'LoRA / model switch time',
    deploy: 'Parallelism & Deployment',
    topology: 'Best topology per GPU count',
    pareto: 'Per-deployment Pareto frontier',
    paretoNote:
      'Per-hardware measured deployments: lower P50, higher valid clips per participating GPU-hour. One deployment is a point; missing topologies are not interpolated.',
    history: 'Performance history',
    historyNote: 'All retained published runs, including low-sample and unmatched workloads.',
    overlay: 'Unofficial published run',
    overlayMissing:
      'No matching published observation for this run. Loading it does not publish or generate media.',
    dismiss: 'Dismiss',
    sources: 'Read-only data',
    api: 'View API',
    basis: 'GPU basis',
    perVideo: '$/video',
    perSecond: '$/video-s',
    audioCosine: 'Audio spectral cosine',
    rms: 'RMS ratio error',
    time: 'Time (s)',
    sample: 'Valid samples',
  },
  zh: {
    title: 'VideoGenX · 跨硬件生成结果',
    subtitle:
      '各硬件使用相同 prompt 和 seed 生成视频，比较出片时间、相对完整步数参考视频的保真度、实测 GPU 板卡能耗及每视频秒 TCO 成本。',
    config: '基准测试配置',
    runConfig: '运行配置',
    model: '模型',
    workload: '工作负载',
    gpus: 'GPU 数量',
    engine: '引擎',
    date: '运行日期',
    all: '全部',
    automatic: '匹配的工作负载',
    automaticDetail: '自动匹配到',
    publishedLabel: '已发布标签',
    sourceId: '来源 ID',
    stepsUnit: '步',
    latest: '最新已发布结果',
    unknown: '未记录',
    hardware: '硬件',
    notMeasured: '未测得',
    loading: '正在加载已发布结果…',
    error: '无法加载已发布结果。',
    retry: '重试',
    planned: '计划中',
    tbd: '待确认',
    schema: '仅 schema',
    empty: '当前选择没有实测数据',
    plannedEmpty: '等待实测证据',
    schemaEmpty: '仅定义评分维度，尚未校准',
    cohort:
      '所有硬件共用一个固定的 20 条视频 C1 工作负载，至少需要 10 个有效样本。其他运行保留在性能历史中。',
    replay: '保留 fixture 回放 · 不是新测量',
    hidden: '未纳入本次比较',
    validity: '有效性',
    hash: '工作负载哈希',
    integrity: '技术完整性',
    counts: '完成数量',
    fidelity: '配对保真度',
    hashNote:
      '工作负载身份包含模型版本、步数、分辨率、fps、prompt 集合与 seed。完整步数与蒸馏版本分组展示；配对保真度需要单独封存的比较产物。',
    sealed: 'SHA256SUMS',
    powerValid: '功率有效性',
    runtime: 'Runtime',
    verified: '已验证',
    invalid: '无效',
    scheduled: '计划',
    attempted: '已尝试',
    completed: '已完成',
    valid: '有效',
    failed: '失败',
    notStarted: '未启动',
    latency: '延迟',
    serial: '串行请求延迟',
    deadline: '截止时间达成率',
    delivery: '服务交付延迟 P50 / P90 / P95',
    stages: '服务端阶段耗时',
    stagesNote: 'text encode / denoise / VAE / encode',
    deadlineInput: '截止时间（s）',
    deadlineNote: '在所选截止时间内交付的有效视频占比，需要所有有效请求的时间记录。',
    deliveryNote: '横轴为 GPU 数量。实线 P50，虚线 P90，色带 P50–P95。只绘制实测部署。',
    throughput: '吞吐量',
    clips: '每秒有效视频数',
    seconds: '每秒生成视频秒数',
    goodput: '满足截止时间的有效吞吐量',
    slo: '各视频的 SLO 延迟分布',
    mix: '工作负载分布：分辨率 × 时长 × 模式。每行保留各自的工作负载身份。',
    energy: '资源与能耗',
    trace: 'GPU 功率时间序列',
    traceSelect: '功率曲线',
    power: '平均功率与观测峰值',
    memory: 'GPU 显存占用',
    joules: '每条有效视频的 GPU 能耗',
    host: '主机内存占用',
    hostNote: '主机内存需要主机侧采样；GPU 显存与 offload 配置不能代替这项测量。',
    powerNote: '仅表示参与计算的 GPU 板卡功率，不推算整机或设施功率。',
    peak: '观测峰值',
    energyBasis: '能耗口径',
    cost: '成本',
    costMetrics: '每条视频及每视频秒成本',
    tier: '成本档位',
    estimator: '视频利润估算器',
    participating: '参与计算的 GPU',
    allocated: '分配的 GPU',
    utilization: '利用率',
    price: 'API $ / video-s',
    priceNote: '场景假设，不是实测收入或当前 API 价格。分别填写各模式的价格；未知模式不套用价格。',
    costNote:
      '使用硬件注册表的 TCO 与实测产出速率建模，同时展示两种 GPU 口径；分配证据缺失时保持未知。价格仅适用于所选分辨率、时长和模式。',
    profitNote:
      '收入 = 实测 video-s/hr × 利用率 × 输入单价。利润扣除全部每小时 GPU TCO，再除以相应 GPU 数量。不据此推断容量或持续负载能力。',
    scenarioPrice: 'API $ / video-s · 当前工作负载',
    quality: '质量',
    pixel: '像素级质量：PSNR / SSIM',
    semantic: '语义与感知质量：VBench、CLIP、VLM judge',
    human: '七维人工评分',
    dimensions: [
      'Prompt 遵循度',
      '运动质量',
      '时间一致性',
      '画面质量',
      '美感',
      '音画同步',
      '安全性',
    ],
    stability: '稳定性',
    failures: '失败分类',
    sustained: '持续负载表现',
    timeout: '超时',
    oom: 'OOM',
    engineError: '引擎错误',
    transport: '传输错误',
    other: '未分类',
    startup: '启动',
    load: '模型加载时间',
    warmup: '编译与 warmup 时间',
    warmupNote: '仅为已记录的 warmup 请求时长，编译时间尚未单独测量。',
    first: '首次请求延迟',
    switch: 'LoRA / 模型切换时间',
    deploy: '并行与部署',
    topology: '各 GPU 数量的最优拓扑',
    pareto: '各部署的 Pareto 前沿',
    paretoNote:
      '按硬件展示实测部署：P50 越低、每参与 GPU 小时的有效视频数越高越好。只有一个部署时只显示一个点，缺失拓扑不插值。',
    history: '性能历史',
    historyNote: '所有已保留的发布结果，包括低样本量和未匹配的工作负载。',
    overlay: '非正式已发布运行',
    overlayMissing: '这个运行没有匹配的已发布观测；加载不会发布或生成媒体。',
    dismiss: '移除',
    sources: '只读数据',
    api: '视图 API',
    basis: 'GPU 口径',
    perVideo: '$/video',
    perSecond: '$/video-s',
    audioCosine: '音频频谱余弦相似度',
    rms: 'RMS 比率误差',
    time: '时间（s）',
    sample: '有效样本',
  },
};
const subscribe = () => () => {};
type Copy = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];

function Empty({
  s,
  kind = 'measured',
  note,
}: {
  s: Copy;
  kind?: 'measured' | 'planned' | 'schema';
  note?: string;
}) {
  return (
    <div className={`${styles.empty} text-xs`} data-testid="results-empty" data-state={kind}>
      <span>
        {kind === 'planned' ? s.plannedEmpty : kind === 'schema' ? s.schemaEmpty : s.empty}
      </span>
      {note && <span>{note}</span>}
    </div>
  );
}
function Item({
  title,
  wide = false,
  state,
  children,
  note,
}: {
  title: string;
  wide?: boolean;
  state?: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className={`${styles.item} ${wide ? styles.wide : ''}`}>
      <Heading as="h3" level="label" className="flex flex-wrap items-baseline gap-2 font-semibold">
        {title}
        {state && (
          <span className="text-2xs font-normal uppercase tracking-eyebrow text-muted-foreground">
            {state}
          </span>
        )}
      </Heading>
      {children}
      {note && <p className={`${styles.note} text-xs`}>{note}</p>}
    </div>
  );
}
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.group} data-testid={`results-${id}`}>
      <Heading as="h2" level="section" className="mb-4">
        {title}
      </Heading>
      <div className={styles.items}>{children}</div>
    </section>
  );
}
function Table({
  head,
  children,
  testId,
}: {
  head: string[];
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className={styles.scroll}>
      <table className={`${styles.table} text-xs`} data-testid={testId}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const cellLabel = (cell: ResultCell) =>
  `${hardwareLabel(cell.point.hardwareKey ?? '')}${cell.overlay ? ` · #${cell.point.runId}` : ''}`;

export default function VideoDashboard() {
  const locale = useLocale(),
    s = STRINGS[locale];
  const { points, loading, error, replay, retry } = useVideoPoints();
  const [state, setState] = useState<ResultsState>(DEFAULT_RESULTS_STATE);
  const [energyBasis, setEnergyBasis] = useState<'clip' | 'frame'>('clip');
  const [traceHardware, setTraceHardware] = useState('h200');
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    const read = () => setState(parseResultsState(location.search));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const update = useCallback((patch: Partial<ResultsState>) => {
    setState((current) => {
      const changesWorkload = ['model', 'workload', 'resolution', 'duration', 'mode', 'steps'].some(
        (key) => key in patch,
      );
      const next = {
        ...current,
        ...patch,
        ...(changesWorkload
          ? { apiPrice: null, apiPrices: { t2v: null, i2v: null, r2v: null } }
          : {}),
      };
      const params = new URLSearchParams(
        [...new URLSearchParams(location.search)].filter(
          ([key]) => !key.startsWith('r_') && key !== 'unofficialrun' && key !== 'unofficialruns',
        ),
      );
      for (const [key, value] of new URLSearchParams(resultsSearch(next))) params.set(key, value);
      history.replaceState(
        null,
        '',
        `${location.pathname}${params.size > 0 ? `?${params}` : ''}${location.hash}`,
      );
      return next;
    });
    track('video_results_config_changed', { controls: Object.keys(patch).join(',') });
  }, []);
  const projection = useMemo(() => resultProjection(points, state), [points, state]);
  const { options, overlayCells } = projection;
  const workloadOptions = useMemo(() => {
    const byId = new Map(points.map((point) => [point.id, point]));
    const rows = options.workloads.map(({ key, label }) => {
      const metadata = resultMetadata(byId.get(key)!);
      const summary = [
        metadata.model,
        metadata.resolution,
        metadata.duration === null ? null : `${metadata.duration} s`,
        metadata.fps === null ? null : `${metadata.fps} fps`,
        metadata.steps === null ? null : `${metadata.steps} ${s.stepsUnit}`,
        metadata.mode?.toUpperCase(),
      ]
        .filter(Boolean)
        .join(' · ');
      return { key, label, summary };
    });
    return rows.map(({ key, label, summary }) => {
      const peers = rows.filter((row) => row.summary === summary);
      let suffixLength = 8;
      while (
        peers.some(
          (row) => row.key !== key && row.key.slice(-suffixLength) === key.slice(-suffixLength),
        )
      )
        suffixLength++;
      return {
        value: key,
        label: peers.length > 1 ? `${summary} · #${key.slice(-suffixLength)}` : summary,
        help: (
          <div className="max-w-full break-all">
            <p>
              {s.publishedLabel}: {label}
            </p>
            <p>
              {s.sourceId}: {key}
            </p>
          </div>
        ),
      } satisfies SearchableSelectOption;
    });
  }, [options.workloads, points, s]);
  const resolvedWorkload = workloadOptions.find(
    (option) => option.value === projection.state.workload,
  );
  const cells = [...projection.cells, ...overlayCells];
  const deploymentCells = [...projection.deploymentCells, ...overlayCells];
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast: false,
    activeKeys: [...RESULTS_HARDWARE],
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
    state.unofficialRun === cell.point.runId
      ? overlayRunColor(0)
      : colorFor(cell.point.hardwareKey ?? '');
  const representatives = RESULTS_HARDWARE.flatMap((key) =>
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
  const bars = (
    get: (c: ResultCell) => number | null,
    secondary?: (c: ResultCell) => number | null,
  ): ResultBar[] =>
    RESULTS_HARDWARE.filter((key) => !hidden.has(key)).flatMap((key) => {
      const rows = representatives.filter((c) => c.point.hardwareKey === key);
      return rows.length > 0
        ? rows.map((c) => ({
            key: c.overlay ? `${key}-overlay` : key,
            label: cellLabel(c),
            color: color(c),
            value: get(c),
            secondary: secondary?.(c) ?? null,
          }))
        : [{ key, label: hardwareLabel(key), color: colorFor(key), value: null, secondary: null }];
    });
  const barChart = (
    title: string,
    unit: string,
    get: (c: ResultCell) => number | null,
    secondary?: (c: ResultCell) => number | null,
    secondaryLabel?: string,
  ) =>
    representatives.some((c) => get(c) !== null || (secondary && secondary(c) !== null)) ? (
      <ResultsBars
        rows={bars(get, secondary)}
        label={title}
        unit={unit}
        secondaryLabel={secondaryLabel}
      />
    ) : (
      <Empty s={s} />
    );
  const series: ResultSeries[] = RESULTS_HARDWARE.filter((key) => !hidden.has(key)).flatMap((key) =>
    [false, true].map((overlay) => ({
      key: overlay ? `${key}-overlay` : key,
      label: hardwareLabel(key),
      color: overlay ? overlayRunColor(0) : colorFor(key),
      points: deploymentCells
        .filter(
          (c) =>
            c.point.hardwareKey === key &&
            c.overlay === overlay &&
            c.point.participating !== null &&
            c.deliveryP50 !== null,
        )
        .map((c) => ({
          x: c.point.participating!,
          y: c.deliveryP50!,
          middle: c.point.p90,
          upper: c.p95,
        })),
    })),
  );
  const trace = representatives.find((c) => c.point.id === traceHardware) ?? representatives[0];
  const selector = (
    key: 'model' | 'engine' | 'date',
    label: string,
    choices: { value: string; label: string }[],
    fallback: string,
  ) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`results-${key}`}>{label}</Label>
      <SearchableSelect
        triggerId={`results-${key}`}
        triggerTestId={`results-${key}`}
        value={state[key] ?? ''}
        onValueChange={(value) =>
          update({ [key]: value || null, ...(key === 'model' ? { workload: null } : {}) })
        }
        groups={[{ label: '', options: [{ value: '', label: fallback }, ...choices] }]}
        placeholder={label}
        searchable={false}
      />
    </div>
  );
  const costByPoint = Object.fromEntries(
    cells.map((c) => [
      c.point.id,
      {
        participating: c.cost.participating?.perVideoSecond ?? null,
        allocated: c.cost.allocated?.perVideoSecond ?? null,
      },
    ]),
  );
  const apiUrl = `/api/v1/views/video?view=overview&${resultsSearch(state)}`;
  const tableRows = (values: (c: ResultCell) => (string | number | null | undefined)[]) =>
    representatives.map((c) => (
      <tr key={c.point.id} data-hardware={c.point.hardwareKey} data-overlay={c.overlay}>
        <td>
          <span className={`${styles.dot} mr-2`} style={{ background: color(c) }} />
          {cellLabel(c)}
        </td>
        {values(c).map((v, i) => (
          <td key={i}>{typeof v === 'number' ? n(v) : (v ?? '—')}</td>
        ))}
      </tr>
    ));
  const noRows = (
    <tr>
      <td colSpan={8} className="text-muted-foreground">
        {s.empty}
      </td>
    </tr>
  );
  return (
    <div
      className={`${styles.page} mx-auto w-full min-w-0 max-w-7xl py-4`}
      data-testid="video-results"
    >
      <Card>
        <div className="flex flex-col gap-4">
          <DashboardSectionHeader
            title={s.title}
            description={s.subtitle}
            actions={<ShareButton />}
            headingAs="h1"
          />
          <div className="grid min-w-0 gap-4 lg:grid-cols-[7fr_5fr]">
            <ControlPanel legend={s.config} className="grid-cols-1 sm:grid-cols-[1fr_2fr]">
              {selector(
                'model',
                s.model,
                options.models.map((v) => ({ value: v, label: v })),
                s.all,
              )}
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="results-workload">{s.workload}</Label>
                <SearchableSelect
                  triggerId="results-workload"
                  triggerTestId="results-workload"
                  value={state.workload ?? 'automatic'}
                  onValueChange={(value) =>
                    update({ workload: value === 'automatic' ? null : value })
                  }
                  groups={[
                    {
                      label: '',
                      options: [
                        { value: 'automatic', label: s.automatic, help: resolvedWorkload?.help },
                        ...workloadOptions,
                      ],
                    },
                  ]}
                  placeholder={s.workload}
                  contentClassName="max-w-[calc(100vw-2rem)]"
                  trackPrefix="video_results_workload"
                />
                {state.workload === null && resolvedWorkload && (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="results-automatic-detail"
                  >
                    {s.automaticDetail}: {resolvedWorkload.label}
                  </p>
                )}
              </div>
            </ControlPanel>
            <ControlPanel legend={s.runConfig} className="grid-cols-1 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label>{s.gpus}</Label>
                <SegmentedToggle
                  role="group"
                  value={state.gpuCount === null ? 'all' : String(state.gpuCount)}
                  options={[null, ...options.gpuCounts.toSorted((a, b) => a - b)].map((v) => ({
                    value: v === null ? 'all' : String(v),
                    label: v === null ? s.all : String(v),
                  }))}
                  onValueChange={(value) =>
                    update({ gpuCount: value === 'all' ? null : Number(value) })
                  }
                  ariaLabel={s.gpus}
                  testId="results-gpus"
                />
              </div>
              {selector(
                'engine',
                s.engine,
                options.engines.map((v) => ({ value: v, label: v })),
                s.all,
              )}
              {selector(
                'date',
                s.date,
                options.dates
                  .toSorted()
                  .toReversed()
                  .map((v) => ({ value: v, label: v })),
                s.latest,
              )}
            </ControlPanel>
          </div>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">{s.cohort}</p>
      {replay && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="results-replay">
          {s.replay}
        </p>
      )}
      {loading && (
        <p role="status" className="mt-3 text-sm">
          {s.loading}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-3 text-sm">
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
          className="mt-3 flex flex-wrap items-center gap-3 rounded border p-3 text-xs"
          data-testid="results-overlay"
        >
          <span style={{ color: overlayRunColor(0) }}>
            {s.overlay}: {state.unofficialRun}
          </span>
          {!cells.some((c) => c.point.runId === state.unofficialRun) && (
            <span>{s.overlayMissing}</span>
          )}
          <button
            data-testid="results-overlay-dismiss"
            className="underline"
            onClick={() => {
              update({ unofficialRun: null });
              track('video_results_overlay_dismissed');
            }}
          >
            {s.dismiss}
          </button>
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.content}>
          <VideoResultsClips
            points={representatives
              .filter(
                (c) =>
                  c.overlay ||
                  !representatives.some(
                    (other) => other.overlay && other.point.hardwareKey === c.point.hardwareKey,
                  ),
              )
              .map((c) => c.point)}
            colorFor={(key) =>
              representatives.some((c) => c.overlay && c.point.hardwareKey === key)
                ? overlayRunColor(0)
                : colorFor(key)
            }
            hidden={hidden}
            options={{ tier: state.costTier }}
            costs={costByPoint}
            unofficialRun={state.unofficialRun ?? undefined}
          />
          <Group id="validity" title={s.validity}>
            <Item title={s.hash} note={s.hashNote}>
              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                <dt>{s.workload}</dt>
                <dd className="break-words">{cells[0]?.point.workload ?? '—'}</dd>
                {representatives.map((c) => (
                  <div key={c.point.id} className="contents">
                    <dt>{cellLabel(c)}</dt>
                    <dd className="break-all font-mono text-2xs">
                      {c.evidence?.workloadHash ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </Item>
            <Item title={s.integrity}>
              <Table head={[s.hardware, s.sealed, s.powerValid, s.runtime]}>
                {representatives.length > 0
                  ? tableRows((c) => [
                      c.evidence?.verified ? s.verified : s.unknown,
                      c.evidence?.powerValid === true
                        ? s.verified
                        : c.evidence?.powerValid === false
                          ? s.invalid
                          : s.unknown,
                      c.point.runtime.slice(0, 12) || null,
                    ])
                  : noRows}
              </Table>
            </Item>
            <Item title={s.counts} wide>
              <Table
                head={[
                  s.hardware,
                  s.scheduled,
                  s.attempted,
                  s.completed,
                  s.valid,
                  s.failed,
                  s.notStarted,
                ]}
              >
                {representatives.length > 0
                  ? tableRows((c) => [
                      c.point.scheduled,
                      c.evidence?.attempted,
                      c.point.completed,
                      c.point.valid,
                      c.point.failed,
                      c.evidence?.notStarted,
                    ])
                  : noRows}
              </Table>
            </Item>
            <Item title={s.fidelity} wide state={s.tbd}>
              <Empty s={s} kind="planned" note={`PSNR · ${s.audioCosine} · ${s.rms}`} />
            </Item>
          </Group>
          <Group id="latency" title={s.latency}>
            <Item title={s.serial}>{barChart(s.serial, 's', (c) => c.point.p50)}</Item>
            <Item title={s.deadline} note={s.deadlineNote}>
              <div className="flex max-w-52 flex-col gap-1.5">
                <Label htmlFor="results-deadline">{s.deadlineInput}</Label>
                <Input
                  id="results-deadline"
                  data-testid="results-deadline"
                  type="number"
                  min="1"
                  value={state.deadlineSeconds}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    if (Number.isFinite(v) && v > 0) update({ deadlineSeconds: v });
                  }}
                />
              </div>
              {barChart(s.deadline, '%', (c) =>
                c.deadlineAttainment === null ? null : c.deadlineAttainment * 100,
              )}
            </Item>
            <Item title={s.delivery} wide note={s.deliveryNote}>
              <div data-testid="results-latency-series">
                {series.some((seriesItem) => seriesItem.points.length > 0) ? (
                  <ResultsLines series={series} label={s.delivery} xLabel={s.gpus} yLabel="s" />
                ) : (
                  <Empty s={s} />
                )}
              </div>
            </Item>
            <Item title={s.stages} wide state={s.planned}>
              <Empty s={s} kind="planned" note={s.stagesNote} />
            </Item>
          </Group>
          <Group id="throughput" title={s.throughput}>
            <Item title={s.clips}>{barChart(s.clips, 'clips/s', (c) => c.clipsPerSecond)}</Item>
            <Item title={s.seconds}>
              {barChart(s.seconds, 'video-s/s', (c) => c.videoSecondsPerSecond)}
            </Item>
            <Item title={s.goodput}>
              {barChart(s.goodput, 'clips/s', (c) => c.deadlineGoodput)}
            </Item>
            <Item title={s.slo} wide note={s.mix}>
              <Table head={[s.workload, 'T2V', 'I2V', 'R2V', s.unknown]}>
                {projection.workloadMix.length > 0
                  ? [
                      ...new Set(
                        projection.workloadMix.map(
                          (c) => `${c.metadata.resolution ?? '—'} · ${n(c.metadata.duration)} s`,
                        ),
                      ),
                    ].map((shape) => (
                      <tr key={shape}>
                        <td>{shape}</td>
                        {['t2v', 'i2v', 'r2v', null].map((mode) => (
                          <td key={mode ?? 'unknown'}>
                            {projection.workloadMix
                              .filter(
                                (c) =>
                                  `${c.metadata.resolution ?? '—'} · ${n(c.metadata.duration)} s` ===
                                    shape &&
                                  (['t2v', 'i2v', 'r2v'].includes(c.metadata.mode ?? '')
                                    ? c.metadata.mode
                                    : null) === mode,
                              )
                              .map((c) => (
                                <div key={c.point.id} className="mb-2 min-w-40">
                                  <span style={{ color: color(c) }}>{cellLabel(c)}</span>
                                  <div>
                                    P50 {n(c.deliveryP50)} · P90 {n(c.point.p90)} · P95 {n(c.p95)} s
                                  </div>
                                  <div className="text-muted-foreground">
                                    {s.deadlineInput}: {n(state.deadlineSeconds)}
                                  </div>
                                </div>
                              ))}
                          </td>
                        ))}
                      </tr>
                    ))
                  : noRows}
              </Table>
            </Item>
          </Group>
          <Group id="energy" title={s.energy}>
            <Item title={s.trace} wide note={s.powerNote}>
              <div className="flex max-w-72 flex-col gap-1.5">
                <Label htmlFor="results-trace-select">{s.traceSelect}</Label>
                <SearchableSelect
                  triggerId="results-trace-select"
                  triggerTestId="results-trace-select"
                  value={trace?.point.id ?? ''}
                  onValueChange={(value) => {
                    setTraceHardware(value);
                    track('video_results_trace_changed', { hardware: value });
                  }}
                  groups={[
                    {
                      label: '',
                      options:
                        representatives.length === 0
                          ? [{ value: '', label: s.notMeasured }]
                          : representatives.map((c) => ({
                              value: c.point.id,
                              label: cellLabel(c),
                            })),
                    },
                  ]}
                  placeholder={s.traceSelect}
                  searchable={false}
                />
              </div>
              <div data-testid="results-power-trace">
                {trace?.evidence?.powerSeries.length ? (
                  <ResultsLines
                    series={[
                      {
                        key: trace.point.hardwareKey ?? '',
                        label: hardwareLabel(trace.point.hardwareKey ?? ''),
                        color: color(trace),
                        points: trace.evidence.powerSeries.map((p) => ({
                          x: p.seconds,
                          y: p.watts,
                        })),
                      },
                    ]}
                    label={s.trace}
                    xLabel={s.time}
                    yLabel="W"
                  />
                ) : (
                  <Empty s={s} />
                )}
              </div>
            </Item>
            <Item title={s.power}>
              {barChart(
                s.power,
                'W',
                (c) => c.point.avgPowerW,
                (c) => c.evidence?.peakPowerW ?? null,
                s.peak,
              )}
            </Item>
            <Item title={s.memory}>
              {barChart(s.memory, 'MiB', (c) => c.evidence?.gpuMemoryMiB ?? null)}
            </Item>
            <Item title={s.joules} wide>
              <SegmentedToggle
                role="group"
                value={energyBasis}
                options={(['clip', 'frame'] as const).map((value) => ({
                  value,
                  label: `J / ${value}`,
                }))}
                onValueChange={(value) => {
                  setEnergyBasis(value);
                  track('video_results_energy_basis_changed', { basis: value });
                }}
                ariaLabel={s.energyBasis}
              />
              {barChart(s.joules, `J/${energyBasis}`, (c) =>
                energyBasis === 'clip' ? c.joulesPerClip : c.joulesPerFrame,
              )}
            </Item>
            <Item title={s.host} state={s.planned} note={s.hostNote}>
              <Empty s={s} kind="planned" />
            </Item>
          </Group>
          <Group id="cost" title={s.cost}>
            <Item title={s.costMetrics} wide note={s.costNote}>
              <div className="flex max-w-80 flex-col gap-1.5">
                <Label htmlFor="results-cost-tier">{s.tier}</Label>
                <SearchableSelect
                  triggerId="results-cost-tier"
                  triggerTestId="results-cost-tier"
                  value={state.costTier}
                  onValueChange={(value) => update({ costTier: value as 'h' | 'r' })}
                  groups={[
                    {
                      label: '',
                      options: COST_TIERS.map((tier) => ({
                        value: tier,
                        label: TIER_LABELS[tier][locale],
                      })),
                    },
                  ]}
                  placeholder={s.tier}
                  searchable={false}
                />
              </div>
              <Table
                testId="results-cost-table"
                head={[s.hardware, s.basis, 'GPU', s.perVideo, s.perSecond, '$/GPU-hr']}
              >
                {representatives.length > 0
                  ? representatives.flatMap((c) =>
                      (['participating', 'allocated'] as const).map((b) => (
                        <tr
                          key={`${c.point.id}-${b}`}
                          data-hardware={c.point.hardwareKey}
                          data-basis={b}
                          data-overlay={c.overlay}
                        >
                          <td>{cellLabel(c)}</td>
                          <td>{s[b]}</td>
                          <td>{n(c.point[b], 0)}</td>
                          <td data-value={c.cost[b]?.perVideo}>{n(c.cost[b]?.perVideo, 4)}</td>
                          <td data-value={c.cost[b]?.perVideoSecond}>
                            {n(c.cost[b]?.perVideoSecond, 4)}
                          </td>
                          <td>{n(costPerGpuHour(c.point.hardwareKey ?? '', state.costTier), 2)}</td>
                        </tr>
                      )),
                    )
                  : noRows}
              </Table>
            </Item>
            <Item title={s.estimator} wide note={s.profitNote}>
              <p className="text-xs text-muted-foreground">{s.priceNote}</p>
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
              <div data-testid="results-profit">
                {barChart(
                  s.estimator,
                  '$/GPU-hr',
                  (c) => c.profit.participating?.profitPerGpuHour ?? null,
                  (c) => c.profit.allocated?.profitPerGpuHour ?? null,
                  s.allocated,
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.participating} · {s.allocated}
              </p>
            </Item>
          </Group>
          <Group id="quality" title={s.quality}>
            <Item title={s.pixel} state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
            <Item title={s.semantic} state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
            <Item title={s.human} wide state={s.schema}>
              <Empty s={s} kind="schema" />
              <ResultsRatingSchema labels={s.dimensions} label={s.schemaEmpty} />
            </Item>
          </Group>
          <Group id="stability" title={s.stability}>
            <Item title={s.failures} wide>
              <Table head={[s.hardware, s.timeout, s.oom, s.engineError, s.transport, s.other]}>
                {representatives.length > 0
                  ? tableRows((c) => [
                      c.evidence?.failures?.timeout,
                      c.evidence?.failures?.oom,
                      c.evidence?.failures?.engine,
                      c.evidence?.failures?.transport,
                      c.evidence?.failures?.other,
                    ])
                  : noRows}
              </Table>
            </Item>
            <Item title={s.sustained} wide state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
          </Group>
          <Group id="startup" title={s.startup}>
            <Item title={s.load} state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
            <Item title={s.warmup} note={s.warmupNote}>
              {barChart(s.warmup, 's', (c) => c.evidence?.warmupSeconds ?? null)}
            </Item>
            <Item title={s.first} state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
            <Item title={s.switch} state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
          </Group>
          <Group id="deploy" title={s.deploy}>
            <Item title={s.topology} state={s.planned}>
              <Empty s={s} kind="planned" />
            </Item>
            <Item title={s.pareto} wide note={s.paretoNote}>
              {deploymentCells.some(
                (c) =>
                  c.point.p50 !== null &&
                  metricValue(c.point, 'videosPerGpuHour', { tier: state.costTier }) !== null,
              ) ? (
                <ResultsPareto
                  label={s.pareto}
                  xLabel="P50 (s)"
                  yLabel="clips/GPU-hr"
                  series={RESULTS_HARDWARE.filter((key) => !hidden.has(key)).flatMap((key) =>
                    [false, true].map((overlay) => ({
                      key: overlay ? `${key}-overlay` : key,
                      label: hardwareLabel(key),
                      color: overlay ? overlayRunColor(0) : colorFor(key),
                      points: deploymentCells
                        .filter((c) => c.point.hardwareKey === key && c.overlay === overlay)
                        .flatMap((c) => {
                          const y = metricValue(c.point, 'videosPerGpuHour', {
                            tier: state.costTier,
                          });
                          return c.point.p50 === null || y === null ? [] : [{ x: c.point.p50, y }];
                        }),
                    })),
                  )}
                />
              ) : (
                <Empty s={s} />
              )}
            </Item>
          </Group>
          <details
            className="mt-9 rounded border p-4"
            open={historyOpen}
            onToggle={(e) => {
              const open = e.currentTarget.open;
              if (open !== historyOpen) {
                setHistoryOpen(open);
                track('video_results_history_toggled', { open });
              }
            }}
          >
            <summary className="cursor-pointer text-sm font-medium">{s.history}</summary>
            <p className="my-3 text-xs text-muted-foreground">{s.historyNote}</p>
            {historyOpen && <VideoHistory />}
          </details>
          <footer className="mt-9 flex flex-wrap justify-between gap-3 border-t py-5 text-xs text-muted-foreground">
            <span>InferenceX · SemiAnalysis</span>
            <a
              className="underline"
              href={apiUrl}
              onClick={() => track('video_results_api_opened')}
            >
              {s.sources} · {s.api}
            </a>
          </footer>
        </div>
        <aside className={styles.rail} aria-label={s.hardware}>
          <Eyebrow as="div" tone="muted" className="mb-2">
            {s.hardware}
          </Eyebrow>
          <div className={`${styles.legend} text-xs`}>
            {RESULTS_HARDWARE.map((key) => (
              <label key={key}>
                <input
                  data-testid={`results-hardware-${key}`}
                  type="checkbox"
                  checked={!hidden.has(key)}
                  onChange={() => {
                    const next = new Set(state.hidden);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    update({ hidden: [...next] });
                    track('video_results_hardware_toggled', { hardware: key });
                  }}
                />
                <span className={styles.dot} style={{ background: colorFor(key) }} />
                <span>{hardwareLabel(key)}</span>
                <span className="ml-auto text-2xs text-muted-foreground">
                  {n(representatives.find((c) => c.point.hardwareKey === key)?.point.p50, 1)} s
                </span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-2xs text-muted-foreground">
            {s.notMeasured}: —<br />
            {s.planned} / {s.tbd}
          </p>
        </aside>
      </div>
    </div>
  );
}

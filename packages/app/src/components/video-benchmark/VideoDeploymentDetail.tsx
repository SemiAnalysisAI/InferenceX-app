'use client';

import { ChevronLeft } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Distribution } from '@/components/inference/agentic-point/distribution';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { ShareButton } from '@/components/ui/share-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { layoutLabel } from './deployment';
import { detailLinks } from './detail-links';
import { runtimeLabel } from './optimizations';
import { costPerGpuHour, hardwareLabel } from './hardware';
import { TIER_LABELS } from './metrics';
import type { ResultCell, ResultsState } from './results';
import { COST_BASES, resultsPointKey } from './results-chart';
import { usePowerTrace } from './use-power-trace';
import { ScrollFade } from './use-scroll-fade';
import { cost, reading } from './format';
import { ResultsLines, resultsNumber as n } from './VideoResultsCharts';
import styles from './results.module.css';

const STRINGS = {
  en: {
    back: 'Back to overview',
    unofficial: 'Unofficial run',
    deployments: 'Deployments',
    clips: 'clips',
    notMeasuredGpus: (count: number) => `${count} GPU · not measured`,
    gpus: 'GPUs',
    gpuDetail: (participating: string, allocated: string) =>
      `${participating} participating · ${allocated} allocated`,
    concurrency: 'Concurrency',
    engine: 'Engine',
    runtime: 'Runtime',
    workload: 'Workload',
    valid: 'Valid clips',
    power: 'Power evidence',
    rate: (tier: string) => `$/GPU-hr · ${tier}`,
    validPower: 'Valid',
    invalidPower: 'Invalid',
    notRecorded: 'Not recorded',
    telemetry: 'Telemetry',
    validity: 'Validity',
    sources: 'Sources',
    latency: 'Per-clip latency',
    latencyBoundary: 'Submit to downloaded media',
    recorded: (p50: string) => `Recorded median ${p50}`,
    deadline: (seconds: string, share: string | null) =>
      share === null
        ? `Deadline ${seconds} s · attainment needs every valid request time`
        : `Deadline ${seconds} s · ${share} of valid clips met it`,
    trace: 'GPU board power over time',
    traceLoading: 'Loading power trace…',
    traceFailed: 'Power trace could not be loaded',
    time: 'Time (s)',
    powerSummary: (avg: string, peak: string) => `Average ${avg} · observed peak ${peak}`,
    energy: 'Energy',
    perClip: 'kJ per valid clip',
    perFrame: 'J per frame',
    energyNote: 'GPU boards only. Host, chassis and facility energy excluded.',
    throughput: 'Throughput',
    videoSecondsPerHour: 'video-s per hour',
    clipsPerSecond: 'valid clips per s',
    videoSecondsPerSecond: 'video-s per wall s',
    goodput: 'clips per s within deadline',
    cost: 'Modelled cost',
    basis: 'GPU basis',
    participating: 'Participating',
    allocated: 'Allocated',
    perHour: '$ / hr',
    startup: 'Warmup and failures',
    warmup: 'Recorded warmup request duration',
    failures: 'Failed measured requests',
    timeout: 'Timeout',
    oom: 'OOM',
    engineError: 'Engine error',
    transport: 'Transport error',
    other: 'Unclassified',
    memory: 'GPU memory',
    identity: 'Workload identity',
    workloadHash: 'Workload hash',
    manifestHash: 'Manifest hash',
    completion: 'Completion',
    scheduled: 'Scheduled',
    attempted: 'Attempted',
    completed: 'Completed',
    failed: 'Failed',
    notStarted: 'Not started',
    integrity: 'Integrity',
    sealed: 'SHA256SUMS',
    verified: 'Verified',
    psnr: 'Per-clip PSNR → comparison clips',
    model: 'Model',
    run: 'Run ID',
    artifact: 'Artifact ID',
    point: 'Observation ID',
    approval: 'Publication approval',
    approved: 'Approved',
    unapproved: 'No matching approval receipt',
    actions: 'Run actions',
    actionRun: 'GitHub Actions run',
    actionArtifact: 'Download artifact',
    actionReproduce: 'Reproduce',
    actionRunShort: 'GitHub run',
    actionArtifactShort: 'Artifact',
  },
  zh: {
    back: '返回概览',
    unofficial: '非官方运行',
    deployments: '部署',
    clips: '条视频',
    notMeasuredGpus: (count: number) => `${count} 张 GPU · 未测量`,
    gpus: 'GPU',
    gpuDetail: (participating: string, allocated: string) =>
      `参与计算 ${participating} 张 · 分配 ${allocated} 张`,
    concurrency: '并发数',
    engine: '引擎',
    runtime: 'Runtime',
    workload: '工作负载',
    valid: '有效视频',
    power: '功率证据',
    rate: (tier: string) => `$/GPU-hr · ${tier}`,
    validPower: '有效',
    invalidPower: '无效',
    notRecorded: '未记录',
    telemetry: '遥测',
    validity: '有效性',
    sources: '来源',
    latency: '单条视频延迟',
    latencyBoundary: '从提交请求到下载完媒体',
    recorded: (p50: string) => `记录的中位延迟 ${p50}`,
    deadline: (seconds: string, share: string | null) =>
      share === null
        ? `截止时间 ${seconds} s · 需要全部有效请求的时间记录才能计算达成率`
        : `截止时间 ${seconds} s · ${share} 的有效视频按时完成`,
    trace: 'GPU 板卡功率时间序列',
    traceLoading: '正在加载功率时间序列…',
    traceFailed: '无法加载功率时间序列',
    time: '时间（s）',
    powerSummary: (avg: string, peak: string) => `平均 ${avg} · 观测峰值 ${peak}`,
    energy: '能耗',
    perClip: '每条有效视频能耗（kJ）',
    perFrame: '每帧能耗（J）',
    energyNote: '仅统计 GPU 板卡，不含主机、机箱和设施能耗。',
    throughput: '吞吐量',
    videoSecondsPerHour: '每小时生成的视频秒数',
    clipsPerSecond: '每秒有效视频数',
    videoSecondsPerSecond: '每测量秒生成的视频秒数',
    goodput: '每秒按时完成的视频数',
    cost: 'TCO 估算',
    basis: 'GPU 口径',
    participating: '参与计算',
    allocated: '分配',
    perHour: '$ / hr',
    startup: 'warmup 与失败',
    warmup: '已记录的 warmup 请求时长',
    failures: '失败的测量请求',
    timeout: '超时',
    oom: 'OOM',
    engineError: '引擎错误',
    transport: '传输错误',
    other: '未分类',
    memory: 'GPU 显存',
    identity: '工作负载身份',
    workloadHash: '工作负载哈希',
    manifestHash: 'Manifest 哈希',
    completion: '完成情况',
    scheduled: '计划',
    attempted: '已尝试',
    completed: '已完成',
    failed: '失败',
    notStarted: '未启动',
    integrity: '完整性',
    sealed: 'SHA256SUMS',
    verified: '已验证',
    psnr: '逐条视频 PSNR → 视频对比',
    model: '模型',
    run: '运行 ID',
    artifact: '产物 ID',
    point: '观测 ID',
    approval: '发布批准',
    approved: '已批准',
    unapproved: '未找到匹配的发布批准回执',
    actions: '运行操作',
    actionRun: 'GitHub Actions 运行',
    actionArtifact: '下载产物',
    actionReproduce: '复现',
    actionRunShort: 'GitHub 运行',
    actionArtifactShort: '产物',
  },
};

/** A cost under a "$" column heading, or a dash when it could not be modelled. */
const costFigures = (value: number | null | undefined) => cost(value)?.slice(1) ?? '—';

const withUnit = (value: number | null | undefined, unit: string, digits: number) =>
  value === null || value === undefined ? '—' : `${n(value, digits)} ${unit}`;

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading as="h3" level="label">
          {title}
        </Heading>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Pairs two facts per row on phones; a `wide` fact (long prose) takes the full row there. */
function Facts({ rows }: { rows: [string, ReactNode, { wide?: boolean }?][] }) {
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm sm:gap-x-6 lg:grid-cols-4">
      {rows.map(([label, value, options]) => (
        <div key={label} className={options?.wide ? 'col-span-2 min-w-0 sm:col-span-1' : 'min-w-0'}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function VideoDeploymentDetail({
  cell,
  siblings,
  gpuCounts,
  workloadLabel,
  state,
  color,
  notMeasured,
  onBack,
  onSelect,
  onPsnr,
}: {
  cell: ResultCell;
  /** Deployments of the same hardware, runtime and run channel across every GPU count. */
  siblings: ResultCell[];
  gpuCounts: number[];
  workloadLabel: string;
  state: ResultsState;
  color: string;
  notMeasured: string;
  onBack: () => void;
  onSelect: (cell: ResultCell) => void;
  onPsnr: () => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const { point, evidence } = cell;
  const hardware = hardwareLabel(point.hardwareKey ?? '');
  const engine = runtimeLabel(cell.metadata.engine, cell.metadata.optimizations) ?? s.notRecorded;
  const powerEvidence =
    evidence?.powerValid === true
      ? s.validPower
      : evidence?.powerValid === false
        ? s.invalidPower
        : s.notRecorded;
  const measuredCounts = new Set(siblings.map((sibling) => sibling.point.participating));
  /** A deployment's GPU count, then its server layout, concurrency and clip count. */
  const deploymentParts = ({ point: p }: ResultCell) => {
    const [gpus, ...layout] = layoutLabel(p, locale).split(' · ');
    return [gpus, layout.join(' · '), `c=${p.concurrency}`, `${n(p.valid, 0)} ${s.clips}`];
  };
  // A segment shows the GPU count, plus only the parts that tell it from a sibling with that count.
  const deploymentNames = siblings.map(deploymentParts).map((parts, _, all) => {
    let rivals = all.filter((other) => other !== parts && other[0] === parts[0]);
    const short = parts.filter((part, index) => {
      const tells = index === 0 || rivals.some((other) => other[index] !== part);
      if (tells) rivals = rivals.filter((other) => other[index] === part);
      return tells;
    });
    return short.join(' · ');
  });
  const failures = evidence?.failures ?? null;
  // Older History has no sample count, so only a recorded zero skips the artifact read.
  const trace = usePowerTrace(
    point,
    state.unofficialRun,
    evidence?.powerValid === true && evidence.powerSamples !== 0,
  );
  const actionLabel = {
    run: s.actionRun,
    artifact: s.actionArtifact,
    reproduce: s.actionReproduce,
  };
  const actionShortLabel = {
    run: s.actionRunShort,
    artifact: s.actionArtifactShort,
    reproduce: s.actionReproduce,
  };
  // The latency histogram reads in milliseconds; a phone gets a narrower canvas so its labels stay legible.
  const latenciesMs = useMemo(
    () => evidence?.latencies?.map((seconds) => seconds * 1000) ?? null,
    [evidence?.latencies],
  );
  const phone = useIsMobileViewport();
  const median = reading(point.p50);
  const code = (value: string | null | undefined) => (
    <span className="break-all font-mono text-xs">{value || s.notRecorded}</span>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="video-results-detail">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          data-testid="results-detail-back"
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" />
          {s.back}
        </Button>
      </div>
      <Card>
        <div className="flex min-w-0 flex-col gap-4">
          <DashboardSectionHeader
            headingAs="h1"
            title={
              <span>
                <span
                  className={`${styles.dot} mr-2 align-middle`}
                  style={{ background: color }}
                  aria-hidden="true"
                />
                {[hardware, cell.metadata.model, engine].join(' · ')}
              </span>
            }
            description={[
              cell.metadata.date ?? s.notRecorded,
              ...(cell.overlay ? [`${s.unofficial} #${point.runId}`] : []),
            ].join(' · ')}
            actions={<ShareButton />}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{s.deployments}</span>
            {/* One row at every width: more deployments than fit scroll sideways. */}
            <SegmentedToggle
              role="group"
              ariaLabel={s.deployments}
              testId="results-detail-deployments"
              className="flex-nowrap overflow-x-auto"
              buttonClassName="shrink-0 text-xs whitespace-nowrap max-sm:px-1"
              value={resultsPointKey(cell)}
              options={siblings.map((sibling, index) => ({
                value: resultsPointKey(sibling),
                label: deploymentNames[index],
              }))}
              onValueChange={(key) => {
                const next = siblings.find((sibling) => resultsPointKey(sibling) === key);
                if (next && key !== resultsPointKey(cell)) onSelect(next);
              }}
            />
            {gpuCounts
              .filter((count) => !measuredCounts.has(count))
              .toSorted((a, b) => a - b)
              .map((count) => (
                <span
                  key={count}
                  className="inline-flex h-8 items-center rounded-md border border-dashed px-3 text-muted-foreground"
                >
                  {s.notMeasuredGpus(count)}
                </span>
              ))}
            {/* The segments name what tells the deployments apart; this line names the open one in full. */}
            <p className="w-full text-muted-foreground" data-testid="results-detail-deployment">
              {deploymentParts(cell).filter(Boolean).join(' · ')}
            </p>
          </div>
          <Facts
            rows={[
              [s.gpus, s.gpuDetail(n(point.participating, 0), n(point.allocated, 0))],
              [s.concurrency, n(point.concurrency, 0)],
              [s.engine, engine],
              [s.runtime, code(point.runtime.slice(0, 12))],
              [s.workload, workloadLabel, { wide: true }],
              [s.valid, `${n(point.valid, 0)} / ${n(point.scheduled, 0)}`],
              [s.power, powerEvidence],
              [
                s.rate(TIER_LABELS[state.costTier][locale]),
                n(costPerGpuHour(point.hardwareKey ?? '', state.costTier), 2),
              ],
            ]}
          />
          <div
            className="grid grid-cols-3 gap-2 border-t border-border/70 pt-4 sm:flex sm:flex-wrap"
            role="group"
            aria-label={s.actions}
            data-testid="results-detail-actions"
          >
            {detailLinks(point).map((link) => (
              <Button key={link.action} asChild variant="outline" size="sm" className="min-w-0">
                <a
                  aria-label={actionLabel[link.action]}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-action={link.action}
                  onClick={() =>
                    track('video_results_detail_action_opened', { action: link.action })
                  }
                >
                  <span className="truncate sm:hidden">{actionShortLabel[link.action]}</span>
                  <span className="max-sm:hidden">{actionLabel[link.action]}</span>
                </a>
              </Button>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <Tabs
          defaultValue="telemetry"
          onValueChange={(tab) => track('video_results_detail_tab_changed', { tab })}
        >
          <TabsList aria-label={hardware} className="border-b">
            <TabsTrigger value="telemetry" data-testid="results-detail-tab-telemetry">
              {s.telemetry}
            </TabsTrigger>
            <TabsTrigger value="validity" data-testid="results-detail-tab-validity">
              {s.validity}
            </TabsTrigger>
            <TabsTrigger value="sources" data-testid="results-detail-tab-sources">
              {s.sources}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="telemetry" className="flex flex-col gap-4 pt-2">
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <Panel title={s.latency} note={s.latencyBoundary}>
                {latenciesMs ? (
                  <Distribution
                    values={latenciesMs}
                    unit="ms"
                    percentiles={['p50']}
                    width={phone ? 380 : 720}
                    height={phone ? 240 : 260}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">{s.notRecorded}</p>
                )}
                <p className="text-xs" data-testid="results-detail-latency">
                  {s.recorded(median === null ? '—' : `${median} s`)}
                </p>
                <p className="text-xs">
                  {s.deadline(
                    n(state.deadlineSeconds),
                    cell.deadlineAttainment === null
                      ? null
                      : `${n(cell.deadlineAttainment * 100, 0)}%`,
                  )}
                </p>
              </Panel>
              <Panel title={s.trace}>
                <div data-testid="results-power-trace">
                  {trace.status === 'ready' && trace.samples.length > 0 ? (
                    <ResultsLines
                      series={[
                        {
                          key: point.hardwareKey ?? '',
                          label: hardware,
                          color,
                          points: trace.samples.map((sample) => ({
                            x: sample.seconds,
                            y: sample.watts,
                          })),
                        },
                      ]}
                      label={s.trace}
                      xLabel={s.time}
                      yLabel="W"
                      width={phone ? 380 : 630}
                    />
                  ) : trace.status === 'loading' ? (
                    // Holds the chart's canvas, so the panel does not grow when the trace arrives.
                    <Skeleton
                      className={phone ? 'aspect-[380/262] w-full' : 'aspect-[630/262] w-full'}
                      role="status"
                      aria-label={s.traceLoading}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {trace.status === 'failed' ? s.traceFailed : s.notRecorded}
                    </p>
                  )}
                </div>
                <p className="text-xs">
                  {s.powerSummary(
                    withUnit(point.avgPowerW, 'W', 0),
                    withUnit(evidence?.peakPowerW, 'W', 0),
                  )}
                </p>
              </Panel>
              <Panel title={s.energy}>
                <div className="grid grid-cols-2 gap-4">
                  <Stat
                    value={
                      reading(cell.joulesPerClip === null ? null : cell.joulesPerClip / 1000) ?? '—'
                    }
                    label={s.perClip}
                  />
                  <Stat value={reading(cell.joulesPerFrame) ?? '—'} label={s.perFrame} />
                </div>
                <p className="text-xs text-muted-foreground">{s.energyNote}</p>
              </Panel>
              <Panel title={s.throughput}>
                <div className="grid grid-cols-2 gap-4">
                  <Stat value={n(point.videoSecondsPerHour, 0)} label={s.videoSecondsPerHour} />
                  <Stat value={n(cell.videoSecondsPerSecond, 3)} label={s.videoSecondsPerSecond} />
                  <Stat value={n(cell.clipsPerSecond, 4)} label={s.clipsPerSecond} />
                  <Stat value={n(cell.deadlineGoodput, 4)} label={s.goodput} />
                </div>
              </Panel>
              <Panel title={s.cost} note={TIER_LABELS[state.costTier][locale]}>
                <ScrollFade className={styles.scroll}>
                  <table className={`${styles.table} text-xs`} data-testid="results-detail-cost">
                    <thead>
                      <tr>
                        {[s.basis, s.gpus, '$ / video', '$ / video-s', s.perHour].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {COST_BASES.map((basis) => (
                        <tr key={basis} data-basis={basis}>
                          <td>{s[basis]}</td>
                          <td>{n(point[basis], 0)}</td>
                          <td data-value={cell.cost[basis]?.perVideo}>
                            {costFigures(cell.cost[basis]?.perVideo)}
                          </td>
                          <td>{costFigures(cell.cost[basis]?.perVideoSecond)}</td>
                          <td>{n(cell.cost[basis]?.perHour, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollFade>
              </Panel>
              <Panel title={s.startup}>
                <Stat
                  value={
                    evidence?.warmupSeconds === null || evidence?.warmupSeconds === undefined
                      ? s.notRecorded
                      : `${n(evidence.warmupSeconds, 1)} s`
                  }
                  label={s.warmup}
                />
                <dl
                  className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs sm:grid-cols-5"
                  data-testid="results-detail-failures"
                >
                  {(
                    [
                      ['timeout', s.timeout],
                      ['oom', s.oom],
                      ['engine', s.engineError],
                      ['transport', s.transport],
                      ['other', s.other],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">{failures ? failures[key] : s.notRecorded}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">
                  {s.failures}: {n(point.failed, 0)}
                </p>
              </Panel>
              {typeof evidence?.gpuMemoryMiB === 'number' && (
                <Panel title={s.memory}>
                  <Stat value={`${n(evidence.gpuMemoryMiB, 0)} MiB`} label={s.memory} />
                </Panel>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{notMeasured}</p>
          </TabsContent>
          <TabsContent value="validity" className="flex flex-col gap-4 pt-2">
            <Panel title={s.identity}>
              <Facts
                rows={[
                  [s.workloadHash, code(evidence?.workloadHash), { wide: true }],
                  [s.manifestHash, code(evidence?.manifestHash), { wide: true }],
                ]}
              />
            </Panel>
            <Panel title={s.completion}>
              <ScrollFade className={styles.scroll}>
                <table className={`${styles.table} text-xs`} data-testid="results-detail-counts">
                  <thead>
                    <tr>
                      {[s.scheduled, s.attempted, s.completed, s.valid, s.failed, s.notStarted].map(
                        (label) => (
                          <th key={label}>{label}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {[
                        point.scheduled,
                        evidence?.attempted,
                        point.completed,
                        point.valid,
                        point.failed,
                        evidence?.notStarted,
                      ].map((value, index) => (
                        <td key={index}>{n(value, 0)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </ScrollFade>
            </Panel>
            <Panel title={s.integrity}>
              <Facts
                rows={[
                  [s.sealed, evidence?.verified ? s.verified : s.notRecorded],
                  [s.power, powerEvidence],
                  [s.runtime, code(point.runtime), { wide: true }],
                ]}
              />
              <a
                href="#comparison-clips"
                className="text-sm underline"
                onClick={(event) => {
                  event.preventDefault();
                  track('video_results_quality_clips_opened', { metric: 'psnr' });
                  onPsnr();
                }}
              >
                {s.psnr}
              </a>
            </Panel>
          </TabsContent>
          <TabsContent value="sources" className="pt-2">
            <Panel title={s.sources}>
              <Facts
                rows={[
                  [s.model, cell.metadata.model],
                  [s.workload, point.workload, { wide: true }],
                  [s.runtime, code(point.runtime), { wide: true }],
                  [s.run, code(point.runId)],
                  [s.artifact, code(String(point.artifactId))],
                  [s.point, code(point.id)],
                  [s.approval, point.approved ? s.approved : s.unapproved],
                ]}
              />
            </Panel>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

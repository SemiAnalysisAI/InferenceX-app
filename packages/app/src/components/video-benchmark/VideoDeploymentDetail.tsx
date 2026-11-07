'use client';

import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Distribution } from '@/components/inference/agentic-point/distribution';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { ShareButton } from '@/components/ui/share-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { layoutLabel } from './deployment';
import { engineLabel } from './engines';
import { costPerGpuHour, hardwareLabel } from './hardware';
import { TIER_LABELS } from './metrics';
import type { ResultCell, ResultsState } from './results';
import { COST_BASES, resultsPointKey } from './results-chart';
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
    recorded: (p50: string, p90: string, p95: string) =>
      `Recorded P50 ${p50} · P90 ${p90} · P95 ${p95}`,
    deadline: (seconds: string, share: string | null) =>
      share === null
        ? `Deadline ${seconds} s · attainment needs every valid request time`
        : `Deadline ${seconds} s · ${share} of valid clips met it`,
    trace: 'GPU board power over time',
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
    recorded: (p50: string, p90: string, p95: string) =>
      `记录值 P50 ${p50} · P90 ${p90} · P95 ${p95}`,
    deadline: (seconds: string, share: string | null) =>
      share === null
        ? `截止时间 ${seconds} s · 需要全部有效请求的时间记录才能计算达成率`
        : `截止时间 ${seconds} s · ${share} 的有效视频按时完成`,
    trace: 'GPU 板卡功率时间序列',
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
  },
};

const withUnit = (value: number | null | undefined, unit: string, digits: number) =>
  value === null || value === undefined ? '—' : `${n(value, digits)} ${unit}`;

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 p-4">
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

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
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
  /** Deployments of the same hardware, engine and run channel across every GPU count. */
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
  const engine = cell.metadata.engine ? engineLabel(cell.metadata.engine) : s.notRecorded;
  const powerEvidence =
    evidence?.powerValid === true
      ? s.validPower
      : evidence?.powerValid === false
        ? s.invalidPower
        : s.notRecorded;
  const measuredCounts = new Set(siblings.map((sibling) => sibling.point.participating));
  const failures = evidence?.failures ?? null;
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
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className={styles.dot} style={{ background: color }} />
                {[hardware, cell.metadata.model, engine].join(' · ')}
              </span>
            }
            description={[
              cell.metadata.date ?? s.notRecorded,
              ...(cell.overlay ? [`${s.unofficial} #${point.runId}`] : []),
            ].join(' · ')}
            actions={<ShareButton />}
          />
          <div
            className="flex flex-wrap items-center gap-2 text-xs"
            role="group"
            aria-label={s.deployments}
            data-testid="results-detail-deployments"
          >
            <span className="text-muted-foreground">{s.deployments}</span>
            {siblings.map((sibling) => {
              const selected = resultsPointKey(sibling) === resultsPointKey(cell);
              return (
                <Button
                  key={resultsPointKey(sibling)}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-pressed={selected}
                  className="text-xs"
                  onClick={() => {
                    if (!selected) onSelect(sibling);
                  }}
                >
                  {layoutLabel(sibling.point, locale)} · c={sibling.point.concurrency} ·{' '}
                  {n(sibling.point.valid, 0)} {s.clips}
                </Button>
              );
            })}
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
          </div>
          <Facts
            rows={[
              [s.gpus, s.gpuDetail(n(point.participating, 0), n(point.allocated, 0))],
              [s.concurrency, n(point.concurrency, 0)],
              [s.engine, engine],
              [s.runtime, code(point.runtime.slice(0, 12))],
              [s.workload, workloadLabel],
              [s.valid, `${n(point.valid, 0)} / ${n(point.scheduled, 0)}`],
              [s.power, powerEvidence],
              [
                s.rate(TIER_LABELS[state.costTier][locale]),
                n(costPerGpuHour(point.hardwareKey ?? '', state.costTier), 2),
              ],
            ]}
          />
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
                {evidence?.latencies ? (
                  <Distribution values={evidence.latencies} unit="s" />
                ) : (
                  <p className="text-xs text-muted-foreground">{s.notRecorded}</p>
                )}
                <p className="text-xs" data-testid="results-detail-latency">
                  {s.recorded(
                    withUnit(point.p50, 's', 1),
                    withUnit(point.p90, 's', 1),
                    withUnit(cell.p95, 's', 1),
                  )}
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
                  {evidence?.powerSeries.length ? (
                    <ResultsLines
                      series={[
                        {
                          key: point.hardwareKey ?? '',
                          label: hardware,
                          color,
                          points: evidence.powerSeries.map((sample) => ({
                            x: sample.seconds,
                            y: sample.watts,
                          })),
                        },
                      ]}
                      label={s.trace}
                      xLabel={s.time}
                      yLabel="W"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">{s.notRecorded}</p>
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
                    value={n(cell.joulesPerClip === null ? null : cell.joulesPerClip / 1000, 1)}
                    label={s.perClip}
                  />
                  <Stat value={n(cell.joulesPerFrame, 1)} label={s.perFrame} />
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
                <div className={styles.scroll}>
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
                            {n(cell.cost[basis]?.perVideo, 4)}
                          </td>
                          <td>{n(cell.cost[basis]?.perVideoSecond, 4)}</td>
                          <td>{n(cell.cost[basis]?.perHour, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                <div className={styles.scroll}>
                  <table className={`${styles.table} text-xs`}>
                    <thead>
                      <tr>
                        {[s.timeout, s.oom, s.engineError, s.transport, s.other].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {(['timeout', 'oom', 'engine', 'transport', 'other'] as const).map(
                          (key) => (
                            <td key={key}>{failures ? failures[key] : s.notRecorded}</td>
                          ),
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
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
                  [s.workloadHash, code(evidence?.workloadHash)],
                  [s.manifestHash, code(evidence?.manifestHash)],
                ]}
              />
            </Panel>
            <Panel title={s.completion}>
              <div className={styles.scroll}>
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
              </div>
            </Panel>
            <Panel title={s.integrity}>
              <Facts
                rows={[
                  [s.sealed, evidence?.verified ? s.verified : s.notRecorded],
                  [s.power, powerEvidence],
                  [s.runtime, code(point.runtime)],
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
                  [s.workload, point.workload],
                  [s.runtime, code(point.runtime)],
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

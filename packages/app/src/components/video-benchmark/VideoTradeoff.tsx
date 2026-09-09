'use client';

import { useMemo, useState } from 'react';
import { schemeTableau10, type Selection } from 'd3';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heading } from '@/components/ui/heading';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml } from '@/lib/utils';
import { track } from '@/lib/analytics';
import VideoSelect from './VideoSelect';
import {
  tradeoffPoints,
  latencyValue,
  efficiencyValue,
  type TradeoffRun,
  type TradeoffPoint,
  type LatencyAxis,
  type EfficiencyAxis,
  type DeploymentCost,
} from './tradeoff';

const STRINGS = {
  en: {
    title: 'Video serving tradeoffs',
    subtitle: 'Compare identical workloads across hardware and runtime configurations.',
    scope:
      'Share this page’s link to reopen the same CI results. Cost assumptions stay in this browser session and reset on reload.',
    workload: 'Matched workload',
    x: 'Latency axis · lower is better',
    y: 'Efficiency axis · higher is better',
    p90: 'P90 client-ready latency (s)',
    median: 'Median client-ready latency (s)',
    dollar: 'Valid clips / USD',
    clipsGpu: 'Valid clips / allocated GPU-hour',
    secondsGpu: 'Video seconds / allocated GPU-hour',
    energy: 'Valid clips / GPU-board kWh',
    latencyNote:
      'Client-ready = submission to fully downloaded media, including polling; local validation is excluded from latency. P90 uses nearest rank and requires at least 10 complete valid-request samples here. This display floor does not establish tail-latency reliability. Failed requests stay visible in the counts.',
    throughputNote:
      'Throughput uses the recorded measurement wall window, including failed attempts and client overhead. Serial runs are diagnostics, not demonstrated serving capacity. GPU-hour views charge every reserved GPU, including idle allocations.',
    qualityNote:
      'Matching fixes the model revision, generation settings and prompt/seed/input workload. Precision, caching and runtime changes still require fidelity review. Technical validity does not establish perceptual quality; uncalibrated points are not qualified winners.',
    energyNote:
      'Energy efficiency uses the backend measurement-phase joules per valid clip. It covers participating GPU boards only, excluding other allocated GPUs, CPUs, cooling and storage. It is not facility efficiency.',
    noPoints: 'No points qualify for these axes yet.',
    diagnose: 'Inspect available serial results',
    empty: 'Open a CI result to add its baseline and candidate.',
    requirements:
      'Choose median latency for single-request diagnostics. Cost plots also need a full deployment cost, source and date for each point.',
    point: 'Point',
    baseline: 'Baseline',
    candidate: 'Candidate',
    samples: 'Valid latency samples',
    counts: 'Valid / completed / scheduled',
    failed: 'Failed or invalid',
    status: 'Plot status',
    missing: 'Missing workload, latency samples, GPU count, energy or cost assumptions',
    plotted: 'Shown',
    details: 'Selected point',
    hardware: 'Hardware',
    runtime: 'Runtime revision',
    model: 'Model revision',
    concurrency: 'Client concurrency',
    allocated: 'Allocated / participating GPUs',
    window: 'Measurement window (s)',
    power: 'Mean total participating-board power (W)',
    energyClip: 'GPU-board energy / valid clip (J)',
    powerWindow: 'Measured power window (s)',
    batch: 'Replica layout / actual batch size / offered arrival rate',
    queue: 'Queue delay / server-ready timestamp / deadline attainment',
    unavailable: 'Unavailable in this result contract',
    server: 'Recorded server settings',
    fidelity: 'Recorded fidelity and policy',
    open: 'Open videos and full result',
    ci: 'Exact CI run',
    costTitle: 'Cost assumptions for this point',
    hourly: 'Whole deployment cost (USD/hour)',
    source: 'Cost source and included items',
    date: 'Cost as of',
    costNote:
      'Enter the total hourly cost of the complete deployment, including all billed GPUs and host, power, cooling, network, storage and operating costs. Clips/USD = valid clips/hour ÷ deployment USD/hour. User-entered estimates; no selling price or profit is implied.',
    methods: 'Measurement definitions and comparison limits',
    diagnostic: 'Serial diagnostics · serving capacity not measured',
    servingSmoke: 'Closed-loop smoke · serving capacity not qualified',
    servingNote:
      'Each point is one concurrency cell. Latency samples are never pooled across cells; P90 needs at least 10 valid samples in that cell. Throughput covers submission to fully downloaded media, including failures and transfer; local validation runs afterwards. GPU-board energy integrates the shared measurement envelope once, without summing overlapping request windows.',
    servingMedian: 'Show cell medians',
    boundary: 'Throughput measurement boundary',
    deliveryBoundary: 'Submission to downloaded media; local validation excluded',
    load: 'Load pattern',
    closedLoop: 'Closed loop',
    observed: 'Observed points; no fitted frontier or hardware winner.',
    controls:
      'Shift+scroll to zoom; drag to pan; double-click to reset. Select a point or table row for details.',
  },
  zh: {
    title: '视频服务延迟与效率权衡',
    subtitle: '在相同工作负载下比较硬件与运行时配置。',
    scope:
      '分享当前页面链接即可重新打开同一组 CI 结果。成本假设仅保留在当前浏览器会话中，刷新后重置。',
    workload: '匹配的工作负载',
    x: '延迟轴 · 越低越好',
    y: '效率轴 · 越高越好',
    p90: 'P90 客户端就绪延迟（秒）',
    median: '客户端就绪延迟中位数（秒）',
    dollar: '有效视频数 / USD',
    clipsGpu: '有效视频数 / 已分配 GPU 小时',
    secondsGpu: '生成视频秒数 / 已分配 GPU 小时',
    energy: '有效视频数 / GPU 板卡 kWh',
    latencyNote:
      '客户端就绪指从提交到媒体完整下载完成，包含轮询等待，不包含本地验证。P90 使用最近秩法，此处至少需要 10 个完整的有效请求样本；这只是显示门槛，不代表尾延迟估计具有统计可靠性。失败请求仍保留在计数中。',
    throughputNote:
      '吞吐量使用记录的测量墙钟时间窗口，包含失败尝试与客户端开销。串行运行仅用于诊断，不能证明服务容量。GPU 小时指标计入所有预留 GPU，包括空闲的已分配资源。',
    qualityNote:
      '工作负载匹配固定了模型版本、生成设置以及 prompt、seed 和输入工作负载。精度、缓存和运行时变更仍需审查保真度。技术有效性不代表感知质量；未校准的点不能作为合格的性能优胜结果。',
    energyNote:
      '能效使用后端测量阶段每个有效视频的 GPU 板卡能耗（焦耳），仅涵盖参与计算的 GPU 板卡，不含其他已分配 GPU、CPU、散热或存储，也不代表设施能效。',
    noPoints: '当前坐标轴下尚无满足条件的数据点。',
    diagnose: '查看已有串行诊断结果',
    empty: '打开 CI 结果即可加入基线与候选数据。',
    requirements:
      '单请求诊断请选择延迟中位数。成本视图还需要为每个点填写完整部署成本、来源与日期。',
    point: '数据点',
    baseline: '基线',
    candidate: '候选',
    samples: '有效延迟样本数',
    counts: '有效 / 已完成 / 计划',
    failed: '失败或无效',
    status: '绘图状态',
    missing: '缺少工作负载、延迟样本、GPU 数量、能耗或成本假设',
    plotted: '已显示',
    details: '所选数据点',
    hardware: '硬件',
    runtime: '运行时版本',
    model: '模型版本',
    concurrency: '客户端并发数',
    allocated: '已分配 / 参与计算的 GPU 数',
    window: '测量时段（秒）',
    power: '参与计算板卡总功率均值（W）',
    energyClip: '每有效视频 GPU 板卡能耗（J）',
    powerWindow: '功率测量窗口（秒）',
    batch: '副本布局 / 实际批次大小 / 施加的请求到达率',
    queue: '排队延迟 / 服务端就绪时间戳 / 时限达标情况',
    unavailable: '此结果格式未提供',
    server: '已记录的服务端设置',
    fidelity: '已记录的保真度与判定策略',
    open: '打开视频与完整结果',
    ci: '对应的 CI 运行',
    costTitle: '此数据点的成本假设',
    hourly: '完整部署成本（USD/小时）',
    source: '成本来源及涵盖项目',
    date: '成本基准日期',
    costNote:
      '填写完整部署每小时总成本，涵盖所有计费 GPU、主机、电力、散热、网络、存储和运营成本。有效视频数/USD = 每小时有效视频数 ÷ 部署每小时 USD 成本。数值为用户填写的估算，不代表售价或利润。',
    methods: '测量定义与比较限制',
    diagnostic: '串行诊断 · 尚未测量服务容量',
    servingSmoke: '闭环冒烟测试 · 服务容量未经验证',
    servingNote:
      '每个点对应一个并发配置，延迟样本按配置独立统计；P90 要求该配置至少有 10 个有效样本。吞吐量窗口从提交到媒体完整下载，涵盖失败请求和传输，本地验证在此后执行。GPU 板卡能耗仅对共享测量窗口积分一次，不累加相互重叠的请求窗口。',
    servingMedian: '显示各配置的延迟中位数',
    boundary: '吞吐量测量边界',
    deliveryBoundary: '从提交到媒体下载完成；不含本地验证',
    load: '负载模式',
    closedLoop: '闭环',
    observed: '仅显示观测点，不拟合前沿曲线，也不判定硬件优胜者。',
    controls: 'Shift+滚轮缩放，拖动平移，双击重置。选择数据点或表格行查看详情。',
  },
};
const fmt = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 3 });
const blankCost: DeploymentCost = { hourly: '', source: '', date: '' };

export default function VideoTradeoff({
  runs,
  onOpen,
  sourceId,
}: {
  runs: TradeoffRun[];
  onOpen: (point: TradeoffPoint) => void;
  sourceId?: string;
}) {
  const s = STRINGS[useLocale()];
  const all = useMemo(() => runs.flatMap(tradeoffPoints), [runs]);
  const [workload, setWorkload] = useState('');
  const [latencyAxis, setX] = useState<LatencyAxis | null>(null);
  const [yAxis, setY] = useState<EfficiencyAxis>('clipsGpu');
  const [selected, setSelected] = useState('');
  const [costs, setCosts] = useState<Record<string, DeploymentCost>>({});
  const groups = [...new Map(all.map((p) => [p.group, p.workloadLabel])).entries()];
  const group = groups.some(([key]) => key === workload)
    ? workload
    : (all.find((p) => p.sourceId === sourceId)?.group ?? groups[0]?.[0]);
  const points = all.filter((p) => p.group === group);
  const active = points.find((p) => p.id === selected) ?? points[0];
  const isServing = points.some((p) => p.role === 'serving');
  const xAxis =
    latencyAxis ??
    (isServing && !points.some((p) => latencyValue(p, 'p90') !== null) ? 'median' : 'p90');
  const plotted = points.flatMap((p) => {
    const x = latencyValue(p, xAxis),
      y = efficiencyValue(p, yAxis, costs[p.id]);
    return p.completeWorkload && x !== null && y !== null ? [{ ...p, x, y }] : [];
  });
  const drawPointLabels = (
    labelGroup: Selection<SVGGElement, unknown, null, undefined>,
    x: ContinuousScale,
    y: ContinuousScale,
  ) => {
    labelGroup
      .selectAll<SVGTextElement, (typeof plotted)[number]>('text.serving-point-label')
      .data(
        plotted.filter((p) => p.role === 'serving'),
        (p) => p.id,
      )
      .join('text')
      .attr('class', 'serving-point-label')
      .attr('x', (p) => x(p.x) + 10)
      .attr('y', (p) => y(p.y) - 10)
      .attr('font-size', px(CHART_TYPE.axisLabel))
      .attr('font-weight', 600)
      .attr('fill', 'var(--foreground)')
      .attr('pointer-events', 'none')
      .text((p) => `C${p.concurrency}`);
  };
  const hardware = [...new Set(all.map((p) => p.hardware))].sort();
  const color = (p: TradeoffPoint) =>
    schemeTableau10[hardware.indexOf(p.hardware) % schemeTableau10.length];
  const label = (p: TradeoffPoint) =>
    `${p.hardware || '—'} · ${p.role === 'serving' ? `${s.concurrency} ${p.concurrency}` : s[p.role]} · #${p.sourceId}`;
  const choose = (p: TradeoffPoint) => {
    setSelected(p.id);
    track('video_tradeoff_point_selected', { role: p.role, source: p.sourceId });
  };
  const cost = active ? (costs[active.id] ?? blankCost) : blankCost;
  const costInput = (key: keyof DeploymentCost, value: string) => {
    if (active)
      setCosts((old) => ({
        ...old,
        [active.id]: { ...(old[active.id] ?? blankCost), [key]: value },
      }));
  };
  return (
    <Card className="ph-no-capture ph-mask gap-4" data-testid="video-tradeoff">
      <div>
        <Heading level="section">{s.title}</Heading>
        <p className="mt-1 text-sm text-muted-foreground">{s.subtitle}</p>
      </div>
      <p className="text-xs text-muted-foreground">{s.scope}</p>
      {all.length === 0 ? (
        <p role="status">{s.empty}</p>
      ) : (
        <>
          <VideoSelect
            label={s.workload}
            value={group ?? ''}
            onValueChange={setWorkload}
            options={groups.map(([value, name], index) => ({
              value,
              label: `#${index + 1} · ${name}`,
            }))}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <VideoSelect
              label={s.x}
              value={xAxis}
              onValueChange={(value) => setX(value as LatencyAxis)}
              options={(['p90', 'median'] as const).map((value) => ({ value, label: s[value] }))}
            />
            <VideoSelect
              label={s.y}
              value={yAxis}
              onValueChange={(value) => setY(value as EfficiencyAxis)}
              options={(['dollar', 'clipsGpu', 'secondsGpu', 'energy'] as const).map((value) => ({
                value,
                label: s[value],
              }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {[...new Set(points.map((p) => p.hardware))].filter(Boolean).map((name) => (
              <span key={name} className="inline-flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      schemeTableau10[hardware.indexOf(name) % schemeTableau10.length],
                  }}
                />
                {name}
              </span>
            ))}
            {(isServing || points.every((p) => p.concurrency === 1)) && (
              <span className="rounded-md border px-2 py-1 text-muted-foreground">
                {isServing ? s.servingSmoke : s.diagnostic}
              </span>
            )}
          </div>
          {plotted.length > 0 ? (
            <D3Chart
              chartId="video-tradeoff"
              testId="video-tradeoff-chart"
              data={plotted}
              height={420}
              margin={{ top: 20, right: 24, bottom: 80, left: 85 }}
              watermark="logo"
              transitionDuration={0}
              xScale={{
                type: 'linear',
                domain: [0, Math.max(...plotted.map((p) => p.x)) * 1.12 || 1],
                nice: true,
              }}
              yScale={{
                type: 'linear',
                domain: [0, Math.max(...plotted.map((p) => p.y)) * 1.15 || 1],
                nice: true,
              }}
              xAxis={{ label: s[xAxis], tickCount: 5 }}
              yAxis={{ label: s[yAxis], tickCount: 5 }}
              layers={[
                {
                  type: 'point',
                  data: plotted,
                  config: {
                    getCx: () => 0,
                    getCy: () => 0,
                    getX: (p) => p.x,
                    getY: (p) => p.y,
                    getColor: color,
                    getRadius: () => 6,
                    stroke: 'var(--foreground)',
                    strokeWidth: 1,
                    keyFn: (p) => p.id,
                  },
                },
                {
                  type: 'custom',
                  key: 'serving-point-labels',
                  render: (labelGroup, ctx) =>
                    drawPointLabels(
                      labelGroup,
                      (ctx.renderedXScale ?? ctx.xScale) as ContinuousScale,
                      (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale,
                    ),
                  onZoom: (labelGroup, ctx) =>
                    drawPointLabels(
                      labelGroup,
                      ctx.newXScale as ContinuousScale,
                      ctx.newYScale as ContinuousScale,
                    ),
                },
              ]}
              tooltip={{
                rulerType: 'none',
                content: (p) =>
                  `<div class="p-3 text-sm">${escapeHtml(label(p))}<br/>${escapeHtml(s[xAxis])}: ${fmt(p.x)}<br/>${escapeHtml(s[yAxis])}: ${fmt(p.y)}<br/>n=${p.latencies.length}</div>`,
                onPointClick: choose,
              }}
              zoom={{ enabled: true, axes: 'both', scaleExtent: [1, 20] }}
              instructions={s.controls}
              caption={<p className="text-xs text-muted-foreground">{s.observed}</p>}
            />
          ) : (
            <div
              className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center"
              role="status"
            >
              <p className="font-medium">{s.noPoints}</p>
              <p className="max-w-2xl text-sm text-muted-foreground">{s.requirements}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setX('median');
                  setY('clipsGpu');
                }}
              >
                {isServing ? s.servingMedian : s.diagnose}
              </Button>
            </div>
          )}
          <details className="space-y-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">{s.methods}</summary>
            <p>{s.latencyNote}</p>
            <p>{isServing ? s.servingNote : s.throughputNote}</p>
            <p>{s.qualityNote}</p>
            {yAxis === 'energy' && <p>{s.energyNote}</p>}
          </details>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">{s.point}</th>
                  <th className="p-2">{s.samples}</th>
                  <th className="p-2">{s.counts}</th>
                  <th className="p-2">{s.failed}</th>
                  <th className="p-2">{s[xAxis]}</th>
                  <th className="p-2">{s[yAxis]}</th>
                  <th className="p-2">{s.status}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.id} className={`border-b ${active?.id === p.id ? 'bg-muted/50' : ''}`}>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-left text-primary underline"
                        onClick={() => choose(p)}
                      >
                        {label(p)}
                      </button>
                    </td>
                    <td className="p-2">{p.latencies.length}</td>
                    <td className="whitespace-nowrap p-2">
                      {fmt(p.valid)} / {fmt(p.completed)} / {fmt(p.scheduled)}
                    </td>
                    <td className="p-2">{fmt(p.failed)}</td>
                    <td className="p-2">{fmt(latencyValue(p, xAxis))}</td>
                    <td className="p-2">{fmt(efficiencyValue(p, yAxis, costs[p.id]))}</td>
                    <td className="p-2 text-xs">
                      {plotted.some((q) => q.id === p.id) ? s.plotted : s.missing}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {active && (
            <div className="grid gap-5 border-t pt-4 lg:grid-cols-2" data-testid="tradeoff-detail">
              <div className="space-y-3">
                <Heading>{s.details}</Heading>
                <p className="text-sm font-medium">{label(active)}</p>
                <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                  {[
                    [s.runtime, active.revision || '—'],
                    [s.model, active.modelRevision || '—'],
                    [s.allocated, `${fmt(active.allocated)} / ${fmt(active.participating)}`],
                    [s.concurrency, fmt(active.concurrency)],
                    ...(active.role === 'serving'
                      ? [
                          [s.load, s.closedLoop],
                          [s.boundary, s.deliveryBoundary],
                        ]
                      : []),
                    [s.window, fmt(active.wall)],
                    [s.power, fmt(active.power)],
                    [s.energyClip, fmt(active.energy)],
                    [s.powerWindow, fmt(active.powerWindow)],
                    [s.batch, s.unavailable],
                    [s.queue, s.unavailable],
                  ].map(([name, value]) => (
                    <div key={name} className="contents">
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => onOpen(active)}>
                    {s.open}
                  </Button>
                  <a
                    className="text-sm text-primary underline"
                    href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${active.sourceId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.ci}
                  </a>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs">{s.workload}</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(active.workload, null, 2)}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-xs">{s.server}</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(active.server, null, 2)}
                  </pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-xs">{s.fidelity}</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify({ fidelity: active.fidelity, policy: active.policy }, null, 2)}
                  </pre>
                </details>
              </div>
              <div className="space-y-3">
                <Heading>{s.costTitle}</Heading>
                <p className="text-xs text-muted-foreground">{s.costNote}</p>
                {(
                  [
                    ['hourly', s.hourly, 'number'],
                    ['source', s.source, 'text'],
                    ['date', s.date, 'date'],
                  ] as const
                ).map(([key, name, type]) => (
                  <label key={key} className="flex flex-col gap-1.5 text-xs">
                    {name}
                    <Input
                      aria-label={name}
                      type={type}
                      min={key === 'hourly' ? 0 : undefined}
                      step={key === 'hourly' ? 'any' : undefined}
                      value={cost[key]}
                      onChange={(event) => costInput(key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

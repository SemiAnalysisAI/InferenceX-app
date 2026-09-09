'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import VideoSelect from './VideoSelect';
import { at, number, rows, safePath, text, type Bundle, type Json } from './bundle';
import type { ServingCell } from './serving';
import { allocatedGpus } from './allocation';
import { powerLimitComparison } from './power-limit';

const STRINGS = {
  en: {
    title: 'Serving results',
    smoke: 'Exploratory serving smoke test',
    intro:
      'Compare client concurrency on the same deployment. Select a configuration to inspect its requests and generated media.',
    concurrency: 'Client concurrency',
    valid: 'Valid / scheduled',
    median: 'Median delivery latency',
    hour: 'Valid clips / deployment-hour',
    gpuHour: 'Valid clips / participating GPU-hour',
    allocatedGpuHour: 'Valid clips / allocated GPU-hour',
    gpuBasis: 'GPU normalization',
    allocatedBasis: 'All allocated GPUs',
    participatingBasis: 'Participating GPUs',
    secondsHour: 'Video seconds / participating GPU-hour',
    allocatedSecondsHour: 'Video seconds / allocated GPU-hour',
    wall: 'Delivery measurement window',
    rate: 'Valid clips / second',
    samples: 'Valid latency samples',
    p90: 'P90 delivery latency',
    p90Note:
      'P90 is unavailable below 10 valid latency samples per configuration. That display threshold does not establish statistical confidence or sustainable capacity.',
    timing:
      'Latency runs from submission to the complete downloaded video, including polling and transfer. Throughput uses the closed-loop delivery window; startup, warmup and subsequent local validation are excluded. Hourly rates extrapolate that measured window.',
    closedLoop: 'Closed-loop client load',
    status: 'Execution status',
    verified: 'Measurement verified',
    yes: 'Yes',
    no: 'No',
    unavailable: 'Unavailable',
    complete: 'Complete',
    incomplete: 'Incomplete',
    measured: 'Measured',
    warmup: 'Warmup · excluded from measured metrics',
    slot: 'Clip / request',
    prompt: 'Prompt',
    seed: 'Seed',
    requestLatency: 'This request: submission → downloaded media',
    validation: 'Subsequent local validation',
    settings: 'Generation settings',
    requestedDuration: 'Requested duration (s)',
    decodedDuration: 'Decoded video duration (s)',
    resolution: 'Decoded resolution',
    frames: 'Decoded frames / FPS',
    audio: 'Audio sample rate / channels',
    listen: 'Play to hear the original audio. Playback starts only when you press play.',
    download: 'Download original MP4',
    noMedia: 'No media available for this request.',
    mediaError:
      'The video could not be loaded or decoded. Download the original MP4 to inspect it.',
    noRequests: 'No request records are available for this configuration.',
    integrity: 'Video & audio integrity',
    passed: 'Passed',
    failed: 'Failed',
    integrityNote:
      'Technical validity checks decoding, geometry, timing and audio continuity. It does not establish prompt adherence, perceptual quality or lip sync. This smoke test has no paired fidelity or calibrated regression result.',
    checks: 'All recorded integrity checks',
    request: 'Full request record',
    power: 'Measured GPU power & energy',
    phase: 'Power window',
    measurement: 'Generation',
    startup: 'Startup',
    warmupPhase: 'Warmup',
    mean: 'Aggregate mean (W)',
    peak: 'Observed aggregate peak (W)',
    energy: 'Integrated energy (kJ)',
    perClip: 'Energy / valid clip (kJ/clip)',
    powerWindow: 'Power window duration (s)',
    limitRatio: 'Mean / enforced limit (%)',
    limitWatts: 'Total enforced power limit (W)',
    limitNote:
      'Power-limit ratios require matching participating GPU UUIDs and unchanged prelaunch/postcleanup enforced limits. These snapshots do not prove continuous stability; TDP and later inventories are never substituted.',
    gpuNote:
      'Participating GPUs measure hardware efficiency. The allocated view includes idle allocations; full deployment costs must include all billed resources.',
    powerNote:
      'Generation power covers first submission → last observed provider completion. Intervening idle time, downloads and validation are included; overlapping requests are integrated once. Startup and warmup are separate. Time-weighted board measurements exclude the host and facility; sampled peaks are not instantaneous electrical peaks.',
    gpu: 'GPU',
    meanGpu: 'Mean power (W)',
    peakGpu: 'Observed peak (W)',
    memory: 'Sampled memory peak (MiB)',
    memoryNote:
      'Device-used VRAM during the client workload, including warmup. MiB = 2²⁰ bytes; sampling may miss peaks. These are not framework allocator peaks.',
    hardware: 'Hardware & execution',
    allocated: 'Allocated GPUs',
    participating: 'Participating GPUs',
    model: 'Model',
    modelRevision: 'Model revision',
    runtimeRevision: 'Runtime revision',
    sourceHash: 'Runtime source SHA256',
    server: 'Server configuration',
    observed: 'Observed submission rate (requests/s)',
    inFlight: 'Peak client requests in flight',
    missing: 'Unavailable serving measurements',
    missingNote:
      'Server-side queue delay, server-ready latency, observed batch sizes and fixed offered arrival rate are not supplied. Closed-loop concurrency is not server batch size. Costs and prices require separate, dated assumptions.',
    outcome: 'Completion accounting',
    completed: 'Completed',
    failedCount: 'Failed / invalid',
    notStarted: 'Not started',
    unfinished: 'Unfinished',
    provenance: 'Provenance & downloads',
    ci: 'Exact CI run',
    manifest: 'Manifest SHA256',
    source: 'Backend commit',
    raw: 'Raw result files',
    report: 'Original report',
    reportNote: 'Original report in a sandbox. Scripts and external requests are disabled.',
    limits:
      'Exploratory measurements only. This result is not release qualified or a sustained-capacity comparison.',
    noCells: 'No verified serving configurations are available.',
  },
  zh: {
    title: '并发服务测试结果',
    smoke: '探索性服务冒烟测试',
    intro: '在同一部署上比较客户端并发数。选择配置，查看逐请求数据与生成的视频。',
    concurrency: '客户端并发数',
    valid: '有效 / 计划请求',
    median: '交付延迟中位数',
    hour: '有效视频 / 部署小时',
    gpuHour: '有效视频 / 参与计算 GPU 小时',
    allocatedGpuHour: '有效视频 / 已分配 GPU 小时',
    gpuBasis: 'GPU 归一化口径',
    allocatedBasis: '所有已分配 GPU',
    participatingBasis: '参与计算的 GPU',
    secondsHour: '视频秒数 / 参与计算 GPU 小时',
    allocatedSecondsHour: '视频秒数 / 已分配 GPU 小时',
    wall: '交付测量时段',
    rate: '有效视频 / 秒',
    samples: '有效延迟样本数',
    p90: 'P90 交付延迟',
    p90Note:
      '每个配置不足 10 个有效延迟样本时不显示 P90。达到显示门槛也不代表具备统计置信度或已验证持续服务容量。',
    timing:
      '延迟从提交请求计时，到完整视频下载完成为止，包含轮询与传输。吞吐量按闭环交付测量时段计算，不含启动、warmup 和随后进行的本地校验。每小时指标由该测量时段外推得出。',
    closedLoop: '闭环客户端负载',
    status: '执行状态',
    verified: '测量结果已验证',
    yes: '是',
    no: '否',
    unavailable: '无数据',
    complete: '已完成',
    incomplete: '未完成',
    measured: '正式测量',
    warmup: 'Warmup · 不计入正式测量指标',
    slot: '视频 / 请求',
    prompt: 'Prompt',
    seed: 'Seed',
    requestLatency: '当前请求：提交 → 视频下载完成',
    validation: '随后进行的本地校验',
    settings: '生成配置',
    requestedDuration: '请求的视频时长（s）',
    decodedDuration: '解码后视频时长（s）',
    resolution: '解码后分辨率',
    frames: '解码帧数 / FPS',
    audio: '音频采样率 / 声道数',
    listen: '点击播放可听到原始音频；视频不会自动播放。',
    download: '下载原始 MP4',
    noMedia: '此请求暂无可用媒体。',
    mediaError: '视频加载或解码失败。请下载原始 MP4 查看。',
    noRequests: '此配置暂无逐请求记录。',
    integrity: '视频与音频完整性',
    passed: '通过',
    failed: '未通过',
    integrityNote:
      '技术有效性检查涵盖解码、画面尺寸、时间戳与音频连续性，不代表符合 prompt、感知质量良好或音画同步。此冒烟测试未提供成对保真度或经过校准的回归结论。',
    checks: '全部完整性检查记录',
    request: '完整请求记录',
    power: '实测 GPU 功率与能耗',
    phase: '功率统计时段',
    measurement: '生成',
    startup: '启动',
    warmupPhase: 'Warmup',
    mean: '合计平均功率（W）',
    peak: '合计观测峰值（W）',
    energy: '积分能耗（kJ）',
    perClip: '每有效视频能耗（kJ/clip）',
    powerWindow: '功率统计时段时长（s）',
    limitRatio: '平均功率 / 实际生效上限（%）',
    limitWatts: '实际生效功率上限合计（W）',
    limitNote:
      '功率占比要求参与计算 GPU 的 UUID 匹配，且启动前与清理后记录的实际生效上限一致。这不能证明期间上限始终不变；不以规格 TDP 或事后硬件信息替代。',
    gpuNote:
      '按参与计算 GPU 数衡量硬件效率；按已分配 GPU 数统计时包含空闲分配。完整部署成本须包含所有计费资源。',
    powerNote:
      '生成阶段功率覆盖首次提交到最后一次观测到服务端完成为止，包含期间的空闲、下载与校验时间；并发请求重叠时段只积分一次。启动与 warmup 单独统计。板卡功率按时间加权，不含主机与设施能耗；采样峰值不是瞬时电气峰值。',
    gpu: 'GPU',
    meanGpu: '平均功率（W）',
    peakGpu: '观测峰值（W）',
    memory: '显存采样峰值（MiB）',
    memoryNote:
      '客户端工作负载期间的设备已用显存，包含 warmup。MiB = 2²⁰ 字节；采样可能遗漏峰值，也不等同于框架分配器统计的峰值。',
    hardware: '硬件与执行配置',
    allocated: '已分配 GPU 数',
    participating: '参与计算 GPU 数',
    model: '模型',
    modelRevision: '模型版本',
    runtimeRevision: '运行时版本',
    sourceHash: '运行时源码 SHA256',
    server: '服务端配置',
    observed: '观测提交速率（requests/s）',
    inFlight: '客户端在途请求峰值',
    missing: '尚未提供的服务指标',
    missingNote:
      '尚无服务端排队时长、服务端完成延迟、实际 batch size 或固定请求到达速率。闭环客户端并发数不等于服务端 batch size。成本与价格需要另行提供注明日期的假设。',
    outcome: '请求完成情况',
    completed: '已完成',
    failedCount: '失败 / 无效',
    notStarted: '未开始',
    unfinished: '未结束',
    provenance: '来源与下载',
    ci: '对应 CI 运行',
    manifest: 'Manifest SHA256',
    source: '后端提交',
    raw: '原始结果文件',
    report: '原始报告',
    reportNote: '原始报告在沙盒中显示，已禁用脚本与外部请求。',
    limits: '仅供探索性分析，不属于发布验收结果，也不构成持续服务容量比较。',
    noCells: '暂无已验证的服务测试配置。',
  },
};

function multiply(value: Json, by: number) {
  const n = number(value);
  return n === null ? null : n * by;
}

function Data({ values }: { values: [string, string][] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="break-all font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ServingResults({
  bundle,
  cells,
  urls,
  downloads,
  html,
  initialCell,
  onCellChange,
}: {
  bundle: Bundle;
  cells: ServingCell[];
  urls: Map<string, string>;
  downloads: Map<string, string>;
  html: string;
  initialCell?: string;
  onCellChange?: (id: string) => void;
}) {
  const s = STRINGS[useLocale()];
  const [selected, setSelected] = useState(initialCell ?? '');
  const [slot, setSlot] = useState('');
  const [gpuBasis, setGpuBasis] = useState<'participating' | 'allocated'>('participating');
  const [phase, setPhase] = useState<'measurement' | 'startup' | 'warmup'>('measurement');
  const [failedMedia, setFailedMedia] = useState('');
  const selectedId = onCellChange ? (initialCell ?? selected) : selected;
  const current = cells.find((cell) => cell.id === selectedId) ?? cells[0];
  useEffect(() => {
    setSlot('');
  }, [current?.id]);
  const fmt = (value: Json, digits = 2): string => {
    const n = number(value);
    return n === null
      ? s.unavailable
      : n.toLocaleString('en-US', { maximumFractionDigits: digits });
  };
  const scalar = (value: Json) =>
    text(value) || (number(value) === null ? s.unavailable : fmt(value));
  if (!current) return <Card>{s.noCells}</Card>;
  const { cell, run, job, spec, power } = current;
  const verified = at(cell, 'verified') === true;
  const metrics = verified ? at(cell, 'metrics') : null;
  const serving = at(metrics, 'serving');
  const completion = at(cell, 'completion');
  const records = rows(at(run, 'records'));
  const record =
    records.find((row) => text(at(row, 'slot_id')) === slot) ??
    records.find((row) => at(row, 'phase') === 'measurement') ??
    records[0];
  const media = at(record, 'media');
  const warmup = at(record, 'phase') === 'warmup';
  const telemetry = at(job, 'roles', 'baseline', 'telemetry_summary');
  const devices = rows(at(telemetry, 'gpu_identity'));
  const allocated = allocatedGpus(bundle);
  const gpuUuids = rows(at(spec, 'gpu_uuids')).map(text);
  const participating =
    gpuUuids.length > 0 && gpuUuids.every(Boolean) && new Set(gpuUuids).size === gpuUuids.length
      ? gpuUuids.length
      : null;
  const gpuCount = gpuBasis === 'participating' ? participating : allocated;
  const gpuRate = (value: Json) =>
    gpuCount !== null && gpuCount > 0 ? multiply(value, 3600 / gpuCount) : null;
  const powerData = at(power, 'phases', phase);
  const limitComparison = verified
    ? powerLimitComparison(
        powerData,
        at(job, 'roles', 'baseline', 'power_configuration_before'),
        at(job, 'roles', 'baseline', 'power_configuration_after'),
        at(spec, 'gpu_uuids'),
        at(power, 'semantics', 'power_unit'),
      )
    : null;
  const powerValue = (...keys: string[]) =>
    verified && at(powerData, 'valid') === true ? at(powerData, ...keys) : null;
  let mediaPath = '';
  try {
    const path = text(at(record, 'artifact_path'));
    if (path)
      mediaPath = safePath(
        `${current.runPath.slice(0, current.runPath.lastIndexOf('/') + 1)}${safePath(path)}`,
      );
  } catch {
    // Invalid manifest paths never become media URLs.
  }
  const mediaUrl = urls.get(mediaPath);
  const chooseCell = (id: string) => {
    setSelected(id);
    setSlot('');
    onCellChange?.(id);
    track('video_serving_configuration_selected', { configuration: id });
  };
  const p90 = number(at(serving, 'client_ready_latency_seconds', 'sample_count'));
  const ciId = text(at(bundle.manifest, 'run_id'));
  const rawPaths = [
    'serving-smoke.json',
    current.runPath,
    current.jobPath,
    current.powerPath,
    current.specPath,
    'manifest.json',
    'SHA256SUMS',
  ];

  return (
    <div className="space-y-4" data-testid="serving-results">
      <Card className="gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Heading>{s.title}</Heading>
            <p className="text-sm text-muted-foreground">{s.intro}</p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {s.smoke}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-sm" data-testid="serving-matrix">
            <thead className="text-xs text-muted-foreground">
              <tr>
                {[
                  s.concurrency,
                  s.valid,
                  `${s.median} (s)`,
                  s.hour,
                  s.mean,
                  s.perClip,
                  s.limitRatio,
                ].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {cells.map((item) => {
                const measuredPower =
                  at(item.cell, 'verified') === true &&
                  at(item.power, 'phases', 'measurement', 'valid') === true
                    ? at(item.power, 'phases', 'measurement')
                    : null;
                const limits = powerLimitComparison(
                  measuredPower,
                  at(item.job, 'roles', 'baseline', 'power_configuration_before'),
                  at(item.job, 'roles', 'baseline', 'power_configuration_after'),
                  at(item.spec, 'gpu_uuids'),
                  at(item.power, 'semantics', 'power_unit'),
                );
                return (
                  <tr
                    key={item.id}
                    className={
                      item.id === current.id ? 'bg-primary/10' : 'border-t border-border/40'
                    }
                  >
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant={item.id === current.id ? 'default' : 'outline'}
                        aria-pressed={item.id === current.id}
                        onClick={() => chooseCell(item.id)}
                      >
                        C{item.concurrency}
                      </Button>
                    </td>
                    <td className="px-3 py-2">
                      {fmt(at(item.cell, 'completion', 'valid'))} /{' '}
                      {fmt(at(item.cell, 'completion', 'scheduled'))}
                    </td>
                    <td className="px-3 py-2">
                      {fmt(
                        at(item.cell, 'verified') === true
                          ? at(item.cell, 'metrics', 'client_ready_p50_seconds')
                          : null,
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {fmt(
                        multiply(
                          at(item.cell, 'verified') === true
                            ? at(item.cell, 'metrics', 'valid_clips_per_second')
                            : null,
                          3600,
                        ),
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {fmt(at(measuredPower, 'aggregate', 'avg_power_w'))}
                    </td>
                    <td className="px-3 py-2">
                      {fmt(
                        multiply(at(measuredPower, 'aggregate', 'joules_per_valid_clip'), 0.001),
                      )}
                    </td>
                    <td className="px-3 py-2">{fmt(limits?.percent ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.timing}</p>
      </Card>

      <Card className="gap-5" data-testid="serving-media">
        {record ? (
          <>
            <div className="max-w-lg">
              <VideoSelect
                label={s.slot}
                value={text(at(record, 'slot_id'))}
                onValueChange={setSlot}
                options={records.map((item) => ({
                  value: text(at(item, 'slot_id')),
                  label: `${at(item, 'phase') === 'warmup' ? s.warmup : s.measured} · ${text(at(item, 'slot_id'))}`,
                }))}
              />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0 space-y-3">
                {mediaUrl ? (
                  <video
                    key={mediaUrl}
                    src={mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`${s.slot} ${text(at(record, 'slot_id'))}`}
                    className="aspect-video w-full rounded-lg bg-black"
                    onError={() => setFailedMedia(mediaUrl)}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg bg-muted p-5 text-sm text-muted-foreground">
                    {s.noMedia}
                  </div>
                )}
                {failedMedia === mediaUrl && (
                  <p role="alert" className="text-sm text-destructive">
                    {s.mediaError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{s.listen}</p>
                {mediaUrl && (
                  <a
                    href={downloads.get(mediaPath) ?? mediaUrl}
                    download
                    className="text-sm text-primary underline"
                  >
                    {s.download}
                  </a>
                )}
                <Data
                  values={[
                    [s.requestLatency, `${fmt(at(record, 'submit_to_media_seconds'))} s`],
                    [s.validation, `${fmt(at(record, 'media_validation_seconds'))} s`],
                    [s.seed, scalar(at(record, 'seed'))],
                    [
                      s.integrity,
                      at(media, 'valid') === true
                        ? s.passed
                        : at(media, 'valid') === false
                          ? s.failed
                          : s.unavailable,
                    ],
                  ]}
                />
                {warmup && (
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    {s.warmup}
                  </p>
                )}
              </div>
              <div className="min-w-0 space-y-5">
                <div className="space-y-2">
                  <Heading level="label">{s.prompt}</Heading>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {text(at(record, 'prompt')) || s.unavailable}
                  </p>
                </div>
                <Data
                  values={[
                    [s.requestedDuration, fmt(at(run, 'plan', 'generation', 'duration_seconds'))],
                    [s.decodedDuration, fmt(at(media, 'video', 'duration_seconds'), 4)],
                    [
                      s.resolution,
                      `${fmt(at(media, 'video', 'width'))} × ${fmt(at(media, 'video', 'height'))}`,
                    ],
                    [
                      s.frames,
                      `${fmt(at(media, 'video', 'frame_count'))} / ${fmt(at(media, 'video', 'fps'))}`,
                    ],
                    [
                      s.audio,
                      `${fmt(at(media, 'audio', 'sample_rate_hz'))} Hz / ${fmt(at(media, 'audio', 'channels'))}`,
                    ],
                  ]}
                />
                <details>
                  <summary className="cursor-pointer text-sm">{s.settings}</summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(at(run, 'plan', 'generation'), null, 2)}
                  </pre>
                </details>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{s.integrityNote}</p>
            <details>
              <summary className="cursor-pointer text-sm">{s.checks}</summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(at(media, 'checks'), null, 2)}
              </pre>
            </details>
            <details>
              <summary className="cursor-pointer text-sm">{s.request}</summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(record, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <p>{s.noRequests}</p>
        )}
      </Card>

      <Card className="gap-4" data-testid="serving-selected-metrics">
        <div className="w-full max-w-sm">
          <VideoSelect
            label={s.gpuBasis}
            value={gpuBasis}
            onValueChange={(value) => setGpuBasis(value as typeof gpuBasis)}
            options={[
              { value: 'participating', label: s.participatingBasis },
              { value: 'allocated', label: s.allocatedBasis },
            ]}
          />
        </div>
        <Heading level="card">
          C{current.concurrency} · {s.closedLoop}
        </Heading>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [s.median, `${fmt(at(metrics, 'client_ready_p50_seconds'))} s`],
            [
              gpuBasis === 'participating' ? s.gpuHour : s.allocatedGpuHour,
              fmt(gpuRate(at(metrics, 'valid_clips_per_second'))),
            ],
            [s.valid, `${fmt(at(completion, 'valid'))} / ${fmt(at(completion, 'scheduled'))}`],
            [s.wall, `${fmt(at(metrics, 'measurement', 'wall_seconds'))} s`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <Data
          values={[
            [s.status, at(cell, 'status') === 'complete' ? s.complete : s.incomplete],
            [s.verified, verified ? s.yes : s.no],
            [s.rate, fmt(at(metrics, 'valid_clips_per_second'), 6)],
            [
              gpuBasis === 'participating' ? s.secondsHour : s.allocatedSecondsHour,
              fmt(gpuRate(at(serving, 'valid_video_seconds_per_second'))),
            ],
            [
              s.p90,
              p90 !== null && p90 >= 10
                ? fmt(at(serving, 'client_ready_latency_seconds', 'p90'))
                : s.unavailable,
            ],
            [s.samples, fmt(at(serving, 'client_ready_latency_seconds', 'sample_count'))],
            [s.inFlight, fmt(at(serving, 'peak_client_in_flight'))],
          ]}
        />
        <p className="text-xs text-muted-foreground">{s.p90Note}</p>
        <p className="text-xs text-muted-foreground">{s.gpuNote}</p>
      </Card>

      <Card className="gap-4" data-testid="serving-power">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Heading>{s.power}</Heading>
          <div className="w-full sm:w-52">
            <VideoSelect
              label={s.phase}
              value={phase}
              onValueChange={(value) => setPhase(value as typeof phase)}
              options={[
                { value: 'measurement', label: s.measurement },
                { value: 'startup', label: s.startup },
                { value: 'warmup', label: s.warmupPhase },
              ]}
            />
          </div>
        </div>
        <Data
          values={[
            [s.mean, fmt(powerValue('aggregate', 'avg_power_w'))],
            [s.peak, fmt(powerValue('aggregate', 'observed_peak_power_w'))],
            [s.energy, fmt(multiply(powerValue('aggregate', 'energy_j'), 0.001))],
            [s.perClip, fmt(multiply(powerValue('aggregate', 'joules_per_valid_clip'), 0.001))],
            [s.powerWindow, fmt(powerValue('duration_seconds'))],
            [s.limitRatio, fmt(limitComparison?.percent ?? null)],
            [s.limitWatts, fmt(limitComparison?.watts ?? null)],
          ]}
        />
        {at(powerData, 'valid') !== true && (
          <p className="text-sm text-muted-foreground">
            {rows(at(powerData, 'invalid_reasons')).map(text).join(', ') || s.unavailable}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{s.powerNote}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.limitNote}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {[s.gpu, s.meanGpu, s.peakGpu, s.memory].map((label) => (
                  <th key={label} className="py-2 pr-4 font-medium text-muted-foreground">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const uuid = text(at(device, 'uuid'));
                return (
                  <tr key={uuid} className="border-t border-border/40">
                    <td className="max-w-64 py-3 pr-4">
                      <p>{text(at(device, 'name'))}</p>
                      <p className="break-all text-muted-foreground">{uuid}</p>
                    </td>
                    <td className="pr-4 tabular-nums">
                      {fmt(powerValue('per_gpu', uuid, 'avg_power_w'))}
                    </td>
                    <td className="pr-4 tabular-nums">
                      {fmt(powerValue('per_gpu', uuid, 'observed_peak_power_w'))}
                    </td>
                    <td className="tabular-nums">
                      {fmt(at(telemetry, 'measurement_observed_memory_peak_mib_by_gpu', uuid))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{s.memoryNote}</p>
      </Card>

      <Card className="gap-4">
        <Heading>{s.hardware}</Heading>
        <Data
          values={[
            [s.model, scalar(at(run, 'configuration', 'model_id'))],
            [s.modelRevision, scalar(at(run, 'configuration', 'model_revision'))],
            [s.runtimeRevision, scalar(at(run, 'configuration', 'runtime_revision'))],
            [s.sourceHash, scalar(at(spec, 'baseline', 'source_sha256'))],
            [s.allocated, fmt(allocated)],
            [s.participating, fmt(participating)],
            [s.observed, fmt(at(serving, 'observed_submission_rate_per_second'), 6)],
          ]}
        />
        <details>
          <summary className="cursor-pointer text-sm">{s.server}</summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(at(spec, 'server'), null, 2)}
          </pre>
        </details>
        <details>
          <summary className="cursor-pointer text-sm">{s.outcome}</summary>
          <div className="mt-3">
            <Data
              values={[
                [s.completed, fmt(at(completion, 'completed'))],
                [s.failedCount, fmt(at(completion, 'failed'))],
                [s.notStarted, fmt(at(completion, 'not_started'))],
                [s.unfinished, fmt(at(completion, 'unfinished'))],
              ]}
            />
          </div>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(at(serving, 'outcomes'), null, 2)}
          </pre>
        </details>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">{s.missing}: </span>
          {s.missingNote}
        </p>
        <p className="text-xs text-muted-foreground">{s.limits}</p>
      </Card>

      <Card className="gap-4">
        <Heading>{s.provenance}</Heading>
        {/^[1-9]\d*$/u.test(ciId) && (
          <a
            href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${ciId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline"
          >
            {s.ci} · #{ciId}
          </a>
        )}
        <Data
          values={[
            [s.source, scalar(at(bundle.manifest, 'git_commit'))],
            [s.manifest, bundle.manifestSha256],
          ]}
        />
        <details>
          <summary className="cursor-pointer text-sm">{s.raw}</summary>
          <div className="mt-3 flex flex-col gap-2">
            {rawPaths
              .filter((path) => urls.has(path))
              .map((path) => (
                <a
                  key={path}
                  href={downloads.get(path) ?? urls.get(path)}
                  download
                  className="break-all font-mono text-xs text-primary underline"
                >
                  {path}
                </a>
              ))}
          </div>
        </details>
        {html && (
          <details>
            <summary className="cursor-pointer text-sm">{s.report}</summary>
            <p className="my-3 text-xs text-muted-foreground">{s.reportNote}</p>
            <iframe
              title={s.report}
              srcDoc={html}
              sandbox="allow-same-origin allow-downloads"
              className="h-[640px] w-full rounded-lg border bg-white"
            />
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-sm">{s.hardware} · JSON</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(job, null, 2)}
          </pre>
        </details>
      </Card>
    </div>
  );
}

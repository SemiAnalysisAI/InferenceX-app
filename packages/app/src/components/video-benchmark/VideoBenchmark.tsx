'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import ResultPower from './ResultPower';
import VideoSelect from './VideoSelect';
import ServingResults from './ServingResults';
import { servingCells, type ServingCell } from './serving';
import { renderReportHtml } from './report';
import { storedBundle, type StoredSource } from './stored';
import ResultSummary from './ResultSummary';
import { allocatedGpus } from './allocation';
import {
  at,
  entries,
  estimateEconomics,
  folderReader,
  httpReader,
  loadBundle,
  number,
  ROLES,
  rows,
  sampledPower,
  text,
  type Bundle,
  type Json,
} from './bundle';

const STRINGS = {
  en: {
    title: 'H3 Video Benchmark',
    subtitle: 'Original media. Measured execution. Traceable comparisons.',
    aa: 'Same-build A/A',
    sameWorkload: 'Same workload',
    statsNote:
      'The metrics below summarize the measured block. Selected warmup clips are excluded.',
    open: 'Open artifact folder',
    load: 'Load manifest',
    source: 'Manifest URL',
    clear: 'Clear results',
    loading: 'Loading and verifying checksums…',
    empty: 'Open a real CI result to begin',
    instructions:
      'Download the H3 artifact from GitHub Actions, extract it, then choose the folder containing manifest.json. Files stay in this browser; nothing is uploaded. Reloading clears imported files.',
    sample: 'Download reference CI artifact',
    remote:
      'Alternatively, load an HTTPS artifact directory with CORS enabled. Private bundles should use the local folder option; hidden navigation is not access control.',
    error: 'Could not load this bundle',
    retry:
      'Choose a complete artifact folder or correct the manifest URL and retry. Existing results have been cleared.',
    verified: 'File checksums verified',
    trust:
      'Checksums establish bundle consistency, not independent source or hardware attestation. Confirm the CI run and manifest hash before sharing conclusions.',
    execution: 'Execution',
    comparison: 'Regression',
    calibration: 'Calibration',
    qualification: 'Release qualified',
    unavailable: 'Unavailable',
    yes: 'Yes',
    no: 'No',
    baseline: 'Baseline',
    candidate: 'Candidate',
    slot: 'Clip / request',
    prompt: 'Prompt',
    settings: 'Generation settings',
    seed: 'Seed',
    warmup: 'Warmup',
    measured: 'Measured',
    noMedia: 'No generated media for this request',
    mediaError:
      'This browser could not decode the video/audio. Download the original media to inspect it.',
    download: 'Download original MP4',
    audio: 'Audio is enabled. Play one side at a time to compare the sound.',
    latency: 'Median end-to-end latency',
    throughput: 'Valid clips / second',
    counts: 'Completion accounting',
    memory: 'Sampled GPU memory',
    timing:
      'Latency: submission through downloaded and validated media, including polling, transfer and analysis. Throughput: valid measured clips ÷ serial measured-block seconds; warmup excluded. These are point estimates, not saturated serving capacity.',
    window: 'Measured block',
    completed: 'Completed',
    valid: 'Valid',
    scheduled: 'Scheduled',
    failed: 'Failed / invalid',
    power: 'Measured power & sampled energy',
    powerNote:
      'Board power summed across participating GPUs. Time-weighted power and trapezoidal energy cover only the first-to-last complete telemetry samples tagged measurement, including warmup. No endpoint extrapolation; gaps over 3× the requested interval invalidate the estimate. This is not facility energy or energy per measured clip.',
    meanPower: 'Time-weighted mean',
    energy: 'Integrated sampled energy (estimate)',
    coverage: 'Covered telemetry window',
    samples: 'Samples',
    memoryNote:
      'Maximum observed device-used VRAM per GPU during the client workload, including warmup. MiB = 2²⁰ bytes. Sampling can miss peaks; these are not allocator peaks.',
    integrity: 'Video & audio integrity',
    fidelity: 'Paired fidelity',
    fidelityNote:
      'Pixel and waveform similarity detect implementation drift. They do not establish prompt adherence, perceptual quality, lip sync or human preference. Thresholds remain uncalibrated unless the backend says otherwise.',
    identical: 'Identical frames; finite PSNR undefined',
    checks: 'Recorded checks',
    hardware: 'Hardware & revisions',
    videoPsnr: 'Video PSNR (dB)',
    videoMae: 'Video MAE (normalized 0–1)',
    audioSpectral: 'Audio spectral cosine',
    audioRms: 'Audio RMS ratio (candidate / baseline)',
    audioMae: 'Audio waveform MAE (PCM amplitude)',
    videoCoverage: 'Video coverage (fraction)',
    audioCoverage: 'Audio coverage (fraction)',
    node: 'Node',
    model: 'Model',
    modelRevision: 'Model revision',
    runtimeRevision: 'Runtime revision',
    sourceHash: 'Source SHA256',
    participating: 'Participating GPUs',
    allocated: 'Allocated GPUs',
    provenance: 'Provenance & downloads',
    ciRun: 'Exact CI run',
    commit: 'Backend commit',
    manifest: 'Manifest SHA256',
    report: 'Open original report',
    reportNote:
      'Original report rendered in a sandbox, with verified local media. Scripts and external requests are disabled.',
    raw: 'Raw artifacts',
    economics: 'Revenue & profit scenario',
    economicsNote:
      'User-entered USD assumptions. Revenue extrapolates measured serial throughput to one hour at 100% demand; it excludes startup/warmup and is not demonstrated capacity. Profit requires all-in cost per billed GPU-hour, including rental or amortization, electricity, cooling, host/network, storage, labor, licensing and other overhead. Allocation count defaults from Slurm; change billed count only if your contract differs.',
    price: 'Selling price (USD / generated clip)',
    cost: 'All-in cost (USD / billed GPU-hour)',
    billed: 'Billed GPUs',
    assumption: 'Price and cost source / assumptions',
    date: 'Assumptions as of',
    revenueParticipant: 'Revenue / participating GPU-hour',
    revenueBilled: 'Revenue / billed GPU-hour',
    profitParticipant: 'Profit / participating GPU-hour',
    profitBilled: 'Profit / billed GPU-hour',
    currency: 'USD',
    estimate: 'Estimate',
    needAssumptions:
      'Enter a price, source, date and billed GPU count. Leave cost blank to keep profit unavailable.',
    missing: 'Backend fields & limits',
    missingNote:
      'Missing values stay unavailable. This contract has no measured-only per-request power boundaries, facility energy, pricing or full cost model. Sensor calibration and independent hardware attestation are not supplied. No private object-storage access is configured by this viewer.',
  },
  zh: {
    title: 'H3 视频基准测试',
    subtitle: '查看原始媒体、实测执行数据与可追溯的比较结果。',
    aa: '同构建 A/A',
    sameWorkload: '相同工作负载',
    statsNote: '以下指标汇总正式测量时段；所选 warmup 视频不计入其中。',
    open: '打开产物文件夹',
    load: '加载 manifest',
    source: 'Manifest URL',
    clear: '清除结果',
    loading: '正在加载并校验文件…',
    empty: '打开真实 CI 结果开始查看',
    instructions:
      '从 GitHub Actions 下载 H3 产物并解压，选择包含 manifest.json 的文件夹。文件仅在当前浏览器中读取，不会上传；刷新页面后需要重新导入。',
    sample: '下载参考 CI 产物',
    remote:
      '也可加载启用 CORS 的 HTTPS 产物目录。私有产物包请通过本地文件夹打开；隐藏导航不等于访问控制。',
    error: '无法加载此产物包',
    retry: '请选择完整的产物文件夹，或修正 manifest URL 后重试。此前的结果已清除。',
    verified: '文件校验和通过',
    trust:
      '校验和仅确认产物包内部一致，不构成独立的来源或硬件认证。分享结论前请核对 CI run 与 manifest 哈希。',
    execution: '执行状态',
    comparison: '回归结论',
    calibration: '校准状态',
    qualification: '发布验收通过',
    unavailable: '无数据',
    yes: '是',
    no: '否',
    baseline: '基线',
    candidate: '候选',
    slot: '视频 / 请求',
    prompt: 'Prompt',
    settings: '生成配置',
    seed: 'Seed',
    warmup: 'Warmup',
    measured: '正式测量',
    noMedia: '此请求没有生成媒体',
    mediaError: '浏览器无法解码此视频或音频，请下载原始媒体检查。',
    download: '下载原始 MP4',
    audio: '音频已启用。建议逐个播放，对比两侧声音。',
    latency: '端到端延迟中位数',
    throughput: '每秒有效视频数',
    counts: '完成情况',
    memory: 'GPU 显存采样峰值',
    timing:
      '延迟从提交请求计时，直到媒体下载并验证完成，包含轮询、传输与分析。吞吐量 = 有效测量视频数 ÷ 串行测量时段秒数，不含 warmup。这些是点估计，不代表饱和服务容量。',
    window: '正式测量时段',
    completed: '已完成',
    valid: '有效',
    scheduled: '计划请求',
    failed: '失败 / 无效',
    power: '实测功耗与采样能耗',
    powerNote:
      '功率为参与计算的 GPU 板卡功率之和。时间加权平均功率和梯形积分能耗仅覆盖 measurement 阶段首末完整采样之间的时段，包含 warmup。端点不外推；间隔超过请求采样周期的 3 倍时不提供估算。这不是设施能耗，也不是每个正式测量视频的能耗。',
    meanPower: '时间加权平均功率',
    energy: '采样积分能耗（估算）',
    coverage: '遥测覆盖时段',
    samples: '采样数',
    memoryNote:
      '各 GPU 在客户端工作负载期间采样到的显存占用最大值，包含 warmup。MiB = 2²⁰ 字节。采样可能漏掉峰值，不等同于分配器峰值。',
    integrity: '视频与音频完整性',
    fidelity: '配对保真度',
    fidelityNote:
      '像素与波形相似度用于发现实现变化造成的输出漂移，不能证明 prompt 遵循度、感知质量、口型同步或人类偏好。除非后端明确标注，否则阈值仍未经校准。',
    identical: '帧完全一致，有限 PSNR 无定义',
    checks: '已记录的检查',
    hardware: '硬件与版本',
    videoPsnr: '视频 PSNR（dB）',
    videoMae: '视频 MAE（归一化至 0–1）',
    audioSpectral: '音频频谱余弦相似度',
    audioRms: '音频 RMS 比值（候选 / 基线）',
    audioMae: '音频波形 MAE（PCM 振幅）',
    videoCoverage: '视频覆盖比例',
    audioCoverage: '音频覆盖比例',
    node: '节点',
    model: '模型',
    modelRevision: '模型版本',
    runtimeRevision: '运行时版本',
    sourceHash: '源码 SHA256',
    participating: '参与计算的 GPU',
    allocated: '分配的 GPU',
    provenance: '来源记录与下载',
    ciRun: '对应 CI run',
    commit: '后端 commit',
    manifest: 'Manifest SHA256',
    report: '打开原始报告',
    reportNote: '报告在沙盒中显示并引用已校验的本地媒体，脚本与外部请求均禁用。',
    raw: '原始产物',
    economics: '收入与利润情景估算',
    economicsNote:
      '金额采用用户输入的美元假设。收入按实测串行吞吐量外推至满需求的一小时，不含启动与 warmup，不代表已验证的服务容量。利润需要每个计费 GPU 小时的完整成本，涵盖租赁或折旧、电力、冷却、主机与网络、存储、人力、许可费及其他开销。分配数量默认来自 Slurm；仅在合同计费方式不同时修改计费数量。',
    price: '售价（USD / 生成视频）',
    cost: '完整成本（USD / 计费 GPU 小时）',
    billed: '计费 GPU 数',
    assumption: '价格与成本来源 / 假设',
    date: '假设基准日期',
    revenueParticipant: '每 GPU 小时收入（参与计算）',
    revenueBilled: '每 GPU 小时收入（计费）',
    profitParticipant: '每 GPU 小时利润（参与计算）',
    profitBilled: '每 GPU 小时利润（计费）',
    currency: 'USD',
    estimate: '估算',
    needAssumptions: '请填写售价、来源、日期与计费 GPU 数。成本留空时，利润显示为无数据。',
    missing: '后端字段与局限',
    missingNote:
      '缺失值显示为无数据。当前后端数据契约不提供逐请求且排除 warmup 的功耗边界、设施能耗、售价或完整成本模型，也未提供传感器校准与独立硬件认证。此查看器未配置私有对象存储访问。',
  },
};

interface Loaded {
  bundle: Bundle;
  urls: Map<string, string>;
  downloads: Map<string, string>;
  power: Record<string, ReturnType<typeof sampledPower>>;
  html: string;
  cells: ServingCell[];
}
const REF_RUN = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34293342829';
const REF_ARTIFACT = `${REF_RUN}/artifacts/10082823150`;
const parseInput = (value: string) => (value.trim() === '' ? null : Number(value));

const field = (label: string, value: string, change: (value: string) => void, type = 'number') => (
  <label className="space-y-1 text-sm">
    <span>{label}</span>
    <Input
      type={type}
      value={value}
      min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? 'any' : undefined}
      onChange={(e) => change(e.target.value)}
    />
  </label>
);

export default function VideoBenchmark({
  reader,
  published,
  onLoaded,
  onError,
  initialCell,
  onCellChange,
}: {
  reader?: (path: string) => Promise<Blob>;
  published?: StoredSource;
  onLoaded?: (bundle: Bundle) => void;
  onError?: () => void;
  initialCell?: string;
  onCellChange?: (id: string) => void;
}) {
  const s = STRINGS[useLocale()];
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setError] = useState('');
  const [source, setSource] = useState('');
  const [slot, setSlot] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [billed, setBilled] = useState('');
  const [assumption, setAssumption] = useState('');
  const [date, setDate] = useState('');
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const activeUrls = useRef<string[]>([]);
  const fmt = (value: Json | undefined, digits = 2): string => {
    if (typeof value === 'number')
      return Number.isFinite(value)
        ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
        : s.unavailable;
    if (value === null || value === undefined || value === '') return s.unavailable;
    if (typeof value === 'boolean') return value ? s.yes : s.no;
    return typeof value === 'string' ? value : JSON.stringify(value);
  };
  function clear() {
    generation.current++;
    activeUrls.current.forEach(URL.revokeObjectURL);
    activeUrls.current = [];
    setLoaded(null);
    setError('');
    setLoading(false);
    setSlot('');
  }
  async function open(read?: () => (path: string) => Promise<Blob>, saved?: StoredSource) {
    clear();
    const current = generation.current;
    setLoading(true);
    const urls = new Map<string, string>();
    try {
      const bundle = saved ? storedBundle(saved) : await loadBundle(read!());
      const cells = servingCells(bundle);
      const power: Loaded['power'] = {};
      for (const role of ROLES) {
        const file = bundle.files.get(`gpu/supervisor/${role}/telemetry.jsonl`);
        const telemetry = at(bundle.job, 'roles', role, 'telemetry_summary');
        const uuids = rows(at(telemetry, 'gpu_identity')).map((g) => text(at(g, 'uuid')));
        const interval = number(at(telemetry, 'requested_interval_seconds'));
        const telemetryText = file ? await file.text() : '';
        power[role] =
          file && interval !== null && at(telemetry, 'qualified') === true
            ? sampledPower(
                telemetryText
                  .trim()
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => JSON.parse(line)),
                uuids,
                interval * 3,
              )
            : null;
      }
      if (current !== generation.current) return;
      for (const [path, asset] of saved?.assets ?? []) urls.set(path, asset.url);
      for (const [path, file] of saved ? [] : bundle.files) {
        urls.set(
          path,
          URL.createObjectURL(
            new Blob([file], {
              type: path.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
            }),
          ),
        );
      }
      const rawHtml = await bundle.files.get('report/index.html')?.text();
      const html = rawHtml ? renderReportHtml(rawHtml, urls) : '';
      if (current !== generation.current) {
        urls.forEach(URL.revokeObjectURL);
        return;
      }
      activeUrls.current = [...urls.values()].filter((url) => url.startsWith('blob:'));
      setLoaded({
        bundle,
        cells,
        urls,
        power,
        html,
        downloads: saved
          ? new Map(saved.assets.map(([path, asset]) => [path, asset.downloadUrl]))
          : urls,
      });
      const first =
        rows(at(bundle.report, 'roles', 'baseline', 'observations'))[0] ??
        rows(at(bundle.report, 'roles', 'candidate', 'observations'))[0];
      setSlot(text(at(first, 'slot_id')));
      const allocated = allocatedGpus(bundle);
      setBilled(allocated === null ? '' : String(allocated));
      track('video_bundle_loaded');
    } catch (error) {
      urls.forEach(URL.revokeObjectURL);
      if (current === generation.current) {
        setError(error instanceof Error ? error.message : String(error));
        onError?.();
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    // A shared preview link must not trigger requests to a URL supplied by its sender.
    if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
      const initial = new URLSearchParams(location.search).get('manifest');
      if (initial) {
        setSource(initial);
        void open(() => httpReader(initial));
      }
    }
    return () => {
      generation.current++;
      activeUrls.current.forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (published) void open(undefined, published);
    else if (reader) void open(() => reader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, published]);

  const b = loaded?.bundle;
  useEffect(() => {
    if (b) onLoaded?.(b);
  }, [b, onLoaded]);
  const participating = rows(
    at(b?.job, 'roles', 'baseline', 'telemetry_summary', 'gpu_identity'),
  ).length;
  const observations = (role: string) => [
    ...rows(at(b?.report, 'roles', role, 'observations')),
    ...rows(at(b?.report, 'roles', role, 'warmups')),
  ];
  const selected = (role: string) => observations(role).find((o) => at(o, 'slot_id') === slot);
  const clip = selected('baseline') ?? selected('candidate');
  const slots = [
    ...new Map(
      ROLES.flatMap((role) => observations(role)).map((o) => [text(at(o, 'slot_id')), o]),
    ).values(),
  ];
  const ciUrl = /^\d+$/u.test(text(at(b?.manifest, 'run_id')))
    ? `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${text(at(b?.manifest, 'run_id'))}`
    : null;
  const pair = at(b?.report, 'slot_comparisons', slot);
  const rawPair = rows(at(b?.comparison, 'slots')).find((o) => at(o, 'slot_id') === slot);
  const table = (data: [string, Json | undefined][]) => (
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {data.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground break-words">{label}</dt>
          <dd className="break-words font-mono">{fmt(value, 4)}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <section
      className={`ph-no-capture ph-mask mx-auto min-w-0 w-full max-w-7xl space-y-6 ${reader || published ? '' : 'py-6'}`}
      data-testid="video-benchmark"
    >
      {!reader && !published && (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading as="h1" level="page">
              {s.title}
            </Heading>
            <p className="text-muted-foreground mt-2">{s.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => input.current?.click()} disabled={loading}>
              {s.open}
            </Button>
            {b && (
              <Button variant="outline" onClick={clear}>
                {s.clear}
              </Button>
            )}
          </div>
        </header>
      )}
      {!reader && !published && (
        <>
          <input
            ref={input}
            aria-label={s.open}
            type="file"
            multiple
            {...{ webkitdirectory: '' }}
            className="sr-only"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length > 0) void open(() => folderReader(files));
            }}
          />
          <details className="rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer">{s.source}</summary>
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void open(() => httpReader(source));
              }}
            >
              <Input
                aria-label={s.source}
                className="flex-1"
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://…/manifest.json"
                required
              />
              <Button type="submit" disabled={loading}>
                {s.load}
              </Button>
            </form>
            <p className="text-muted-foreground mt-3">{s.remote}</p>
          </details>
        </>
      )}
      {loading && <Card role="status">{s.loading}</Card>}
      {loadError && (
        <Card role="alert" className="border-destructive">
          <Heading level="card">{s.error}</Heading>
          <p className="my-2 break-all font-mono text-sm">{loadError}</p>
          <p>{s.retry}</p>
        </Card>
      )}
      {!b && !loading && !loadError && (
        <Card className="gap-4 py-12">
          <Heading>{s.empty}</Heading>
          <p className="max-w-3xl text-muted-foreground">{s.instructions}</p>
          <a
            className="text-primary underline"
            href={REF_ARTIFACT}
            target="_blank"
            rel="noreferrer"
          >
            {s.sample} · #34293342829
          </a>
        </Card>
      )}
      {b && loaded && loaded.cells.length > 0 && (
        <ServingResults
          bundle={b}
          cells={loaded.cells}
          urls={loaded.urls}
          downloads={loaded.downloads}
          html={loaded.html}
          initialCell={initialCell}
          onCellChange={onCellChange}
        />
      )}
      {b && loaded && loaded.cells.length === 0 && (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(400px,1fr)_minmax(0,1.5fr)]">
            <ResultSummary bundle={b} stored={Boolean(published)} />
            <div className="min-w-0 space-y-4">
              <div className="grid gap-5 lg:grid-cols-2">
                {ROLES.map((role) => {
                  const o = selected(role);
                  const r = at(b.report, 'roles', role);
                  const summary = at(r, 'summary');
                  const mediaUrl = loaded.urls.get(`report/${text(at(o, 'artifact_path'))}`);
                  const run = b.documents.get(`gpu/${role}/run.json`);
                  const rawSummary = at(run, 'summary');
                  return (
                    <Card key={role} className="gap-4">
                      <div className="flex justify-between">
                        <Heading level="section">{s[role]}</Heading>
                        <span className="text-sm text-muted-foreground">
                          {fmt(at(o, 'status'))}
                        </span>
                      </div>
                      {mediaUrl ? (
                        <>
                          <video
                            key={mediaUrl + slot}
                            data-role={role}
                            className="aspect-video w-full rounded-lg bg-black"
                            controls
                            crossOrigin="anonymous"
                            playsInline
                            preload="auto"
                            src={mediaUrl}
                            aria-label={`${s[role]} ${s.slot}`}
                            onPlay={(e) => {
                              document
                                .querySelectorAll<HTMLVideoElement>('[data-role]')
                                .forEach((v) => {
                                  if (v !== e.currentTarget) v.pause();
                                });
                            }}
                            onError={(e) => {
                              const node = e.currentTarget.nextElementSibling;
                              if (node) node.textContent = s.mediaError;
                            }}
                          />
                          <p role="status" className="text-xs text-destructive empty:hidden" />
                          <a
                            download={`${role}-${slot}.mp4`}
                            className="text-sm text-primary underline"
                            href={
                              loaded.downloads.get(`report/${text(at(o, 'artifact_path'))}`) ??
                              mediaUrl
                            }
                          >
                            {s.download}
                          </a>
                        </>
                      ) : (
                        <div className="flex aspect-video items-center justify-center rounded-lg bg-muted p-6 text-muted-foreground">
                          {s.noMedia}
                        </div>
                      )}
                      <details>
                        <summary className="cursor-pointer text-sm">
                          {s.settings} · {s.integrity}
                        </summary>
                        <p className="my-3 text-xs text-muted-foreground">{s.statsNote}</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">{s.latency}</p>
                            <p className="text-2xl font-semibold tabular-nums">
                              {fmt(at(summary, 'latency_median_seconds'))}{' '}
                              <span className="text-sm">s</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{s.throughput}</p>
                            <p className="text-2xl font-semibold tabular-nums">
                              {fmt(at(summary, 'valid_clips_per_second'), 5)}
                            </p>
                          </div>
                        </div>
                        {table([
                          [s.scheduled, at(summary, 'scheduled')],
                          [s.completed, at(rawSummary, 'completed')],
                          [s.valid, at(summary, 'valid')],
                          [s.failed, at(rawSummary, 'failed')],
                          [`${s.window} (s)`, at(summary, 'wall_seconds')],
                          [
                            s.warmup,
                            `${fmt(at(summary, 'warmups_valid'))} / ${fmt(at(summary, 'warmups_scheduled'))}`,
                          ],
                        ])}
                        <details>
                          <summary className="cursor-pointer text-sm">{s.integrity}</summary>
                          <div className="mt-3 space-y-3">
                            {table([
                              ...entries(at(o, 'media', 'video')).map(([k, v]): [string, Json] => [
                                `video.${k}`,
                                v,
                              ]),
                              ...entries(at(o, 'media', 'audio')).map(([k, v]): [string, Json] => [
                                `audio.${k}`,
                                v,
                              ]),
                            ])}
                            {rows(
                              at(
                                rows(at(run, 'records')).find(
                                  (record) => at(record, 'slot_id') === slot,
                                ),
                                'media',
                                'checks',
                              ),
                            ).map((check, i) => (
                              <p className="break-words text-xs" key={i}>
                                {text(at(check, 'name'))}:{' '}
                                <strong>{fmt(at(check, 'status'))}</strong> —{' '}
                                {text(at(check, 'detail'))}
                              </p>
                            ))}
                          </div>
                        </details>
                      </details>
                    </Card>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{s.audio}</p>
              {slots.length > 0 && (
                <Card className="gap-4">
                  <VideoSelect
                    label={s.slot}
                    value={slot}
                    onValueChange={setSlot}
                    options={slots.map((o) => ({
                      value: text(at(o, 'slot_id')),
                      label: `${at(o, 'phase') === 'warmup' ? s.warmup : s.measured} · ${text(at(o, 'slot_id'))}`,
                    }))}
                  />
                  <div>
                    <p className="mb-2 break-words text-sm font-medium">
                      {text(at(clip, 'case_id'))}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {s.prompt} · {s.seed} {fmt(at(clip, 'seed'))}
                    </span>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-sm leading-relaxed">
                        {text(at(clip, 'prompt')).slice(0, 150)}
                        {text(at(clip, 'prompt')).length > 150 ? '…' : ''}
                      </summary>
                      <p className="mt-2 text-sm leading-relaxed">{fmt(at(clip, 'prompt'))}</p>
                    </details>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm">{s.settings}</summary>
                    <div className="mt-3">
                      {table(entries(at(b.manifest, 'workload_plan', 'generation')))}
                    </div>
                  </details>
                </Card>
              )}
            </div>
          </div>
          <details className="space-y-4 rounded-lg border p-5">
            <summary className="cursor-pointer font-medium">
              {s.power} · {s.fidelity} · {s.hardware}
            </summary>
            <p className="text-sm text-muted-foreground">{s.timing}</p>
            {b.result ? (
              <ResultPower result={b.result} />
            ) : (
              <Card className="gap-4">
                <Heading>{s.power}</Heading>
                <p className="text-sm text-muted-foreground">{s.powerNote}</p>
                <div className="grid gap-6 lg:grid-cols-2">
                  {ROLES.map((role) => {
                    const power = loaded.power[role];
                    return (
                      <div key={role} className="space-y-3">
                        <Heading level="card">{s[role]}</Heading>
                        {table([
                          [`${s.meanPower} (W)`, power?.watts],
                          [`${s.energy} (kJ)`, power ? power.joules / 1000 : null],
                          [`${s.coverage} (s)`, power?.seconds],
                          [s.samples, power?.sampleCount],
                        ])}
                        {power && (
                          <p className="break-all text-xs text-muted-foreground">
                            {power.start} → {power.end}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Heading level="card">{s.memory}</Heading>
                <p className="text-sm text-muted-foreground">{s.memoryNote}</p>
                <div className="grid gap-6 lg:grid-cols-2">
                  {ROLES.map((role) => (
                    <div key={role} className="space-y-2">
                      <Heading level="label">{s[role]}</Heading>
                      {entries(
                        at(
                          b.job,
                          'roles',
                          role,
                          'telemetry_summary',
                          'measurement_observed_memory_peak_mib_by_gpu',
                        ),
                      ).length > 0
                        ? table(
                            entries(
                              at(
                                b.job,
                                'roles',
                                role,
                                'telemetry_summary',
                                'measurement_observed_memory_peak_mib_by_gpu',
                              ),
                            ).map(([gpu, value]) => [gpu, `${fmt(value)} MiB`]),
                          )
                        : s.unavailable}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card className="gap-4">
              <Heading>{s.fidelity}</Heading>
              <p className="text-sm text-muted-foreground">{s.fidelityNote}</p>
              {table([
                [
                  s.videoPsnr,
                  at(pair, 'metrics', 'video_identical') === true
                    ? s.identical
                    : at(pair, 'metrics', 'video_psnr_db'),
                ],
                [s.videoMae, at(pair, 'metrics', 'video_mae')],
                [s.audioSpectral, at(pair, 'metrics', 'audio_spectral_cosine')],
                [s.audioRms, at(pair, 'metrics', 'audio_rms_ratio')],
                [s.audioMae, at(rawPair, 'metrics', 'audio_waveform_mae')],
                [s.videoCoverage, at(rawPair, 'metrics', 'video_sample_coverage_fraction')],
                [s.audioCoverage, at(rawPair, 'metrics', 'audio_sample_coverage_fraction')],
              ])}
              <details>
                <summary className="cursor-pointer text-sm">{s.checks}</summary>
                {rows(at(pair, 'checks')).map((c, i) => (
                  <p key={i} className="mt-2 break-words text-xs">
                    {text(at(c, 'name'))} · {fmt(at(c, 'status'))} · {text(at(c, 'reason'))}
                  </p>
                ))}
              </details>
            </Card>
            <Card className="gap-4">
              <Heading>{s.hardware}</Heading>
              {table([
                [s.participating, participating > 0 ? participating : null],
                [
                  s.allocated,
                  /(?:^|,)gres\/gpu=(?<count>\d+)(?:,|$)/u.exec(
                    text(at(b.ci, 'slurm_job', 'AllocTRES')),
                  )?.groups?.count,
                ],
                ['Slurm', at(b.manifest, 'slurm_allocation', 'identity', 'JobId')],
                [s.node, at(b.ci, 'slurm_job', 'NodeList')],
                [s.model, at(b.manifest, 'workload_plan', 'model_id')],
                [s.modelRevision, at(b.manifest, 'workload_plan', 'model_revision')],
              ])}
              <div className="grid gap-6 lg:grid-cols-2">
                {ROLES.map((role) => (
                  <div key={role} className="space-y-3">
                    <Heading level="card">{s[role]}</Heading>
                    {table([
                      [
                        s.runtimeRevision,
                        at(b.report, 'roles', role, 'configuration', 'runtime_revision'),
                      ],
                      [
                        s.sourceHash,
                        at(b.report, 'roles', role, 'source_identity', 'source_sha256'),
                      ],
                      [
                        'GPU',
                        rows(at(b.job, 'roles', role, 'telemetry_summary', 'gpu_identity'))
                          .map((g) => text(at(g, 'name')))
                          .join(', '),
                      ],
                    ])}
                    <details>
                      <summary className="cursor-pointer text-sm">{s.settings}</summary>
                      <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(at(b.job, 'roles', role, 'launch_argv'), null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </Card>
          </details>
          <details className="rounded-lg border p-5">
            <summary className="cursor-pointer font-medium">{s.economics}</summary>
            <Card className="mt-4 gap-4">
              <Heading>{s.economics}</Heading>
              <p className="text-sm text-muted-foreground">{s.economicsNote}</p>
              <div className="grid gap-4 md:grid-cols-3">
                {field(s.price, price, setPrice)}
                {field(s.cost, cost, setCost)}
                {field(s.billed, billed, setBilled)}
                {field(s.assumption, assumption, setAssumption, 'text')}
                {field(s.date, date, setDate, 'date')}
              </div>
              <p className="text-xs text-muted-foreground">{s.needAssumptions}</p>
              <div className="grid gap-6 lg:grid-cols-2">
                {ROLES.map((role) => {
                  const summary = at(b.report, 'roles', role, 'summary');
                  const count = rows(
                    at(b.job, 'roles', role, 'telemetry_summary', 'gpu_identity'),
                  ).length;
                  const e =
                    assumption.trim() && date
                      ? estimateEconomics(
                          number(at(summary, 'valid_clips_per_second')),
                          count || null,
                          parseInput(billed),
                          parseInput(price),
                          parseInput(cost),
                        )
                      : null;
                  return (
                    <div key={role} className="space-y-3">
                      <Heading level="card">
                        {s[role]} · {s.estimate} (USD)
                      </Heading>
                      {table([
                        [s.revenueParticipant, e?.revenuePerParticipating],
                        [s.revenueBilled, e?.revenuePerBilled],
                        [s.profitParticipant, e?.profitPerParticipating],
                        [s.profitBilled, e?.profitPerBilled],
                      ])}
                    </div>
                  );
                })}
              </div>
            </Card>
          </details>
          <Card className="gap-4">
            <Heading>{s.provenance}</Heading>
            {ciUrl && (
              <a href={ciUrl} className="text-primary underline" target="_blank" rel="noreferrer">
                {s.ciRun} · #{text(at(b.manifest, 'run_id'))}
              </a>
            )}
            <a
              href={`https://github.com/SemiAnalysisAI/InferenceX/commit/${text(at(b.manifest, 'git_commit'))}`}
              className="break-all text-sm text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              {s.commit} · {text(at(b.manifest, 'git_commit'))}
            </a>
            {table([[s.manifest, b.manifestSha256]])}
            {loaded.html && (
              <details>
                <summary className="cursor-pointer">{s.report}</summary>
                <p className="my-3 text-sm text-muted-foreground">{s.reportNote}</p>
                <iframe
                  title={s.report}
                  sandbox="allow-same-origin allow-downloads"
                  referrerPolicy="no-referrer"
                  className="h-[70vh] w-full rounded-lg border bg-white"
                  srcDoc={loaded.html}
                />
              </details>
            )}
            <details>
              <summary className="cursor-pointer">{s.raw}</summary>
              <div className="mt-3 grid gap-2">
                {[...loaded.urls].map(([path, url]) => (
                  <a
                    className="break-all text-xs text-primary underline"
                    key={path}
                    href={loaded.downloads.get(path) ?? url}
                    download={path.replaceAll('/', '__')}
                  >
                    {path}
                  </a>
                ))}
              </div>
            </details>
          </Card>
          <Card className="gap-3">
            <Heading level="card">{s.missing}</Heading>
            <p className="text-sm text-muted-foreground">
              {rows(at(b.result, 'limitations')).map(text).join('; ') || s.missingNote}
            </p>
            {rows(at(b.report, 'acceptance_reasons')).map((reason, i) => (
              <p key={i} className="text-sm">
                {text(reason)}
              </p>
            ))}
          </Card>
        </>
      )}
    </section>
  );
}

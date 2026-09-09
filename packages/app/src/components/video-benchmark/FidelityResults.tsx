'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import VideoSelect from './VideoSelect';
import { at, ROLES, rows, text, type Json } from './bundle';
import { fidelitySource, loadFidelityBundle, type FidelityBundle } from './fidelity';
import { storedFidelityBundle, type StoredSource } from './stored';
import { renderReportHtml } from './report';

const STRINGS = {
  en: {
    title: 'Paired video fidelity',
    intro: 'CPU comparison of retained C1 videos. No new video generation.',
    pairs: 'Matched valid pairs',
    outside: 'Pairs outside fidelity thresholds',
    inconclusive: 'Inconclusive pairs',
    calibration: 'Threshold calibration',
    qualification: 'Release qualified',
    unavailable: 'Unavailable',
    uncalibrated: 'Uncalibrated',
    yes: 'Yes',
    no: 'No',
    note: 'Technical validity covers decoding, geometry and continuity. Paired pixel/audio comparisons measure output drift using exploratory thresholds; they do not establish perceptual quality, prompt adherence or a hardware quality winner.',
    loading: 'Loading and verifying paired evidence…',
    error: 'Could not load paired evidence',
    slot: 'Paired clip',
    baseline: 'Baseline',
    candidate: 'Candidate',
    prompt: 'Prompt',
    seed: 'Seed',
    audio: 'Play one side at a time to compare original audio.',
    download: 'Download original MP4',
    noMedia: 'No media for this observation',
    mediaError: 'The browser could not play this media. Download the original MP4 to inspect it.',
    latency: 'Submission to downloaded media (s)',
    integrity: 'Video/audio technical validity',
    details: 'Generation settings and revisions',
    runtime: 'Runtime revision',
    model: 'Model revision',
    metrics: 'Measured fidelity',
    psnr: 'Video PSNR (dB)',
    mae: 'Video MAE (normalized 0–1)',
    identical: 'Identical frames; finite PSNR undefined',
    spectral: 'Audio spectral cosine',
    rms: 'Audio RMS ratio (candidate / baseline)',
    waveform: 'Audio waveform MAE (PCM amplitude)',
    frames: 'Compared / total video frames',
    videoCoverage: 'Video sample coverage (fraction)',
    audioCoverage: 'Audio sample coverage (fraction)',
    audioSamples: 'Compared audio samples / channel',
    checks: 'Recorded checks and thresholds',
    check: 'Check',
    status: 'Recorded status',
    observed: 'Observed',
    threshold: 'Threshold',
    unit: 'Unit',
    timing:
      'Delivery latency is descriptive and includes polling and download. These cross-hardware results are not a calibrated performance regression or serving-capacity claim.',
    sources: 'Original GPU runs and evidence',
    originalResult: 'Original serving result and runtime log',
    runtimeNote:
      'Resolved attention backends and runtime settings can differ across sources. Consult the original runtime logs before attributing output differences to hardware.',
    producer: 'CPU comparison CI',
    artifact: 'Download CI artifact',
    digest: 'Comparison SHA256',
    raw: 'Raw comparison JSON',
    report: 'Original report',
    limitations: 'Backend policy and limitations',
  },
  zh: {
    title: '成对视频保真度',
    intro: '使用保留的 C1 视频在 CPU 上进行对比，未重新生成视频。',
    pairs: '匹配的有效视频对',
    outside: '超出保真度阈值的视频对',
    inconclusive: '无法判定的视频对',
    calibration: '阈值校准状态',
    qualification: '是否通过发布验收',
    unavailable: '无数据',
    uncalibrated: '未校准',
    yes: '是',
    no: '否',
    note: '技术有效性涵盖解码、画面尺寸与连续性。像素与音频配对比较采用探索性阈值，衡量的是输出偏差，不能证明感知质量或 prompt 遵循程度，也不能据此判定哪种硬件的视频质量更好。',
    loading: '正在加载并校验配对证据…',
    error: '无法加载配对证据',
    slot: '配对视频',
    baseline: '基线',
    candidate: '候选',
    prompt: 'Prompt',
    seed: 'Seed',
    audio: '每次只播放一侧，以便对比原始音频。',
    download: '下载原始 MP4',
    noMedia: '此侧暂无可用媒体',
    mediaError: '浏览器无法播放此媒体，请下载原始 MP4 检查。',
    latency: '提交到视频下载完成（秒）',
    integrity: '视频与音频技术有效性',
    details: '生成设置与版本',
    runtime: '运行时版本',
    model: '模型版本',
    metrics: '实测保真度',
    psnr: '视频 PSNR（dB）',
    mae: '视频 MAE（归一化 0–1）',
    identical: '帧完全一致，PSNR 无有限值',
    spectral: '音频频谱余弦相似度',
    rms: '音频 RMS 比值（候选 / 基线）',
    waveform: '音频波形 MAE（PCM 幅度）',
    frames: '已比较 / 总视频帧数',
    videoCoverage: '视频采样覆盖比例',
    audioCoverage: '音频采样覆盖比例',
    audioSamples: '每声道已比较音频采样数',
    checks: '已记录的检查与阈值',
    check: '检查项',
    status: '已记录状态',
    observed: '观测值',
    threshold: '阈值',
    unit: '单位',
    timing:
      '交付延迟仅作描述，包含轮询与下载时间。这些跨硬件数据不构成已校准的性能回归或持续服务容量结论。',
    sources: '原始 GPU 运行与证据',
    originalResult: '原始服务测试结果与运行时日志',
    runtimeNote:
      '各来源实际使用的 attention backend 与运行时设置可能不同。判断输出差异的原因时，请核对原始运行时日志，不要直接归因于硬件。',
    producer: 'CPU 对比 CI',
    artifact: '下载 CI 产物',
    digest: '对比结果 SHA256',
    raw: '原始对比 JSON',
    report: '原始报告',
    limitations: '后端策略与局限',
  },
};

export default function FidelityResults({
  reader,
  published,
  runId,
}: {
  reader?: (path: string) => Promise<Blob>;
  published?: StoredSource;
  runId: string;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const [loaded, setLoaded] = useState<{
    bundle: FidelityBundle;
    urls: Map<string, string>;
    downloads: Map<string, string>;
    html: string;
  } | null>(null);
  const [loadError, setError] = useState('');
  const [slotId, setSlotId] = useState('');
  const [mediaError, setMediaError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    setLoaded(null);
    setError('');
    setSlotId('');
    setMediaError(false);
    void (async () => {
      try {
        const bundle = published
          ? storedFidelityBundle(published)
          : await loadFidelityBundle(reader!, runId);
        if (cancelled) return;
        const urls = new Map(published?.assets.map(([path, asset]) => [path, asset.url]));
        if (!published)
          for (const [path, blob] of bundle.files) {
            const url = URL.createObjectURL(
              new Blob([blob], {
                type: path.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream',
              }),
            );
            created.push(url);
            urls.set(path, url);
          }
        const raw = await bundle.files.get('report/index.html')?.text();
        if (cancelled) return;
        setLoaded({
          bundle,
          urls,
          downloads: published
            ? new Map(published.assets.map(([path, asset]) => [path, asset.downloadUrl]))
            : urls,
          html: raw ? renderReportHtml(raw, urls) : '',
        });
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
      created.forEach(URL.revokeObjectURL);
    };
  }, [reader, published, runId]);
  const fmt = (value: Json | undefined) =>
    typeof value === 'number'
      ? value.toLocaleString('en-US', { maximumFractionDigits: 4 })
      : value === true
        ? s.yes
        : value === false
          ? s.no
          : value === null || value === undefined || value === ''
            ? s.unavailable
            : typeof value === 'string'
              ? value
              : JSON.stringify(value);
  if (loadError)
    return (
      <Card role="alert">
        <Heading>{s.error}</Heading>
        <p className="break-all text-sm">{loadError}</p>
      </Card>
    );
  if (!loaded) return <Card role="status">{s.loading}</Card>;
  const { bundle, urls, downloads } = loaded;
  const comparison = bundle.comparison;
  const slots = rows(at(bundle.portable, 'slots'));
  const slot = slots.find((item) => at(item, 'slot_id') === slotId) ?? slots[0];
  const metrics = at(slot, 'metrics');
  const table = (values: [string, Json | undefined][]) => (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
      {values.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-all tabular-nums">{fmt(value)}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="space-y-4" data-testid="fidelity-results">
      <Card className="gap-4">
        <div>
          <Heading>{s.title}</Heading>
          <p className="mt-2 text-sm text-muted-foreground">{s.intro}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [s.pairs, at(comparison, 'summary', 'matched_valid_pairs')],
            [
              s.outside,
              slots.filter((item) =>
                rows(at(item, 'checks')).some(
                  (check) =>
                    text(at(check, 'name')).startsWith('fidelity.') &&
                    at(check, 'status') === 'fail',
                ),
              ).length,
            ],
            [s.inconclusive, at(comparison, 'summary', 'inconclusive_slots')],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="text-2xl font-semibold tabular-nums">{fmt(value)}</p>
            </div>
          ))}
        </div>
        {table([
          [
            s.calibration,
            at(comparison, 'policy', 'calibration_status') === 'uncalibrated'
              ? s.uncalibrated
              : at(comparison, 'policy', 'calibration_status'),
          ],
          [s.qualification, at(comparison, 'release_qualified')],
        ])}
        <p className="text-sm text-muted-foreground">{s.note}</p>
        <p className="text-xs text-muted-foreground">{s.runtimeNote}</p>
      </Card>
      <Card className="gap-4">
        <div className="max-w-lg">
          <VideoSelect
            label={s.slot}
            value={text(at(slot, 'slot_id'))}
            onValueChange={(value) => {
              setSlotId(value);
              setMediaError(false);
              track('video_fidelity_clip_selected', { slot: value });
            }}
            options={slots.map((item) => ({
              value: text(at(item, 'slot_id')),
              label: `${text(at(item, 'slot_id'))} · ${text(at(item, 'case_id'))}`,
            }))}
          />
        </div>
        <p className="text-sm">
          <span className="font-medium">{s.prompt}: </span>
          {text(at(slot, 'prompt'))}
        </p>
        <p className="text-xs text-muted-foreground">
          {s.seed}: {fmt(at(slot, 'seed'))} · {s.audio}
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          {ROLES.map((role) => {
            const observation = at(slot, role);
            const path = text(at(observation, 'artifact_path'));
            const source = fidelitySource(bundle, role);
            const sourceId = at(source, 'ci', 'databaseId');
            const ci = bundle.documents.get(`sources/${sourceId}/ci.json`);
            return (
              <div key={role} className="min-w-0 space-y-3">
                <Heading level="card">
                  {s[role]} · {fmt(at(ci, 'site', 'gpu_model'))}
                </Heading>
                {urls.get(`report/${path}`) ? (
                  <video
                    key={path}
                    src={urls.get(`report/${path}`)}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={s[role]}
                    className="aspect-video w-full rounded-lg bg-black"
                    onError={() => setMediaError(true)}
                  />
                ) : (
                  <p>{s.noMedia}</p>
                )}
                {downloads.get(`report/${path}`) && (
                  <a
                    className="text-sm text-primary underline"
                    href={downloads.get(`report/${path}`)}
                    download
                  >
                    {s.download}
                  </a>
                )}
                {table([
                  [s.latency, at(observation, 'latency_seconds')],
                  [s.integrity, at(observation, 'media', 'valid')],
                  [s.runtime, at(comparison, role, 'configuration', 'runtime_revision')],
                  [s.model, at(comparison, role, 'configuration', 'model_revision')],
                ])}
              </div>
            );
          })}
        </div>
        {mediaError && <p role="alert">{s.mediaError}</p>}
        <p className="text-xs text-muted-foreground">{s.timing}</p>
        <details>
          <summary className="cursor-pointer text-sm">{s.details}</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(
              {
                generation: at(comparison, 'plan', 'generation'),
                baseline: at(comparison, 'baseline', 'configuration'),
                candidate: at(comparison, 'candidate', 'configuration'),
              },
              null,
              2,
            )}
          </pre>
        </details>
      </Card>
      <Card className="gap-4">
        <Heading>{s.metrics}</Heading>
        {table([
          [
            s.psnr,
            at(metrics, 'video_identical') === true ? s.identical : at(metrics, 'video_psnr_db'),
          ],
          [s.mae, at(metrics, 'video_mae')],
          [s.spectral, at(metrics, 'audio_spectral_cosine')],
          [s.rms, at(metrics, 'audio_rms_ratio')],
          [s.waveform, at(metrics, 'audio_waveform_mae')],
          [
            s.frames,
            `${fmt(at(metrics, 'video_compared_frames'))} / ${fmt(at(metrics, 'video_total_frames'))}`,
          ],
          [s.videoCoverage, at(metrics, 'video_sample_coverage_fraction')],
          [s.audioCoverage, at(metrics, 'audio_sample_coverage_fraction')],
          [s.audioSamples, at(metrics, 'audio_compared_samples_per_channel')],
        ])}
        <details>
          <summary className="cursor-pointer text-sm">{s.checks}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-2xl text-left text-xs">
              <thead>
                <tr>
                  {[s.check, s.status, s.observed, s.threshold, s.unit].map((label) => (
                    <th key={label} className="p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows(at(slot, 'checks')).map((check, index) => (
                  <tr key={index} className="border-t">
                    {['name', 'status', 'observed', 'threshold', 'unit'].map((key) => (
                      <td key={key} className="p-2">
                        {fmt(at(check, key))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
      <Card className="gap-4">
        <Heading>{s.sources}</Heading>
        <div className="flex flex-wrap gap-4 text-sm">
          {ROLES.map((role) => {
            const source = fidelitySource(bundle, role);
            const id = at(source, 'ci', 'databaseId');
            const artifact = at(source, 'artifact', 'id');
            return (
              <div key={role} className="space-y-1">
                <p>{s[role]}</p>
                <a
                  className="text-primary underline"
                  href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  CI #{String(id)}
                </a>
                <br />
                <a
                  className="text-primary underline"
                  href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}/artifacts/${artifact}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.artifact}
                </a>
                <br />
                <a
                  className="text-primary underline"
                  href={`${locale === 'zh' ? '/zh' : ''}/video?run=${id}&artifact=${artifact}&source=${id}&cell=c1`}
                >
                  {s.originalResult}
                </a>
              </div>
            );
          })}
        </div>
        <a
          className="text-sm text-primary underline"
          href={text(at(comparison, 'producer', 'run_url'))}
          target="_blank"
          rel="noreferrer"
        >
          {s.producer} #{runId}
        </a>
        {table([[s.digest, bundle.comparisonSha256]])}
        {downloads.get('comparison.json') && (
          <a
            className="text-sm text-primary underline"
            href={downloads.get('comparison.json')}
            download
          >
            {s.raw}
          </a>
        )}
        {loaded.html && (
          <details>
            <summary className="cursor-pointer text-sm">{s.report}</summary>
            <iframe
              title={s.report}
              sandbox="allow-same-origin allow-downloads"
              srcDoc={loaded.html}
              className="mt-3 h-[36rem] w-full rounded-lg border"
            />
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-sm">{s.limitations}</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(
              {
                policy: at(comparison, 'policy'),
                measurement: at(comparison, 'measurement'),
                limitations: at(comparison, 'limitations'),
                release_qualification_reason: at(comparison, 'release_qualification_reason'),
              },
              null,
              2,
            )}
          </pre>
        </details>
      </Card>
    </div>
  );
}

'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { InfoHelp } from '@/components/ui/option-info';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import {
  parseStage,
  promptKey,
  STAGE_VIEWS,
  stagePrompt,
  stageSubject,
  writeStage,
} from './clip-stage';
import { hardwareLabel } from './hardware';
import type { MetricOptions, VideoPoint } from './metrics';
import {
  publishedResultsSide,
  resultsClipReference,
  type ResultsClipGroup,
  type ResultsClipSide,
} from './results-clips';
import { RESULTS_HARDWARE } from './results';
import type { StoredArtifact } from './stored';
import { videoClipSourceKey as sourceKey, type VideoInitialData } from './initial-data';
import VideoClipStage, { type StageClip } from './VideoClipStage';

const STRINGS = {
  en: {
    label: 'Comparison clips',
    approval: 'Approval',
    approved: 'Approved',
    unapproved: 'No matching receipt',
    prompts: 'Prompts',
    sources: 'Prompt & sources',
    source: 'Source',
    run: 'Run',
    runtime: 'Runtime',
    artifact: 'Artifact',
    receipt: 'Receipt',
    diagnostic: 'Matched-noise rerun',
    diagnosticNote:
      'Single-clip rerun with fixed noise and parallelism. Charts below use the original 20-clip run.',
    diagnosticMetric: 'Not provided for this diagnostic.',
    media: 'Media',
    webEncode: 'Playback uses a web encode; Difference, PSNR and the media link use the original.',
    seed: 'seed',
    take: (n: number) => `take ${n}`,
    more: 'More',
    less: 'Less',
    noPair: 'No retained clips share a verified prompt, seed, take and generation configuration.',
    loading: 'Loading retained clips…',
    missing: 'No matched clip',
    error: 'Retained clips could not be loaded.',
    retry: 'Retry clips',
    view: 'Clip view',
    views: { wipe: 'Wipe', side: 'Side by side', toggle: 'Toggle', diff: 'Difference' },
    viewHelp: {
      wipe: 'Move the pointer over the clips to slide the split; click to lock it.',
      side: 'Both clips next to each other.',
      toggle: 'Click the clips or press T to flip; hold Space to peek at the other clip.',
      diff: 'RGB difference ×4 between the two clips.',
    },
    noReference: 'No sealed reference pair for this clip.',
    unpublishedMedia: 'Media is not shown for an unpublished run.',
    reference: 'Official Diffusers reference',
    referenceShort: 'Diffusers reference',
    schedule: (updates: number, sigmas: number) => `${updates} updates · ${sigmas} sigma points`,
    exactMatch: 'Exact match',
    incompatible: 'Paired media are incompatible; PSNR is unavailable.',
    psnrMeasured: (frames: number) =>
      `Decoded RGB24 · all ${frames} frames · full-stream MSE. Descriptive cross-engine comparison; no quality pass/fail threshold. Different engines and parallel layouts produce different pixels from the same prompt and seed, so a low value alone does not indicate a defect.`,
    referenceNote:
      'Encoded reference MP4. PSNR compares every decoded RGB pixel and frame; it does not measure semantic quality.',
    facts: (name: string) => `${name} clip metrics`,
    wall: 'Wall time',
    psnr: 'PSNR',
    energy: 'J / clip',
    costBasis: 'Modelled TCO · $/video-s',
    participatingCost: 'Participating',
    allocatedCost: 'Allocated',
    energyNote:
      'Mean GPU-board joules per valid clip in the selected measurement cell; not a per-clip energy trace.',
    psnrNote: 'No sealed paired PSNR result is available for this clip.',
    unscored: {
      invalid_candidate: 'Invalid clip',
      checksum_mismatch: 'Checksum mismatch',
      no_reference: 'No reference',
      settings_mismatch: 'Settings differ',
      unreadable: 'Unreadable artifact',
    },
    unscoredNote: {
      invalid_candidate: () =>
        'The quality scorer did not compare this clip because it is not a valid measured output.',
      checksum_mismatch: () =>
        'The quality scorer did not compare this clip because its bytes do not match the recorded SHA256.',
      no_reference: () =>
        'The quality scorer did not compare this clip because the reference set has no clip for this case.',
      settings_mismatch: (fields: string[]) =>
        `The quality scorer did not compare this clip because its settings differ from the reference${fields.length > 0 ? `: ${fields.join(', ')}` : ''}.`,
      unreadable: () =>
        'The quality scorer could not read this artifact, so none of its clips were compared.',
    },
    metricsHelp:
      'PSNR uses a sealed Diffusers reference pair and every decoded RGB frame. J/clip is the selected cell mean. Both TCO bases use the selected tier, recorded GPU count and valid decoded output duration.',
    gpu: (n: number) => `${n} GPU`,
    seconds: 's',
  },
  zh: {
    label: '视频对比',
    approval: '发布批准',
    approved: '已批准',
    unapproved: '暂无匹配记录',
    prompts: 'Prompt 列表',
    sources: 'Prompt 与来源',
    source: '来源',
    run: '运行',
    runtime: 'Runtime',
    artifact: '产物',
    receipt: '回执',
    diagnostic: '相同初始噪声重跑',
    diagnosticNote:
      '单条视频重跑，使用固定的初始噪声和并行配置。下方图表仍展示原始 20 条视频的测试结果。',
    diagnosticMetric: '此次重跑未提供该指标。',
    media: '视频文件',
    webEncode: '播放使用网页转码版本；“差异”视图、PSNR 和视频文件链接仍使用原始视频。',
    seed: 'seed',
    take: (n: number) => `第 ${n} 次`,
    more: '展开',
    less: '收起',
    noPair: '没有 prompt、seed、重复次数和生成配置均已核实一致的保留视频。',
    loading: '正在加载保留视频…',
    missing: '没有匹配的视频',
    error: '无法加载保留视频。',
    retry: '重试加载视频',
    view: '视频视图',
    views: { wipe: '卷帘', side: '并排', toggle: '切换', diff: '差异' },
    viewHelp: {
      wipe: '在视频上移动指针，分界线随之移动；点击可锁定。',
      side: '两段视频并排显示。',
      toggle: '点击画面或按 T 切换，按住空格键可临时查看另一段视频。',
      diff: '两段视频的 RGB 差异 ×4。',
    },
    noReference: '此视频暂无已封存的参考配对。',
    unpublishedMedia: '未发布的运行不显示视频。',
    reference: '官方 Diffusers 参考',
    referenceShort: 'Diffusers 参考',
    schedule: (updates: number, sigmas: number) => `${updates} 次更新 · ${sigmas} 个 sigma 点`,
    exactMatch: '完全一致',
    incompatible: '配对媒体不兼容，无法提供 PSNR。',
    psnrMeasured: (frames: number) =>
      `解码后 RGB24 · 全部 ${frames} 帧 · 全流 MSE。仅作跨引擎数值对比，不设质量合格阈值。不同引擎或并行配置即使使用相同的 prompt 和 seed，生成的像素也会不同，因此仅凭 PSNR 偏低不能说明输出有问题。`,
    referenceNote: '已编码的参考 MP4。PSNR 对比全部解码 RGB 像素和帧，不衡量语义质量。',
    facts: (name: string) => `${name} 视频指标`,
    wall: '出片时间',
    psnr: 'PSNR',
    energy: 'J / clip',
    costBasis: 'TCO 估算 · $/视频秒',
    participatingCost: '参与 GPU',
    allocatedCost: '分配 GPU',
    energyNote: '所选测量单元每条有效视频的平均 GPU 板卡能耗，不是单条视频的能耗轨迹。',
    psnrNote: '此视频尚无已封存的配对 PSNR 结果。',
    unscored: {
      invalid_candidate: '无效视频',
      checksum_mismatch: '校验和不符',
      no_reference: '无参考视频',
      settings_mismatch: '配置不一致',
      unreadable: '产物无法读取',
    },
    unscoredNote: {
      invalid_candidate: () => '该视频不是有效的测量输出，质量评分器未作比较。',
      checksum_mismatch: () => '该视频文件的 SHA256 与记录值不符，质量评分器未作比较。',
      no_reference: () => '参考集中没有该用例的视频，质量评分器未作比较。',
      settings_mismatch: (fields: string[]) =>
        `该视频的配置与参考不一致${fields.length > 0 ? `（${fields.join('、')}）` : ''}，质量评分器未作比较。`,
      unreadable: () => '质量评分器无法读取该产物，因此其中的视频均未比较。',
    },
    metricsHelp:
      'PSNR 使用已封存的 Diffusers 参考配对，比较全部解码 RGB 帧。J/clip 是所选测量单元的平均值。两种 TCO 口径均使用所选成本档位、记录的 GPU 数量和有效输出的实际时长。',
    gpu: (n: number) => `${n} 张 GPU`,
    seconds: 's',
  },
};

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];
type Costs = Record<string, { participating: number | null; allocated: number | null }>;
export interface VideoResultsClipsProps {
  /** One lead point per hardware; the stage shows one of them against its reference. */
  points: VideoPoint[];
  colorFor: (key: string) => string;
  hidden: ReadonlySet<string>;
  options?: MetricOptions;
  costs?: Costs;
  unofficialRun?: string;
  initialSides?: VideoInitialData['sides'];
}

const display = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';

export default function VideoResultsClips({
  points,
  colorFor,
  hidden,
  costs,
  unofficialRun,
  initialSides = {},
}: VideoResultsClipsProps) {
  const s = STRINGS[useLocale()];
  const stage = parseStage(useClientSearch());
  // Callers pick one clip per hardware, which may be a lossy named run's.
  const selected = useMemo(
    () => points.filter((p) => RESULTS_HARDWARE.some((key) => p.hardwareKey === key)),
    [points],
  );
  const cache = useRef(new Map<string, ResultsClipSide | null>(Object.entries(initialSides)));
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const missing = selected.filter((point) => !cache.current.has(sourceKey(point)));
    setLoading(missing.length > 0);
    setFailed(false);
    void Promise.allSettled(
      missing.map(async (point) => {
        const read = (format: 'published' | 'live') =>
          fetch(
            `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=${format}`,
            { signal: controller.signal },
          );
        let response = await read('published');
        // An unstored named run carries PSNR without media.
        if (response.status === 204 && point.runId === unofficialRun) response = await read('live');
        if (response.status === 204) {
          if (controller.signal.aborted) return null;
          cache.current.set(sourceKey(point), null);
          return null;
        }
        if (!response.ok) throw new Error('Published media read failed');
        const side = publishedResultsSide((await response.json()) as StoredArtifact, point);
        if (controller.signal.aborted) return null;
        cache.current.set(sourceKey(point), side);
        setRevision((n) => n + 1);
        return side;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setFailed(results.some((result) => result.status === 'rejected'));
      setLoading(false);
    });
    return () => controller.abort();
  }, [selected, retry, unofficialRun]);
  const subject = useMemo(
    () =>
      stageSubject(
        selected.map((point) => {
          const key = sourceKey(point);
          return {
            point,
            side: cache.current.has(key)
              ? (cache.current.get(key) ?? null)
              : failed
                ? null
                : undefined,
          };
        }),
        hidden,
      ),
    [selected, revision, failed, hidden],
  );
  /** Web renditions that failed to load; their sides play the sealed original instead. */
  const [failedPreviews, setFailedPreviews] = useState<ReadonlySet<string>>(new Set());
  const groups = subject?.groups ?? [];
  const group = stagePrompt(groups, stage.prompt);
  const diagnostic = group?.scope === 'matched-noise-diagnostic';
  const clip = group && subject?.side ? (group.clips.get(subject.side.hardwareKey) ?? null) : null;
  const reference = resultsClipReference(group, new Set());
  const point = subject?.point;
  const hardware = point?.hardwareKey ?? '';
  const native = clip?.quality && 'scope' in clip.quality ? clip.quality.candidate : null;
  const preview = (url: string | undefined) => (url && !failedPreviews.has(url) ? url : undefined);
  const a: StageClip | null = point
    ? {
        source: point.id,
        id: hardware,
        label: hardwareLabel(hardware),
        meta: native
          ? s.gpu(native.gpu_count)
          : typeof point.participating === 'number'
            ? s.gpu(point.participating)
            : '',
        color: colorFor(hardware),
        url: clip?.url ?? '',
        previewUrl: preview(clip?.previewUrl),
        empty: clip ? s.unpublishedMedia : subject.pending ? s.loading : s.missing,
        unofficial: !diagnostic && unofficialRun !== undefined && point.runId === unofficialRun,
      }
    : null;
  const b: StageClip = {
    source: 'reference',
    id: 'reference',
    label: s.referenceShort,
    meta: '',
    color: null,
    url: reference?.url ?? '',
    previewUrl: preview(reference?.previewUrl),
    empty: s.noReference,
  };
  return (
    <section
      id="comparison-clips"
      aria-labelledby="comparison-clips-title"
      data-testid="video-results-clips"
      className="min-w-0 scroll-mt-24 space-y-3"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Heading as="h2" level="card" id="comparison-clips-title">
          {s.label}
        </Heading>
        {diagnostic && <span className="text-sm text-muted-foreground">{s.diagnostic}</span>}
        <InfoHelp label={s.label} value="clip-metrics" triggerTestId="video-results-metrics-help">
          {diagnostic ? s.diagnosticNote : s.metricsHelp}
        </InfoHelp>
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {s.loading}
        </p>
      )}
      {failed && (
        <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{s.error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              track('video_results_clips_retry');
              setRetry((n) => n + 1);
            }}
          >
            {s.retry}
          </Button>
        </div>
      )}
      {a && point ? (
        <>
          {groups.length > 1 && (
            <div
              role="group"
              aria-label={s.prompts}
              data-testid="video-results-prompts"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {groups.map((item, index) => {
                const key = promptKey(item);
                const caseId = [...item.clips.values()][0]?.record.caseId ?? key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-prompt={key}
                    aria-pressed={item === group}
                    className={cn(
                      'flex w-32 shrink-0 flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-xs',
                      item === group
                        ? 'border-foreground bg-muted'
                        : 'border-border hover:border-muted-foreground',
                    )}
                    onClick={() => {
                      track('video_results_prompt_selected', { index, case: caseId });
                      writeStage({ ...stage, prompt: key });
                    }}
                  >
                    <span className="truncate font-mono font-medium">{caseId}</span>
                    <span className="truncate text-muted-foreground">
                      {item.scope ? s.diagnostic : `${s.seed} ${item.seed}`}
                      {!item.scope && item.take > 1 && ` · ${s.take(item.take)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            {group ? <PromptLine group={group} s={s} /> : <span />}
            <SegmentedToggle
              role="group"
              ariaLabel={s.view}
              value={stage.view}
              size="sm"
              options={STAGE_VIEWS.map((mode) => ({
                value: mode,
                label: s.views[mode],
                title: s.viewHelp[mode],
                testId: `video-results-view-${mode}`,
              }))}
              onValueChange={(view) => {
                track('video_results_clips_view', { view });
                writeStage({ ...stage, view });
              }}
            />
          </div>
          <VideoClipStage
            a={a}
            b={b}
            view={stage.view}
            selection={JSON.stringify([point.id, group?.key ?? null])}
            prompt={group?.prompt}
            onPreviewError={(url) => setFailedPreviews((previous) => new Set([...previous, url]))}
          />
          <div
            data-testid="video-results-facts"
            aria-label={s.facts(a.label)}
            className="grid gap-x-6 gap-y-2 text-xs tabular-nums sm:grid-cols-2"
          >
            <dl className="space-y-1">
              {[
                [
                  s.wall,
                  diagnostic || !clip || clip.record.seconds === null
                    ? '—'
                    : `${display(clip.record.seconds)} ${s.seconds}`,
                  diagnostic ? s.diagnosticMetric : '',
                ],
                [
                  s.psnr,
                  clip?.quality?.status === 'identical'
                    ? s.exactMatch
                    : clip?.quality?.status === 'measured'
                      ? `${display(clip.quality.psnrDb, 2)} dB`
                      : clip?.unscored
                        ? s.unscored[clip.unscored.reason]
                        : '—',
                  clip?.quality
                    ? clip.quality.status === 'incompatible'
                      ? s.incompatible
                      : s.psnrMeasured(clip.quality.totalFrames)
                    : clip?.unscored
                      ? s.unscoredNote[clip.unscored.reason](clip.unscored.fields)
                      : s.psnrNote,
                ],
                [
                  s.energy,
                  display(diagnostic || point.energyKj === null ? null : point.energyKj * 1000, 0),
                  diagnostic ? s.diagnosticMetric : s.energyNote,
                ],
              ].map(([label, value, title]) => (
                <div
                  key={label}
                  title={title || undefined}
                  className="flex min-w-0 flex-wrap justify-between gap-x-2 border-b border-border/40 py-0.5"
                >
                  <dt className="min-w-0 text-muted-foreground">{label}</dt>
                  <dd className="m-0 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <p className="text-2xs text-muted-foreground">{s.costBasis}</p>
              <dl className="space-y-1">
                {[
                  [
                    s.participatingCost,
                    display(diagnostic ? null : costs?.[point.id]?.participating, 4),
                  ],
                  [s.allocatedCost, display(diagnostic ? null : costs?.[point.id]?.allocated, 4)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex min-w-0 flex-wrap justify-between gap-x-2 border-b border-border/40 py-0.5"
                  >
                    <dt className="min-w-0 text-muted-foreground">{label}</dt>
                    <dd className="m-0 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <details
            data-testid="video-results-sources"
            className="group/sources text-xs"
            onToggle={(event) =>
              track('video_results_sources_toggled', { enabled: event.currentTarget.open })
            }
          >
            <summary
              className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
              tabIndex={0}
            >
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 transition-transform group-open/sources:rotate-90"
              />
              {s.sources}
            </summary>
            {(a.previewUrl || b.previewUrl) && (
              <p className="mt-3 text-muted-foreground">{s.webEncode}</p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left">
                <thead className="whitespace-nowrap text-muted-foreground">
                  <tr>
                    <th className="pr-3 font-medium">{s.source}</th>
                    <th className="pr-3 font-medium">{s.run}</th>
                    <th className="pr-3 font-medium">{diagnostic ? s.receipt : s.artifact}</th>
                    <th className="pr-3 font-medium">{s.runtime}</th>
                    <th className="pr-3 font-medium">{s.approval}</th>
                    <th className="font-medium">{s.media}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t align-top">
                    <td className="pr-3 whitespace-nowrap">{a.label}</td>
                    <td className="pr-3 break-all">
                      {native?.run_id ?? (diagnostic ? '—' : point.runId)}
                    </td>
                    <td className="pr-3 break-all" title={native?.receipt_sha256}>
                      {native
                        ? native.receipt_sha256.slice(0, 12)
                        : diagnostic
                          ? '—'
                          : point.artifactId}
                    </td>
                    <td className="pr-3 break-all">
                      {native
                        ? `${native.runtime_name} ${native.runtime_revision.slice(0, 12)}`
                        : (!diagnostic && point.runtime) || '—'}
                    </td>
                    <td className="pr-3 whitespace-nowrap">
                      {diagnostic ? '—' : point.approved === true ? s.approved : s.unapproved}
                    </td>
                    <td className="whitespace-nowrap">
                      <MediaLink
                        url={clip?.url}
                        label={s.media}
                        onOpen={() => track('video_results_media_source_opened', { gpu: hardware })}
                      />
                    </td>
                  </tr>
                  {reference && (
                    <tr className="border-t align-top">
                      <td className="pr-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {s.reference}
                          <InfoHelp label={s.reference} value="reference-method">
                            {s.referenceNote}
                          </InfoHelp>
                        </span>
                      </td>
                      <td className="pr-3">—</td>
                      <td className="pr-3 break-all" title={reference.receipt_sha256}>
                        {reference.receipt_sha256.slice(0, 12)}
                      </td>
                      <td className="pr-3 break-all">
                        Diffusers {reference.diffusers_revision.slice(0, 12)} ·{' '}
                        {s.schedule(reference.denoising_updates, reference.sigma_points)}
                      </td>
                      <td className="pr-3">—</td>
                      <td className="whitespace-nowrap">
                        <MediaLink
                          url={reference.url}
                          label={s.media}
                          onOpen={() => track('video_results_reference_opened')}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        !loading && <p className="text-sm text-muted-foreground">{s.noPair}</p>
      )}
    </section>
  );
}

function MediaLink({ url, label, onOpen }: { url?: string; label: string; onOpen: () => void }) {
  return url ? (
    <a className="underline" href={url} onClick={onOpen}>
      {label}
    </a>
  ) : (
    '—'
  );
}

/** Seed, take and the prompt text, clamped to two lines with a More toggle when it overflows. */
function PromptLine({ group, s }: { group: ResultsClipGroup; s: Strings }) {
  const text = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const element = text.current;
      if (element && !open) setClamped(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [group.prompt, open]);
  return (
    <div
      data-testid="video-results-prompt"
      className="flex min-w-0 flex-1 basis-72 items-baseline gap-2 text-xs"
    >
      <span className="shrink-0 font-mono text-muted-foreground">
        {s.seed} {group.seed} · {group.scope ? s.diagnostic : s.take(group.take)}
      </span>
      <p ref={text} className={cn('min-w-0 flex-1 break-words', !open && 'line-clamp-2')}>
        {group.prompt}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          className="shrink-0 text-primary hover:underline"
          onClick={() => {
            track('video_results_prompt_toggled', { enabled: !open });
            setOpen(!open);
          }}
        >
          {open ? s.less : s.more}
        </button>
      )}
    </div>
  );
}

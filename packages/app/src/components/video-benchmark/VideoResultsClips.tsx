'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { InfoHelp } from '@/components/ui/option-info';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { cn } from '@/lib/shared/utils';
import {
  pairedGroup,
  parseStage,
  promptKey,
  STAGE_VIEWS,
  stageOptions,
  stagePointKey,
  stagePrompt,
  stageSubject,
  writeStage,
  type StageOption,
  type StagePair,
} from './clip-stage';
import { hardwareLabel } from './hardware';
import type { VideoPoint } from './metrics';
import { isLossy, lossyLabel, optimizationsOf } from './optimizations';
import {
  publishedResultsSide,
  resultsClipGroups,
  resultsClipReference,
  type ResultsClip,
  type ResultsClipGroup,
  type ResultsClipSide,
} from './results-clips';
import { RESULTS_HARDWARE, resultMetadata, type ResultCell } from './results';
import type { StoredArtifact } from './stored';
import { videoClipSourceKey as sourceKey, type VideoInitialData } from './initial-data';
import VideoClipReadout from './VideoClipReadout';
import VideoClipStage, { SideDot, type StageClip } from './VideoClipStage';

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
    referenceNote:
      'Encoded reference MP4. PSNR compares every decoded RGB pixel and frame; it does not measure semantic quality.',
    metricsHelp:
      'PSNR uses a sealed Diffusers reference pair and every decoded RGB frame. J/clip is the selected cell mean. Both TCO bases use the selected tier, recorded GPU count and valid decoded output duration.',
    gpu: (n: number) => `${n} GPU`,
    compareWith: 'Compare with',
    lossless: 'lossless',
    twin: (hardware: string) => `${hardware} lossless`,
    noTwin: 'This run has no lossless config with the same engine and server layout.',
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
    referenceNote: '已编码的参考 MP4。PSNR 对比全部解码 RGB 像素和帧，不衡量语义质量。',
    metricsHelp:
      'PSNR 使用已封存的 Diffusers 参考配对，比较全部解码 RGB 帧。J/clip 是所选测量单元的平均值。两种 TCO 口径均使用所选成本档位、记录的 GPU 数量和有效输出的实际时长。',
    gpu: (n: number) => `${n} 张 GPU`,
    compareWith: '对比',
    lossless: '无损',
    twin: (hardware: string) => `${hardware} 无损对照`,
    noTwin: '该运行中没有引擎和服务器布局都相同的无损配置。',
  },
};

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];
export interface VideoResultsClipsProps {
  /** One lead point per hardware: the default subject, and what the other side can show. */
  points: VideoPoint[];
  /** Points the chart draws; `r_clip` plays one of them. */
  drawn?: readonly VideoPoint[];
  /** Every deployment of the workload, where a lossy subject finds its lossless twin. */
  deployments?: readonly VideoPoint[];
  /** One official lead per hardware, which a subject from `unofficialRun` is compared with. */
  officialLeads?: readonly VideoPoint[];
  /** Hardware color; a side from `unofficialRun` takes the overlay color. */
  colorFor: (key: string) => string;
  /** Modelled TCO of every point by `VideoPoint.id`, for the readout's per-clip cost. */
  costs?: Readonly<Record<string, ResultCell['cost']>>;
  unofficialRun?: string;
  initialSides?: VideoInitialData['sides'];
  /** The chart points the two sides play, for the chart's Playing and Baseline badges. */
  onPairChange?: (pair: StagePair) => void;
  /** Under the readout rows; the quality explainer fills it. */
  readoutFooter?: ReactNode;
}

const NO_POINTS: readonly VideoPoint[] = [];

/** "FirstBlockCache + Sol-Attn" for a lossy side, so it never reads as its lossless twin. */
const lossyVariant = (p: VideoPoint) => (isLossy(p) ? (lossyLabel(optimizationsOf(p)) ?? '') : '');

export default function VideoResultsClips({
  points,
  drawn = NO_POINTS,
  deployments = NO_POINTS,
  officialLeads = NO_POINTS,
  colorFor,
  costs,
  unofficialRun,
  initialSides = {},
  onPairChange,
  readoutFooter,
}: VideoResultsClipsProps) {
  const s = STRINGS[useLocale()];
  const stage = parseStage(useClientSearch());
  // Callers pick one clip per hardware, which may be a lossy named run's.
  const selected = useMemo(
    () => points.filter((p) => RESULTS_HARDWARE.some((key) => p.hardwareKey === key)),
    [points],
  );
  const picked = stage.clip ? drawn.find((p) => stagePointKey(p) === stage.clip) : undefined;
  /** `StageOption.value` the reader picked; one the subject lacks shows the reference. */
  const [against, setAgainst] = useState('reference');
  const cache = useRef(new Map<string, ResultsClipSide | null>(Object.entries(initialSides)));
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  /** Undefined while its read is in flight; null when there is none. */
  const sideOf = (point: VideoPoint) => {
    const key = sourceKey(point);
    return cache.current.has(key) ? (cache.current.get(key) ?? null) : failed ? null : undefined;
  };
  const subject = useMemo(
    () =>
      stageSubject(
        [...selected, ...(picked && !selected.includes(picked) ? [picked] : [])].map((point) => ({
          point,
          side: sideOf(point),
        })),
        unofficialRun,
        stage.clip,
      ),
    [selected, picked, revision, failed, unofficialRun, stage.clip],
  );
  const options = useMemo(() => {
    if (!subject) return [];
    // A candidate run is read against production: the official lead on its own GPU.
    const own =
      subject.point.runId === unofficialRun
        ? (officialLeads.find((p) => p.hardwareKey === subject.point.hardwareKey) ?? null)
        : null;
    return stageOptions(subject.point, selected, deployments, own);
  }, [subject, selected, deployments, officialLeads, unofficialRun]);
  const option = options.find((item) => item.value === against) ?? options[0];
  const other = option?.point ?? null;
  const wantedPoints = [
    ...new Set([...selected, ...(picked ? [picked] : []), ...(other ? [other] : [])]),
  ];
  // Callers rebuild `points` on every render; reads restart only when the set of sides changes.
  const wantedKey = wantedPoints.map(sourceKey).join('\n');
  const wanted = useMemo(() => wantedPoints, [wantedKey]);
  useEffect(() => {
    const controller = new AbortController();
    const missing = wanted.filter((point) => !cache.current.has(sourceKey(point)));
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
  }, [wanted, retry, unofficialRun]);
  const playing = subject ? stagePointKey(subject.point) : null;
  const baseline = other ? stagePointKey(other) : null;
  useEffect(() => onPairChange?.({ playing, baseline }), [playing, baseline, onPairChange]);
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
  const otherSide = other ? sideOf(other) : null;
  // The other side plays its clip of the subject's prompt, seed and take.
  const otherClip = useMemo(() => {
    const match = otherSide && pairedGroup(resultsClipGroups([otherSide]), group);
    return match ? (match.clips.get(otherSide.hardwareKey) ?? null) : null;
  }, [otherSide, group]);
  const otherNative =
    otherClip?.quality && 'scope' in otherClip.quality ? otherClip.quality.candidate : null;
  const preview = (url: string | undefined) => (url && !failedPreviews.has(url) ? url : undefined);
  const colorOf = (p: VideoPoint) =>
    p.runId === unofficialRun ? overlayRunColor(0) : colorFor(p.hardwareKey ?? '');
  /** A chart point's side: its clip of the shown prompt, or why it has none. */
  const pointSide = (
    p: VideoPoint,
    found: ResultsClip | null,
    pending: boolean,
    variant: string,
  ): StageClip => {
    const rerun = found?.quality && 'scope' in found.quality ? found.quality.candidate : null;
    const gpus = rerun?.gpu_count ?? p.participating;
    return {
      source: stagePointKey(p),
      id: p.hardwareKey ?? '',
      label: hardwareLabel(p.hardwareKey ?? ''),
      meta: [typeof gpus === 'number' ? s.gpu(gpus) : '', variant].filter(Boolean).join(' · '),
      color: colorOf(p),
      url: found?.url ?? '',
      previewUrl: preview(found?.previewUrl),
      empty: found ? s.unpublishedMedia : pending ? s.loading : s.missing,
      unofficial: !diagnostic && unofficialRun !== undefined && p.runId === unofficialRun,
    };
  };
  const a: StageClip | null = point
    ? pointSide(point, clip, subject.pending, lossyVariant(point))
    : null;
  const b: StageClip =
    !option || option.kind === 'reference'
      ? {
          source: 'reference',
          id: 'reference',
          label: s.referenceShort,
          meta: '',
          color: null,
          url: reference?.url ?? '',
          previewUrl: preview(reference?.previewUrl),
          empty: subject?.pending ? s.loading : s.noReference,
        }
      : other
        ? pointSide(
            other,
            otherClip,
            otherSide === undefined,
            option.kind === 'twin' ? s.lossless : lossyVariant(other),
          )
        : {
            source: 'twin',
            id: hardware,
            label: s.twin(hardwareLabel(hardware)),
            meta: '',
            color: a?.color ?? null,
            url: '',
            empty: s.noTwin,
          };
  const optionLabel = (item: StageOption) =>
    item.kind === 'reference'
      ? s.referenceShort
      : item.kind === 'twin'
        ? s.twin(hardwareLabel(hardware))
        : hardwareLabel(item.value);
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
          {options.length > 1 && option && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs font-medium">{s.compareWith}</span>
              <SegmentedToggle
                role="group"
                ariaLabel={s.compareWith}
                testId="video-results-compare"
                value={option.value}
                size="sm"
                options={options.map((item) => ({
                  value: item.value,
                  label: optionLabel(item),
                  icon: (
                    <SideDot
                      color={
                        item.kind === 'reference'
                          ? null
                          : item.point
                            ? colorOf(item.point)
                            : a.color
                      }
                    />
                  ),
                  testId: `video-results-compare-${item.value}`,
                }))}
                onValueChange={(value) => {
                  const next = options.find((item) => item.value === value);
                  track('video_results_compare_selected', {
                    against: next?.kind,
                    gpu: next?.point?.hardwareKey ?? null,
                  });
                  setAgainst(value);
                }}
              />
            </div>
          )}
          <VideoClipStage
            a={a}
            b={b}
            view={stage.view}
            selection={JSON.stringify([a.source, b.source, group?.key ?? null])}
            prompt={group?.prompt}
            fps={resultMetadata(point).fps}
            frames={point.frameCount}
            onPreviewError={(url) => setFailedPreviews((previous) => new Set([...previous, url]))}
          />
          <VideoClipReadout
            kind={option?.kind ?? 'reference'}
            a={{
              name: a.label,
              pill: a,
              point,
              clip: subject?.pending ? undefined : clip,
              cost: costs?.[point.id],
            }}
            b={{
              name: option?.kind === 'twin' ? s.twin(hardwareLabel(hardware)) : b.label,
              pill: b,
              point: other,
              clip: other && otherSide === undefined ? undefined : otherClip,
              cost: other ? costs?.[other.id] : undefined,
            }}
            diagnostic={diagnostic}
            footer={readoutFooter}
          />
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
                  <SourceRow
                    label={a.label}
                    point={point}
                    native={native}
                    diagnostic={diagnostic}
                    url={clip?.url}
                    s={s}
                  />
                  {other && (
                    <SourceRow
                      label={b.label}
                      point={other}
                      native={otherNative}
                      diagnostic={diagnostic}
                      url={otherClip?.url}
                      s={s}
                    />
                  )}
                  {reference && b.source === 'reference' && (
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

type RerunCandidate = Extract<ResultsClip['quality'], { scope: unknown }>['candidate'];

/** Run, artifact, runtime, approval and media link of one side's chart point. */
function SourceRow({
  label,
  point,
  native,
  diagnostic,
  url,
  s,
}: {
  label: string;
  point: VideoPoint;
  /** The matched-noise rerun's own run, receipt and runtime, which replace the point's. */
  native: RerunCandidate | null;
  diagnostic: boolean;
  url?: string;
  s: Strings;
}) {
  return (
    <tr className="border-t align-top">
      <td className="pr-3 whitespace-nowrap">{label}</td>
      <td className="pr-3 break-all">{native?.run_id ?? (diagnostic ? '—' : point.runId)}</td>
      <td className="pr-3 break-all" title={native?.receipt_sha256}>
        {native ? native.receipt_sha256.slice(0, 12) : diagnostic ? '—' : point.artifactId}
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
          url={url}
          label={s.media}
          onOpen={() => track('video_results_media_source_opened', { gpu: point.hardwareKey })}
        />
      </td>
    </tr>
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

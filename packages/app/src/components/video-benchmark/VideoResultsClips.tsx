'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { InfoHelp } from '@/components/ui/option-info';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientSearch } from '@/hooks/useClientSearch';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { cn } from '@/lib/shared/utils';
import {
  compareConfigs,
  configId,
  defaultPairing,
  pairedGroup,
  parseStage,
  promptKey,
  STAGE_ID,
  STAGE_VIEWS,
  stageOptions,
  stagePointKey,
  stagePrompt,
  stageSubject,
  writeStage,
  type StageOption,
  type StagePair,
} from './clip-stage';
import { engineLabel } from './engines';
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
import QualityMethod from './QualityMethod';
import VideoClipReadout from './VideoClipReadout';
import VideoClipStage, { SideDot, STAGE_FIT_WIDTH, type StageClip } from './VideoClipStage';

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
    morePrompts: (n: number) => `Show ${n} more prompts`,
    fewerPrompts: 'Show fewer prompts',
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
      'PSNR uses a sealed Diffusers reference pair and every decoded RGB frame. Speed is the ratio of the two cells’ p50; wall time is this prompt’s request alone. $ per clip is modelled TCO on the participating GPUs from the selected tier and recorded GPU count, and $/video-s spreads it over valid decoded output duration; hover it for the allocated basis. Energy per clip is the selected cell’s mean. Paired scores against the lossless twin are planned; no scorer computes them yet.',
    gpu: (n: number) => (n === 1 ? '1 GPU' : `${n} GPUs`),
    official: 'official',
    compare: 'Compare',
    with: 'with',
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
    morePrompts: (n: number) => `显示其余 ${n} 条 prompt`,
    fewerPrompts: '收起 prompt 列表',
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
      'PSNR 使用已封存的 Diffusers 参考配对，比较全部解码 RGB 帧。速度是两个测量单元 p50 之比，出片时间只是当前 prompt 这一次请求的时长。每条视频成本按所选成本档位和记录的 GPU 数量估算参与 GPU 的 TCO，每视频秒成本按有效输出的实际解码时长分摊；悬停该格可查看按分配 GPU 估算的口径。每条视频能耗是所选测量单元的平均值。以无损对照为基准的配对评分仍在计划中，目前还没有评分器计算。',
    gpu: (n: number) => `${n} 张 GPU`,
    official: '官方',
    compare: '对比',
    with: '对照',
    lossless: '无损',
    twin: (hardware: string) => `${hardware} 无损对照`,
    noTwin: '该运行中没有引擎和服务器布局都相同的无损配置。',
  },
};

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];
export interface VideoResultsClipsProps {
  /** One lead point per hardware: what the other side can show. */
  points: VideoPoint[];
  /** The deployment the stage opens on per hardware (`stageOpenings`); defaults to `points`. */
  openings?: readonly VideoPoint[];
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
  /**
   * `StageOption.value` the reader picked, or null for the subject's `defaultPairing`; one the
   * subject lacks shows the reference. Page state, so the chart can reset it with a new subject.
   */
  against: string | null;
  onAgainstChange: (value: string) => void;
  /** Plays the chart point with this key, as a chart click does. */
  onSubjectChange: (clipKey: string) => void;
  /** Plays a point against a `StageOption.value` in Wipe and asks for a reveal. */
  onShow: (point: VideoPoint, against: string) => void;
  /** Counts reveal requests; each scrolls the stage into view and focuses it once its reads land. */
  reveal: number;
  /** The drawn point the reader rests on in the chart; its clips are read ahead for its hover card. */
  peek?: string | null;
}

const NO_POINTS: readonly VideoPoint[] = [];
const onRoster = (p: VideoPoint) => RESULTS_HARDWARE.some((key) => p.hardwareKey === key);
/** Strip geometry in px: a 92 px tile, the 40 px "+N" tile and the 8 px gap between them. */
const TILE = 92;
const MORE = 40;
const GAP = 8;
/** The most tiles the collapsed strip shows, so the prompt beside it stays the row's subject. */
const MAX_TILES = 3;
/** The longest the stage holds the last pair for the next pair's first frames, in ms. */
const FRAME_WAIT_MS = 800;
/** What the stage shows: `r_clip`, the pairing choice and `r_prompt`. */
interface Selection {
  clip: string | null;
  against: string | null;
  prompt: string | null;
}

/** "FirstBlockCache + Sol-Attn" for a lossy side, so it never reads as its lossless twin. */
const lossyVariant = (p: VideoPoint) => (isLossy(p) ? (lossyLabel(optimizationsOf(p)) ?? '') : '');

/** A point's published clips; null when its run stored none. Throws when the read fails. */
async function readSide(
  point: VideoPoint,
  unofficialRun: string | undefined,
  signal: AbortSignal,
): Promise<ResultsClipSide | null> {
  const read = (format: 'published' | 'live') =>
    fetch(
      `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=${format}`,
      { signal },
    );
  let response = await read('published');
  // An unstored named run carries PSNR without media.
  if (response.status === 204 && point.runId === unofficialRun) response = await read('live');
  if (response.status === 204) return null;
  if (!response.ok) throw new Error('Published media read failed');
  return publishedResultsSide((await response.json()) as StoredArtifact, point);
}

export default function VideoResultsClips({
  points,
  openings,
  drawn = NO_POINTS,
  deployments = NO_POINTS,
  officialLeads = NO_POINTS,
  colorFor,
  costs,
  unofficialRun,
  initialSides = {},
  onPairChange,
  against,
  onAgainstChange,
  onSubjectChange,
  onShow,
  reveal,
  peek = null,
}: VideoResultsClipsProps) {
  const s = STRINGS[useLocale()];
  const isPhone = useIsMobileViewport();
  const stage = parseStage(useClientSearch());
  // Callers pick one clip per hardware, which may be a lossy named run's.
  const selected = useMemo(() => points.filter(onRoster), [points]);
  const opening = useMemo(() => (openings ?? points).filter(onRoster), [openings, points]);
  const cache = useRef(new Map<string, ResultsClipSide | null>(Object.entries(initialSides)));
  const [revision, setRevision] = useState(0);
  /** Sources whose last read failed; a source added since is still pending, not missing. */
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(new Set());
  const failed = failedKeys.size > 0;
  const [retry, setRetry] = useState(0);
  /** Undefined while its read is in flight; null when there is none. */
  const sideOf = (point: VideoPoint) => {
    const key = sourceKey(point);
    if (cache.current.has(key)) return cache.current.get(key) ?? null;
    return failedKeys.has(key) ? null : undefined;
  };
  /** The official lead on a candidate run's own GPU; null for an official point. */
  const ownLead = (p: VideoPoint) =>
    p.runId === unofficialRun
      ? (officialLeads.find((lead) => lead.hardwareKey === p.hardwareKey) ?? null)
      : null;
  /** The subject a selection plays, and the side it is compared with. */
  const pairFor = (clipKey: string | null, value: string | null) => {
    const picked = clipKey ? drawn.find((p) => stagePointKey(p) === clipKey) : undefined;
    const subject = stageSubject(
      [...opening, ...(picked && !opening.includes(picked) ? [picked] : [])].map((point) => ({
        point,
        side: sideOf(point),
      })),
      unofficialRun,
      clipKey,
    );
    // A candidate run is read against production: the official lead on its own GPU.
    const own = subject ? ownLead(subject.point) : null;
    const options = subject ? stageOptions(subject.point, selected, deployments, own) : [];
    const pairing = value ?? (subject ? defaultPairing(subject.point, own) : 'reference');
    const option = options.find((item) => item.value === pairing) ?? options[0];
    return { picked, subject, options, option, other: option?.point ?? null };
  };
  type Pair = ReturnType<typeof pairFor>;
  const ready = ({ subject, other }: Pair) =>
    subject !== null && !subject.pending && (other === null || sideOf(other) !== undefined);
  // The reader's pick: the chart's badges and the Compare row follow it at once.
  const next = useMemo(
    () => pairFor(stage.clip, against),
    [
      opening,
      drawn,
      revision,
      failedKeys,
      unofficialRun,
      selected,
      deployments,
      officialLeads,
      stage.clip,
      against,
    ],
  );
  const nextReady = ready(next);
  /** The first frames a pair shows for a prompt. */
  const framesOf = (
    { subject: shown, option: choice, other: paired }: Pair,
    prompt: string | null,
  ) => {
    const shownGroup = stagePrompt(shown?.groups ?? [], prompt);
    const own = shown?.side ? shownGroup?.clips.get(shown.side.hardwareKey)?.posterUrl : undefined;
    const pairedSide = paired ? sideOf(paired) : null;
    const pairs =
      !choice || choice.kind === 'reference'
        ? resultsClipReference(shownGroup, new Set())?.posterUrl
        : pairedSide
          ? pairedGroup(resultsClipGroups([pairedSide]), shownGroup)?.clips.get(
              pairedSide.hardwareKey,
            )?.posterUrl
          : undefined;
    return [own, pairs].filter((url): url is string => Boolean(url));
  };
  const nextFrames = nextReady ? framesOf(next, stage.prompt) : [];
  const nextFramesKey = nextFrames.join('\n');
  /** First frames that loaded, failed or ran out of time; the stage waits for no others. */
  const [settledFrames, setSettledFrames] = useState<ReadonlySet<string>>(new Set());
  /** First frames that loaded, which the stage's idle frame never covers. */
  const [loadedFrames, setLoadedFrames] = useState<ReadonlySet<string>>(new Set());
  const requestedFrames = useRef(new Set<string>());
  const frameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => frameTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    for (const url of nextFramesKey.split('\n')) {
      if (!url || requestedFrames.current.has(url)) continue;
      requestedFrames.current.add(url);
      const settle = () => setSettledFrames((previous) => new Set([...previous, url]));
      const image = new Image();
      image.addEventListener(
        'load',
        () => {
          setLoadedFrames((previous) => new Set([...previous, url]));
          settle();
        },
        { once: true },
      );
      image.addEventListener('error', settle, { once: true });
      image.src = url;
      // A slow frame shows black for a moment rather than hold the last pair.
      frameTimers.current.push(setTimeout(settle, FRAME_WAIT_MS));
    }
  }, [nextFramesKey]);
  // The stage and readout keep the last pair whose reads landed until the next pair's land, as
  // the inference chart keeps its data while it refetches, dimmed by `motion-stale`. They also
  // keep it, undimmed, until the next pair's first frames load. A switch so never blanks the
  // stage or collapses the prompt row above it.
  const shownNext = nextReady && nextFrames.every((url) => settledFrames.has(url));
  const [held, setHeld] = useState<Selection | null>(null);
  // The first ready pair is on screen as soon as it is read, so it is held at once; only a switch
  // away from a held pair waits for frames.
  if (
    (nextReady && !held) ||
    (shownNext &&
      held &&
      (held.clip !== stage.clip || held.against !== against || held.prompt !== stage.prompt))
  )
    setHeld({ clip: stage.clip, against, prompt: stage.prompt });
  const heldPair = useMemo(
    () => (!shownNext && held ? pairFor(held.clip, held.against) : null),
    [
      shownNext,
      held,
      opening,
      drawn,
      revision,
      failedKeys,
      unofficialRun,
      selected,
      deployments,
      officialLeads,
    ],
  );
  const holding = heldPair !== null && ready(heldPair);
  // A hold that waited on a read stays dimmed through its first frames, so the last pair never
  // brightens just before the next replaces it.
  const [reading, setReading] = useState(false);
  if (holding && !nextReady && !reading) setReading(true);
  if (!holding && reading) setReading(false);
  const stale = holding && (reading || !nextReady);
  const { subject, option, other } = holding ? heldPair : next;
  const shownPrompt = holding && held ? held.prompt : stage.prompt;
  const wantedPoints = [
    ...new Set([
      ...selected,
      ...opening,
      ...(next.picked ? [next.picked] : []),
      ...(next.other ? [next.other] : []),
    ]),
  ];
  // Callers rebuild `points` on every render; reads restart only when the set of sides changes.
  const wantedKey = wantedPoints.map(sourceKey).join('\n');
  const wanted = useMemo(() => wantedPoints, [wantedKey]);
  // Derived in render, so it is true from the render that asks for a new side, not one effect later.
  const loading = wanted.some((point) => sideOf(point) === undefined);
  useEffect(() => {
    const controller = new AbortController();
    const missing = wanted.filter((point) => !cache.current.has(sourceKey(point)));
    setFailedKeys((previous) => (previous.size > 0 ? new Set() : previous));
    void Promise.allSettled(
      missing.map(async (point) => {
        const side = await readSide(point, unofficialRun, controller.signal);
        if (controller.signal.aborted) return null;
        cache.current.set(sourceKey(point), side);
        setRevision((n) => n + 1);
        return side;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setFailedKeys(
        new Set(
          missing
            .filter((_, index) => results[index].status === 'rejected')
            .map((point) => sourceKey(point)),
        ),
      );
    });
    return () => controller.abort();
  }, [wanted, retry, unofficialRun]);
  // A rested-on chart point's read never counts as loading; moving on to another point drops it.
  /** Rested-on points whose read failed, so their hover card stops waiting; a click reads again. */
  const [failedPeeks, setFailedPeeks] = useState<ReadonlySet<string>>(new Set());
  const peeked = useMemo(
    () => (peek ? drawn.find((p) => stagePointKey(p) === peek) : undefined),
    [peek, drawn],
  );
  useEffect(() => {
    if (!peeked) return undefined;
    const key = sourceKey(peeked);
    if (cache.current.has(key) || wanted.some((p) => sourceKey(p) === key)) return undefined;
    const controller = new AbortController();
    readSide(peeked, unofficialRun, controller.signal)
      .then((side) => {
        if (controller.signal.aborted) return;
        cache.current.set(key, side);
        setRevision((n) => n + 1);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedPeeks((previous) => new Set([...previous, key]));
      });
    return () => controller.abort();
  }, [peeked, wanted, unofficialRun]);
  const stageRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(reveal);
  // A read that lands restores the prompt row above the stage, so a reveal waits for every read.
  useEffect(() => {
    if (reveal === revealed.current || loading) return;
    revealed.current = reveal;
    document.querySelector(`#${STAGE_ID}`)?.scrollIntoView({ block: 'nearest' });
    // Space and T act on the focused stage.
    stageRef.current?.focus({ preventScroll: true });
  }, [reveal, loading]);
  /** Web renditions that failed to load; their sides play the sealed original instead. */
  const [failedPreviews, setFailedPreviews] = useState<ReadonlySet<string>>(new Set());
  const groups = subject?.groups ?? [];
  const group = stagePrompt(groups, shownPrompt);
  const diagnostic = group?.scope === 'matched-noise-diagnostic';
  const playing = next.subject ? stagePointKey(next.subject.point) : null;
  const baseline = next.other ? stagePointKey(next.other) : null;
  // Each read point lends its first frame of the shown prompt, or null when it has none.
  const postersJson = useMemo(
    () =>
      JSON.stringify(
        [...new Set([...wanted, ...drawn])].flatMap((p) => {
          const side = sideOf(p);
          if (side === undefined)
            return failedPeeks.has(sourceKey(p)) ? [[stagePointKey(p), null]] : [];
          const url = side
            ? pairedGroup(resultsClipGroups([side]), group)?.clips.get(side.hardwareKey)?.posterUrl
            : undefined;
          return [[stagePointKey(p), url ?? null]];
        }),
      ),
    [wanted, drawn, revision, failedKeys, failedPeeks, group],
  );
  // Before paint, so the chart's badges and hover card never lag the stage they describe.
  useLayoutEffect(
    () =>
      onPairChange?.({ playing, baseline, posters: Object.fromEntries(JSON.parse(postersJson)) }),
    [playing, baseline, postersJson, onPairChange],
  );
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
    const engine = rerun?.runtime_name ?? resultMetadata(p).engine;
    return {
      source: stagePointKey(p),
      id: p.hardwareKey ?? '',
      label: hardwareLabel(p.hardwareKey ?? ''),
      engine: engine ? engineLabel(engine) : undefined,
      meta: [typeof gpus === 'number' ? s.gpu(gpus) : '', variant].filter(Boolean).join(' · '),
      color: colorOf(p),
      url: found?.url ?? '',
      previewUrl: preview(found?.previewUrl),
      posterUrl: found?.posterUrl,
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
          meta: s.official,
          color: null,
          url: reference?.url ?? '',
          previewUrl: preview(reference?.previewUrl),
          posterUrl: reference?.posterUrl,
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
  // The Compare row and its pairing follow the reader's pick at once, not the held pair.
  const configs = compareConfigs(opening, drawn, unofficialRun);
  const nextHardware = next.subject?.point.hardwareKey ?? '';
  const active = next.subject && configId(next.subject.point, unofficialRun);
  const configLabel = (p: VideoPoint) =>
    [hardwareLabel(p.hardwareKey ?? ''), lossyVariant(p)].filter(Boolean).join(' · ');
  const pickConfig = (p: VideoPoint) => {
    track('video_results_compare_selected', {
      subject: configId(p, unofficialRun),
      pairing: defaultPairing(p, ownLead(p)),
    });
    onSubjectChange(stagePointKey(p));
  };
  /** ←/→ on a focused segment plays the previous or next config; the phone select has its own. */
  const cycleConfigs = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || configs.length < 2 || !(event.target instanceof HTMLButtonElement)) return;
    event.preventDefault();
    const index = configs.findIndex((p) => configId(p, unofficialRun) === active);
    const target =
      index === -1
        ? step > 0
          ? 0
          : configs.length - 1
        : (index + step + configs.length) % configs.length;
    event.currentTarget.querySelectorAll('button')[target]?.focus();
    pickConfig(configs[target]);
  };
  const optionLabel = (item: StageOption) =>
    item.kind === 'reference'
      ? s.referenceShort
      : item.kind === 'twin'
        ? s.twin(hardwareLabel(nextHardware))
        : item.value === nextHardware
          ? `${hardwareLabel(item.value)} ${s.official}`
          : hardwareLabel(item.value);
  return (
    <section
      id="comparison-clips"
      aria-label={s.label}
      data-testid="video-results-clips"
      className="min-w-0 scroll-mt-24 space-y-3"
    >
      <p role="status" className="sr-only">
        {loading ? s.loading : ''}
      </p>
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
      {subject?.pending ? (
        <ClipsSkeleton />
      ) : a && point ? (
        <>
          <PromptRow
            groups={groups}
            group={stagePrompt(groups, stage.prompt)}
            s={s}
            onPick={(item, index, poster) => {
              track('video_results_prompt_selected', { index, case: caseOf(item), poster });
              writeStage({ ...stage, prompt: promptKey(item) });
            }}
          >
            <div className="flex shrink-0 items-center gap-1.5">
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
              <InfoHelp
                label={s.label}
                value="clip-metrics"
                triggerTestId="video-results-metrics-help"
              >
                {diagnostic ? s.diagnosticNote : s.metricsHelp}
              </InfoHelp>
            </div>
          </PromptRow>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-medium">{s.compare}</span>
            <div className={isPhone ? 'min-w-0 flex-1' : 'min-w-0'} onKeyDown={cycleConfigs}>
              <SegmentedToggle
                role="group"
                ariaLabel={s.compare}
                testId="video-results-config"
                value={active ?? ''}
                size="sm"
                variant={isPhone ? 'select' : 'segments'}
                options={configs.map((p) => ({
                  value: configId(p, unofficialRun),
                  label: configLabel(p),
                  title: p.participating === null ? undefined : s.gpu(p.participating),
                  icon: <SideDot color={colorOf(p)} />,
                  testId: `video-results-config-${configId(p, unofficialRun)}`,
                }))}
                onValueChange={(value) => {
                  const config = configs.find((p) => configId(p, unofficialRun) === value);
                  if (config) pickConfig(config);
                }}
              />
            </div>
            {next.option && (
              <label
                className={cn(
                  'flex items-center gap-1 text-xs text-muted-foreground',
                  isPhone ? 'basis-full justify-end' : 'ml-auto',
                )}
              >
                {s.with}
                <span className="relative inline-flex items-center">
                  <select
                    data-testid="video-results-against"
                    value={next.option.value}
                    onChange={(event) => {
                      const choice = next.options.find((item) => item.value === event.target.value);
                      track('video_results_against_selected', {
                        against: choice?.kind,
                        gpu: choice?.point?.hardwareKey ?? null,
                      });
                      onAgainstChange(event.target.value);
                    }}
                    className="cursor-pointer appearance-none rounded-sm bg-transparent py-0.5 pr-4 font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {next.options.map((item) => (
                      <option key={item.value} value={item.value}>
                        {optionLabel(item)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 size-3"
                  />
                </span>
              </label>
            )}
          </div>
          <div
            className="motion-stale space-y-3"
            data-stale={stale || undefined}
            aria-busy={stale || undefined}
            data-testid="video-results-pair"
          >
            <VideoClipStage
              ref={stageRef}
              a={a}
              b={b}
              view={stage.view}
              selection={JSON.stringify([a.source, b.source, group?.key ?? null])}
              prompt={group?.prompt}
              fps={resultMetadata(point).fps}
              frames={point.frameCount}
              onPreviewError={(url) => setFailedPreviews((previous) => new Set([...previous, url]))}
              loadedFrames={loadedFrames}
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
            />
          </div>
          <QualityMethod
            leads={selected.map((lead) => ({ point: lead, side: sideOf(lead) }))}
            namedRun={unofficialRun}
            onShowMe={(target) => onShow(target, 'reference')}
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

/** The prompt row, stage and transport, held in place until the first pair's reads land. */
function ClipsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3" data-testid="video-results-clips-skeleton">
      <div className="flex items-start gap-2">
        {Array.from({ length: MAX_TILES }, (_, index) => (
          <Skeleton key={index} className="aspect-[1344/768] w-23 shrink-0" />
        ))}
        <div className="flex min-w-0 flex-1 flex-col gap-2 pl-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="mx-auto w-full space-y-3" style={{ maxWidth: STAGE_FIT_WIDTH.overlay }}>
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
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

const caseOf = (group: ResultsClipGroup) =>
  [...group.clips.values()][0]?.record.caseId ?? promptKey(group);

/** "take N" tells a group apart only when another loaded take shares its prompt and seed. */
const namesTake = (groups: readonly ResultsClipGroup[], group: ResultsClipGroup) =>
  !group.scope &&
  groups.some(
    (other) =>
      other !== group && !other.scope && other.prompt === group.prompt && other.seed === group.seed,
  );

const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * The prompt strip, the shown prompt and `children` (the view modes) on one row; below 820 px the
 * strip and the prompt each take a full line. The collapsed strip shows the tiles that fit, up to
 * three plus the shown prompt's, and a "+N" tile that expands it.
 */
function PromptRow({
  groups,
  group,
  s,
  onPick,
  children,
}: {
  groups: readonly ResultsClipGroup[];
  group: ResultsClipGroup | null;
  s: Strings;
  onPick: (group: ResultsClipGroup, index: number, poster: boolean) => void;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Infinity);
  const [expanded, setExpanded] = useState(false);
  /** Posters that failed to load; their tiles fall back to the next poster, then to text. */
  const [failedPosters, setFailedPosters] = useState<ReadonlySet<string>>(new Set());
  useLayoutEffect(() => {
    const element = row.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fits = (room: number) => Math.min(MAX_TILES, Math.floor(room / (TILE + GAP)));
  const count = expanded
    ? groups.length
    : groups.length <= fits(width + GAP)
      ? groups.length
      : Math.max(1, fits(width - MORE));
  const head = groups.slice(0, count);
  const shown = !group || head.includes(group) ? head : [...head.slice(0, count - 1), group];
  const rest = groups.length - shown.length;
  /** The clip whose first frame a tile shows: the reference's, else the first clip's. */
  const faceOf = (item: ResultsClipGroup) =>
    [resultsClipReference(item, NO_HIDDEN), [...item.clips.values()][0]].find(
      (clip) => clip?.posterUrl && !failedPosters.has(clip.posterUrl),
    );
  return (
    <div
      ref={row}
      data-testid="video-results-prompt-row"
      className="flex flex-wrap items-center gap-x-4 gap-y-3"
    >
      {groups.length > 1 && (
        <div
          role="group"
          aria-label={s.prompts}
          data-testid="video-results-prompts"
          className={cn(
            // The padding keeps the selected tile's ring inside the clip.
            '-m-0.5 flex min-w-0 items-start gap-2 p-0.5',
            expanded ? 'basis-full flex-wrap' : 'overflow-hidden max-[820px]:basis-full',
          )}
        >
          {shown.map((item) => {
            const face = faceOf(item);
            const poster = face?.posterUrl;
            const take = namesTake(groups, item) ? s.take(item.take) : null;
            return (
              <PromptTile
                key={item.key}
                prompt={promptKey(item)}
                caseId={caseOf(item)}
                label={
                  item.scope
                    ? s.diagnostic
                    : poster
                      ? take
                      : [`${s.seed} ${item.seed}`, take].filter(Boolean).join(' · ')
                }
                poster={poster}
                preview={face?.previewUrl}
                pressed={item === group}
                onPick={() => onPick(item, groups.indexOf(item), Boolean(poster))}
                onPosterError={(url) => setFailedPosters((previous) => new Set([...previous, url]))}
              />
            );
          })}
          {(rest > 0 || expanded) && (
            <button
              type="button"
              data-testid="video-results-prompts-more"
              aria-expanded={expanded}
              aria-label={expanded ? s.fewerPrompts : s.morePrompts(rest)}
              title={expanded ? s.fewerPrompts : s.morePrompts(rest)}
              className="h-13 w-10 shrink-0 rounded-md border border-dashed border-border bg-muted/20 text-2xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
              onClick={() => {
                track('video_results_prompts_expanded', { enabled: !expanded });
                setExpanded(!expanded);
              }}
            >
              {expanded ? s.less : `+${rest}`}
            </button>
          )}
        </div>
      )}
      {group ? (
        <PromptLine group={group} take={namesTake(groups, group)} s={s} />
      ) : (
        <span className="flex-1" />
      )}
      {children}
    </div>
  );
}

/**
 * A prompt's first frame over its case id, or a text tile while it has no poster. Resting the
 * mouse on it, or focusing it from the keyboard, loops its muted preview over the frame.
 */
function PromptTile({
  prompt,
  caseId,
  label,
  poster,
  preview,
  pressed,
  onPick,
  onPosterError,
}: {
  prompt: string;
  caseId: string;
  /** Seed, take or the diagnostic label; a poster tile shows only what tells it apart. */
  label: string | null;
  poster: string | undefined;
  /** The poster clip's web rendition; fetched only once the tile is hovered. */
  preview: string | undefined;
  pressed: boolean;
  onPick: () => void;
  onPosterError: (url: string) => void;
}) {
  const focus = 'group-focus-visible/tile:ring-2 group-focus-visible/tile:ring-ring';
  const [previewing, setPreviewing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [loadedPoster, setLoadedPoster] = useState<string | undefined>(undefined);
  const image = useRef<HTMLImageElement>(null);
  // A poster cached before hydration loaded before React listened for it.
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setLoadedPoster(poster);
  }, [poster]);
  const start = () => {
    if (preview && !matchMedia('(prefers-reduced-motion: reduce)').matches) setPreviewing(true);
  };
  const stop = () => {
    setPreviewing(false);
    setMoving(false);
  };
  return (
    <button
      type="button"
      data-prompt={prompt}
      aria-pressed={pressed}
      title={caseId}
      className="group/tile flex w-23 shrink-0 flex-col gap-1 text-left outline-none"
      onClick={onPick}
      // A touch would start a download only to pick the prompt.
      onPointerEnter={(event) => event.pointerType === 'mouse' && start()}
      onPointerLeave={stop}
      onFocus={(event) => event.currentTarget.matches(':focus-visible') && start()}
      onBlur={stop}
    >
      {poster ? (
        <>
          <span
            className={cn(
              'relative block aspect-[1344/768] overflow-hidden rounded-md bg-accent',
              loadedPoster !== poster && 'animate-pulse',
              pressed
                ? 'ring-2 ring-foreground'
                : 'ring-1 ring-border-alt group-hover/tile:ring-2 group-hover/tile:ring-muted-foreground',
              focus,
            )}
          >
            <img
              ref={image}
              src={poster}
              alt={caseId}
              data-loaded={loadedPoster === poster}
              onLoad={() => setLoadedPoster(poster)}
              width={TILE}
              height={Math.round((TILE * 768) / 1344)}
              loading="lazy"
              decoding="async"
              className="motion-media absolute inset-0 size-full object-cover"
              onError={() => onPosterError(poster)}
            />
            {previewing && (
              <video
                src={preview}
                muted
                loop
                autoPlay
                playsInline
                aria-hidden="true"
                data-testid="video-results-prompt-preview"
                className={cn(
                  'absolute inset-0 size-full object-cover transition-opacity duration-150',
                  moving ? 'opacity-100' : 'opacity-0',
                )}
                onPlaying={() => setMoving(true)}
                onError={stop}
              />
            )}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'truncate font-mono text-2xs',
              pressed ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {caseId}
          </span>
          {label && <span className="truncate text-3xs text-muted-foreground">{label}</span>}
        </>
      ) : (
        <span
          className={cn(
            'flex aspect-[1344/768] flex-col justify-center gap-0.5 rounded-md border px-2',
            pressed
              ? 'border-foreground bg-muted'
              : 'border-border-alt group-hover/tile:border-muted-foreground',
            focus,
          )}
        >
          <span className="truncate font-mono text-2xs">{caseId}</span>
          <span className="truncate text-2xs text-muted-foreground">{label}</span>
        </span>
      )}
    </button>
  );
}

/** Seed, take and the prompt text, clamped to two lines with a More toggle when it overflows. */
function PromptLine({ group, take, s }: { group: ResultsClipGroup; take: boolean; s: Strings }) {
  const text = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const element = text.current;
    if (!element) return undefined;
    const measure = () => {
      if (!open) setClamped(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    // The row reflows as the strip expands or the window resizes, which moves the clamp.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [group.prompt, open]);
  return (
    <div
      data-testid="video-results-prompt"
      className="flex min-w-0 flex-1 basis-56 items-baseline gap-2 max-[820px]:basis-full"
    >
      <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
        {[`${s.seed} ${group.seed}`, group.scope ? s.diagnostic : take ? s.take(group.take) : null]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <p
        ref={text}
        className={cn(
          'min-w-0 flex-1 text-sm leading-5 break-words text-foreground',
          !open && 'line-clamp-2',
        )}
      >
        {group.prompt}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          className="shrink-0 text-sm text-brand-fill hover:underline"
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

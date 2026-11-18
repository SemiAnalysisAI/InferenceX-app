'use client';

import { ChevronRight } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { InfoHelp } from '@/components/ui/option-info';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { MOBILE_VIEWPORT_QUERY, useIsCoarsePointer } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { cn } from '@/lib/shared/utils';
import {
  compareConfigs,
  configId,
  defaultPairing,
  mayHaveClips,
  officialCounterpart,
  pairedGroup,
  parseStage,
  phonePairing,
  promptKey,
  STAGE_ID,
  STAGE_VIEWS,
  stageOptions,
  stagePointKey,
  stagePrompt,
  setStage,
  stageSubject,
  type StageOption,
  type StagePair,
} from './clip-stage';
import { videoSearch } from './page-search';
import { useStageValue } from './use-stage-value';
import { engineLabel } from './engines';
import { hardwareLabel } from './hardware';
import type { VideoPoint } from './metrics';
import { isLossy, lossyLabel, optimizationsOf } from './optimizations';
import { readPointArtifact } from './point-artifact';
import {
  publishedResultsSide,
  resultsClipGroups,
  resultsClipReference,
  type ResultsClip,
  type ResultsClipGroup,
  type ResultsClipSide,
} from './results-clips';
import { RESULTS_HARDWARE, resultMetadata, type ResultCell } from './results';
import { videoClipSourceKey as sourceKey, type VideoInitialData } from './initial-data';
import QualityMethod from './QualityMethod';
import { cost as dollarsOf, reading as figuresOf } from './format';
import styles from './results.module.css';
import { ScrollFade } from './use-scroll-fade';
import VideoClipReadout from './VideoClipReadout';
import VideoClipStage, { STAGE_FIT_WIDTH, type StageClip } from './VideoClipStage';

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
    webEncode:
      'Playback and Difference use a web encode; PSNR and the media link use the original.',
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
    viewHelpTouch: {
      wipe: 'Drag across the clips to slide the split; tap to play or pause. Tap the handle to lock the split.',
      side: 'Both clips at once; tap to play or pause.',
      toggle: 'Tap the clips to flip between them.',
      diff: 'RGB difference ×4 between the two clips; tap to play or pause.',
    },
    sentence:
      'Same prompt, same seed. {a} takes a median {as} per clip for {ad}; {b} takes {bs} for {bd}.',
    noReference: 'No sealed reference pair for this clip.',
    unpublishedMedia: 'Media is not shown for an unpublished run.',
    reference: 'Official Diffusers reference',
    referenceShort: 'Diffusers reference',
    schedule: (updates: number, sigmas: number) => `${updates} updates · ${sigmas} sigma points`,
    referenceNote:
      'Encoded reference MP4. PSNR compares every decoded RGB pixel and frame; it does not measure semantic quality.',
    metricsHelp: (touch: boolean) =>
      `PSNR uses a sealed Diffusers reference pair and every decoded RGB frame. Speed is the ratio of the two cells’ p50; wall time is this prompt’s request alone. $ per clip is modelled TCO on the participating GPUs from the selected tier and recorded GPU count; ${touch ? 'tap its info button' : 'hover it'} for the cost per video-second, which spreads it over valid decoded output duration, and for the allocated basis. Energy per clip is the selected cell’s mean. Paired scores against the lossless twin are planned; no scorer computes them yet.`,
    gpu: (n: number) => (n === 1 ? '1 GPU' : `${n} GPUs`),
    official: 'official',
    unofficial: 'unofficial run',
    compare: 'compare',
    playingConfig: 'Config that plays',
    pairing: 'Compared with',
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
    webEncode: '播放和“差异”视图使用网页转码版本；PSNR 和视频文件链接仍使用原始视频。',
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
    viewHelpTouch: {
      wipe: '在画面上左右拖动可移动分界线，轻点画面可播放或暂停；轻点分界线按钮可锁定。',
      side: '同时显示两段视频；轻点画面可播放或暂停。',
      toggle: '轻点画面可在两段视频之间切换。',
      diff: '两段视频的 RGB 差异 ×4；轻点画面可播放或暂停。',
    },
    sentence:
      '相同的 prompt 和 seed。{a} 每条视频的延迟中位数为 {as}，成本 {ad}；{b} 为 {bs}，成本 {bd}。',
    noReference: '此视频暂无已封存的参考配对。',
    unpublishedMedia: '未发布的运行不显示视频。',
    reference: '官方 Diffusers 参考',
    referenceShort: 'Diffusers 参考',
    schedule: (updates: number, sigmas: number) => `${updates} 次更新 · ${sigmas} 个 sigma 点`,
    referenceNote: '已编码的参考 MP4。PSNR 对比全部解码 RGB 像素和帧，不衡量语义质量。',
    metricsHelp: (touch: boolean) =>
      `PSNR 使用已封存的 Diffusers 参考配对，比较全部解码 RGB 帧。速度是两个测量单元 p50 之比，出片时间只是当前 prompt 这一次请求的时长。每条视频成本按所选成本档位和记录的 GPU 数量估算参与 GPU 的 TCO；${touch ? '轻点该格的说明按钮' : '悬停该格'}可查看每视频秒成本（按有效输出的实际解码时长分摊）和按分配 GPU 估算的口径。每条视频能耗是所选测量单元的平均值。以无损对照为基准的配对评分仍在计划中，目前还没有评分器计算。`,
    gpu: (n: number) => `${n} 张 GPU`,
    official: '官方',
    unofficial: '非官方运行',
    compare: '对比',
    playingConfig: '播放的配置',
    pairing: '对照对象',
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
  /** Each hardware's official stage opening, which a subject from `unofficialRun` falls back to. */
  officialOpenings?: readonly VideoPoint[];
  /** Hardware color; a side from `unofficialRun` takes the overlay color. */
  colorFor: (key: string) => string;
  /** Modelled TCO of every point by `VideoPoint.id`, for the readout's per-clip cost. */
  costs?: Readonly<Record<string, ResultCell['cost']>>;
  unofficialRun?: string;
  initialSides?: VideoInitialData['sides'];
  /** The chart points the two sides play, for the chart's Playing and Baseline badges. */
  onPairChange?: (pair: StagePair) => void;
  /**
   * `StageOption.value` the reader picked (`r_vs`), or null for the subject's `defaultPairing`;
   * one the subject lacks pairs it by default too. Page state, so the chart can reset it with a new subject.
   */
  against: string | null;
  /** Null for the subject's default pairing, which stays out of a link. */
  onAgainstChange: (value: string | null) => void;
  /** Plays the chart point with this key, as a chart click does. */
  onSubjectChange: (clipKey: string) => void;
  /** Plays a point against a `StageOption.value` in Wipe and asks for a reveal. */
  onShow: (point: VideoPoint, against: string) => void;
  /** Counts reveal requests; each scrolls the stage into view and focuses it once its reads land. */
  reveal: number;
  /** The drawn point the reader rests on in the chart; its clips are read ahead for its hover card. */
  peek?: string | null;
  /** The phone layout: a link that names no pair opens on `phonePairing`. */
  phone?: boolean;
  /** The page's title row, which the phone layout shows at the top of the stage block. */
  titleRow?: ReactNode;
  /** The cohort is still being read; a phone holds the stage block's place. */
  cohortLoading?: boolean;
}

const NO_POINTS: readonly VideoPoint[] = [];
// Under 768 px the section's blocks leave its box (`max-md:contents`) and join the page column,
// where the stage block comes first by CSS order alone. Each block draws the card it left; the
// rest blocks draw one card between them.
const PHONE_CARD = 'max-md:mb-0 max-md:border-border/30 max-md:bg-card max-md:p-4';
/** The title row, stage, transport, Compare row and prompt strip. */
const LEAD_BLOCK = `flex min-w-0 flex-col gap-3 max-md:order-first max-md:rounded-xl max-md:border ${PHONE_CARD}`;
/** The prompt, the view modes and Inspect. */
const REST_TOP_BLOCK = `min-w-0 ${PHONE_CARD} max-md:rounded-t-xl max-md:border max-md:border-b-0 max-md:pb-3`;
/** The readout and the quality method, then the sources; the page column's gap is closed above each. */
const REST_BLOCK = `min-w-0 space-y-3 ${PHONE_CARD} max-md:-mt-4 max-md:border-x max-md:py-0`;
const REST_BOTTOM_BLOCK = `min-w-0 ${PHONE_CARD} max-md:-mt-4 max-md:rounded-b-xl max-md:border max-md:border-t-0 max-md:pt-3`;
/** Whether a read side has a clip the stage can play. */
const playable = (side: ResultsClipSide) =>
  resultsClipGroups([side]).some((group) => [...group.clips.values()].some((clip) => clip.url));
const onRoster = (p: VideoPoint) => RESULTS_HARDWARE.some((key) => p.hardwareKey === key);
/** Strip geometry in px: a 92 px tile, the 40 px "+N" tile and the 8 px gap between them. */
const TILE = 92;
const MORE = 40;
const GAP = 8;
/** The most tiles the collapsed strip shows, so the prompt beside it stays the row's subject. */
const MAX_TILES = 3;
/** How long the pointer rests on a prompt tile before its preview is requested, in ms. */
const PREVIEW_REST_MS = 250;
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
  const saved = await readPointArtifact(point, unofficialRun, signal);
  return saved && publishedResultsSide(saved, point);
}

export default function VideoResultsClips({
  points,
  openings,
  drawn = NO_POINTS,
  deployments = NO_POINTS,
  officialOpenings = NO_POINTS,
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
  phone = false,
  titleRow,
  cohortLoading = false,
}: VideoResultsClipsProps) {
  const locale = useLocale();
  const s = STRINGS[locale];
  /** Where a phone shows Inspect: with the view modes. */
  const [inspectSlot, setInspectSlot] = useState<HTMLElement | null>(null);
  const touch = useIsCoarsePointer();
  const viewHelp = touch ? s.viewHelpTouch : s.viewHelp;
  // Key by key, so the open chart point (`r_sheet`) does not render the clips again.
  const stage = {
    prompt: useStageValue('prompt'),
    view: useStageValue('view'),
    clip: useStageValue('clip'),
    swap: useStageValue('swap'),
  };
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
  /** Whether a pairing candidate has clips: a read side says so, a stored one still being read may. */
  const mayPlay = (p: VideoPoint) => {
    const side = sideOf(p);
    return side === undefined ? mayHaveClips(p) : side !== null && playable(side);
  };
  const ownLead = (p: VideoPoint) =>
    officialCounterpart(p, deployments, officialOpenings, unofficialRun);
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
    // A candidate run is read against production on its own GPU.
    const own = subject ? ownLead(subject.point) : null;
    const options = subject ? stageOptions(subject.point, opening, deployments, own) : [];
    const fallback = subject ? defaultPairing(subject.point, own) : 'reference';
    /** What plays when the link names no pair: `fallback`, or on a phone another GPU. */
    const opened =
      (phone && subject && fallback === 'reference'
        ? phonePairing(subject.point, options, mayPlay)
        : null) ?? fallback;
    const option =
      options.find((item) => item.value === value) ??
      options.find((item) => item.value === opened) ??
      options.find((item) => item.value === fallback) ??
      options[0];
    return { picked, subject, options, option, fallback, opened, other: option?.point ?? null };
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
      officialOpenings,
      stage.clip,
      against,
      phone,
    ],
  );
  const nextReady = ready(next);
  // A phone's opening pair is not the link's default, so the link names it once its clips are
  // read, and a shared link reopens the same two clips on any screen.
  const openedPair =
    against === null &&
    nextReady &&
    next.option?.value === next.opened &&
    next.opened !== next.fallback
      ? next.opened
      : null;
  useEffect(() => {
    if (!openedPair) return;
    // Hydration renders with the server's guess, so the settings and the screen are read here.
    if (parseStage(videoSearch()).vs === null && matchMedia(MOBILE_VIEWPORT_QUERY).matches)
      setStage({ vs: openedPair });
  }, [openedPair]);
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
  /** First frames that loaded or failed; the stage waits for no others. */
  const [settledFrames, setSettledFrames] = useState<ReadonlySet<string>>(new Set());
  /** First frames that loaded, which the stage's idle frame never covers. */
  const [loadedFrames, setLoadedFrames] = useState<ReadonlySet<string>>(new Set());
  /** Kept, so the stage paints a read frame from memory, both sides in one paint. */
  const requestedFrames = useRef(new Map<string, HTMLImageElement>());
  const configs = compareConfigs(opening, drawn, unofficialRun);
  // A switch waits for the next pair's first frames, so every pair one pick away is read ahead:
  // the shown pair for each prompt, and each Compare pick for the shown prompt.
  useEffect(() => {
    if (!nextReady) return;
    const ahead = [
      ...nextFrames,
      ...(next.subject?.groups ?? []).flatMap((item) => framesOf(next, promptKey(item))),
      ...next.options.flatMap((item) => framesOf(pairFor(stage.clip, item.value), stage.prompt)),
      ...configs.flatMap((p) => framesOf(pairFor(stagePointKey(p), null), stage.prompt)),
    ];
    for (const url of ahead) {
      if (requestedFrames.current.has(url)) continue;
      const settle = () => setSettledFrames((previous) => new Set([...previous, url]));
      const image = new Image();
      requestedFrames.current.set(url, image);
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
    }
  }, [next, nextReady, stage.prompt]);
  // The stage and readout keep the last pair, dimmed by `motion-stale` as the inference chart is
  // while it refetches, until the next pair's reads land and its first frames load. A switch so
  // never blanks the stage, collapses the prompt row above it, or shows one side ahead of the other.
  const shownNext = nextReady && nextFrames.every((url) => settledFrames.has(url));
  const [held, setHeld] = useState<Selection | null>(null);
  const switching =
    held !== null &&
    (held.clip !== stage.clip || held.against !== against || held.prompt !== stage.prompt);
  // The first ready pair is on screen as soon as it is read, so it is held at once; only a switch
  // away from a held pair waits for frames.
  if ((nextReady && !held) || (shownNext && switching))
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
      officialOpenings,
    ],
  );
  const holding = heldPair !== null && ready(heldPair);
  const stale = holding && (switching || !nextReady);
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
            return failedPeeks.has(sourceKey(p)) ? [[stagePointKey(p), null, null]] : [];
          const found = side
            ? pairedGroup(resultsClipGroups([side]), group)?.clips.get(side.hardwareKey)
            : undefined;
          return [
            [stagePointKey(p), found?.posterUrl ?? null, found?.previewUrl || found?.url || null],
          ];
        }),
      ),
    [wanted, drawn, revision, failedKeys, failedPeeks, group],
  );
  // Before paint, so the chart's badges and hover card never lag the stage they describe.
  const promptId = group ? caseOf(group) : null;
  const promptSeed = group?.seed ?? null;
  useLayoutEffect(() => {
    const read: [string, string | null, string | null][] = JSON.parse(postersJson);
    onPairChange?.({
      playing,
      baseline,
      posters: Object.fromEntries(read.map(([key, poster]) => [key, poster])),
      media: Object.fromEntries(read.map(([key, , media]) => [key, media])),
      prompt: promptId === null || promptSeed === null ? null : { id: promptId, seed: promptSeed },
    });
  }, [playing, baseline, postersJson, promptId, promptSeed, onPairChange]);
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
  const nextHardware = next.subject?.point.hardwareKey ?? '';
  const active = next.subject && configId(next.subject.point, unofficialRun);
  const configLabel = (p: VideoPoint) =>
    [
      hardwareLabel(p.hardwareKey ?? ''),
      lossyVariant(p),
      !diagnostic && unofficialRun !== undefined && p.runId === unofficialRun ? s.unofficial : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const pickConfig = (p: VideoPoint) => {
    track('video_results_compare_selected', {
      subject: configId(p, unofficialRun),
      pairing: defaultPairing(p, ownLead(p)),
    });
    onSubjectChange(stagePointKey(p));
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
      className="min-w-0 scroll-mt-24 space-y-3 max-md:contents"
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
        <div className={LEAD_BLOCK}>
          {titleRow}
          <ClipsSkeleton />
        </div>
      ) : a && point ? (
        <>
          <PromptRow
            className={REST_TOP_BLOCK}
            groups={groups}
            group={stagePrompt(groups, stage.prompt)}
            s={s}
            onPick={(item, index, poster) => {
              track('video_results_prompt_selected', { index, case: caseOf(item), poster });
              setStage({ prompt: promptKey(item) });
            }}
          >
            <div className="flex shrink-0 items-center gap-1.5 max-[343px]:gap-1">
              <SegmentedToggle
                role="group"
                ariaLabel={s.view}
                value={stage.view}
                size="sm"
                // Four modes and the help button fit the card from a 320 px screen up.
                buttonClassName="max-[400px]:px-1 max-[374px]:text-xs max-[343px]:px-0.5 max-[343px]:tracking-tight"
                options={STAGE_VIEWS.map((mode) => ({
                  value: mode,
                  label: s.views[mode],
                  title: viewHelp[mode],
                  testId: `video-results-view-${mode}`,
                }))}
                onValueChange={(view) => {
                  track('video_results_clips_view', { view });
                  setStage({ view });
                }}
              />
              <InfoHelp
                label={s.label}
                value="clip-metrics"
                triggerTestId="video-results-metrics-help"
                // Clear of the view switcher beside it.
                triggerClassName="[--hit-x:4px]"
              >
                {/* Hover titles never show on touch, so the shown view's gestures lead the help. */}
                {touch && <p>{viewHelp[stage.view]}</p>}
                <p>{diagnostic ? s.diagnosticNote : s.metricsHelp(touch)}</p>
              </InfoHelp>
            </div>
            <div
              ref={setInspectSlot}
              data-testid="video-results-inspect-slot"
              className="flex basis-full flex-col gap-3 empty:hidden md:hidden"
            />
          </PromptRow>
          <div className={LEAD_BLOCK} data-testid="video-results-lead">
            {titleRow}
            {/* Capped like the stage below, so the row starts at the picture's left edge. */}
            <div
              className="mx-auto flex w-full flex-wrap items-center gap-2 max-md:order-1 max-md:flex-nowrap"
              style={{
                maxWidth: stage.view === 'side' ? STAGE_FIT_WIDTH.side : STAGE_FIT_WIDTH.overlay,
              }}
              data-testid="video-results-compare"
            >
              <SegmentedToggle
                variant="select"
                className="max-md:flex-1"
                ariaLabel={s.playingConfig}
                testId="video-results-config"
                value={active ?? ''}
                options={configs.map((p) => ({
                  value: configId(p, unofficialRun),
                  label: configLabel(p),
                }))}
                onValueChange={(value) => {
                  const config = configs.find((p) => configId(p, unofficialRun) === value);
                  if (config) pickConfig(config);
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">{s.compare}</span>
              {next.option && (
                <SegmentedToggle
                  variant="select"
                  className="max-md:flex-1"
                  ariaLabel={s.pairing}
                  testId="video-results-against"
                  value={next.option.value}
                  options={next.options.map((item) => ({
                    value: item.value,
                    label: optionLabel(item),
                  }))}
                  onValueChange={(value) => {
                    const choice = next.options.find((item) => item.value === value);
                    track('video_results_against_selected', {
                      against: choice?.kind,
                      gpu: choice?.point?.hardwareKey ?? null,
                    });
                    // Only the default every screen shares stays out of a link.
                    onAgainstChange(
                      value === next.fallback && next.opened === next.fallback ? null : value,
                    );
                  }}
                />
              )}
            </div>
            <div
              className="motion-stale"
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
                onPreviewError={(url) =>
                  setFailedPreviews((previous) => new Set([...previous, url]))
                }
                loadedFrames={loadedFrames}
                swapped={stage.swap}
                onSwappedChange={(swap) => setStage({ swap })}
                caption={
                  other &&
                  option?.kind === 'hardware' &&
                  !diagnostic && (
                    <StageSentence
                      template={s.sentence}
                      sides={[
                        { ...a, point, cost: costs?.[point.id] },
                        { ...b, point: other, cost: costs?.[other.id] },
                      ]}
                    />
                  )
                }
                inspectSlot={inspectSlot}
              />
            </div>
            {groups.length > 1 && (
              <PromptStrip
                groups={groups}
                group={stagePrompt(groups, stage.prompt)}
                s={s}
                onPick={(item, index, poster) => {
                  track('video_results_prompt_selected', {
                    index,
                    case: caseOf(item),
                    poster,
                    source: 'strip',
                  });
                  setStage({ prompt: promptKey(item) });
                }}
              />
            )}
          </div>
          <div className={REST_BLOCK}>
            <div className="motion-stale" data-stale={stale || undefined}>
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
          </div>
          <details
            data-testid="video-results-sources"
            className={`group/sources text-xs ${REST_BOTTOM_BLOCK}`}
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
            <ScrollFade className="mt-3 overflow-x-auto">
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
            </ScrollFade>
          </details>
        </>
      ) : (
        (titleRow || !loading) && (
          <div className={LEAD_BLOCK}>
            {titleRow}
            {/* The stage block leads a phone's page, so it keeps its height while the cohort loads. */}
            {cohortLoading && <ClipsSkeleton className="md:hidden" />}
            {!loading && (
              <p className={cn('text-sm text-muted-foreground', cohortLoading && 'max-md:hidden')}>
                {s.noPair}
              </p>
            )}
          </div>
        )
      )}
    </section>
  );
}

const STRONG = 'font-semibold whitespace-nowrap';

/**
 * A phone's one sentence under the stage: each deployment's median latency and modelled cost per
 * clip of this workload, not the time of the clip on screen. Nothing unless both sides have both.
 */
function StageSentence({
  template,
  sides,
}: {
  template: string;
  sides: readonly (StageClip & { point: VideoPoint; cost?: ResultCell['cost'] })[];
}) {
  const slots: Record<string, ReactNode> = {};
  for (const [index, side] of sides.entries()) {
    const key = 'ab'[index];
    const seconds = figuresOf(side.point.p50);
    const dollars = dollarsOf(side.cost?.participating?.perVideo);
    if (seconds === null || dollars === null) return null;
    const gpus = side.point.participating;
    slots[key] = (
      <>
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block size-2 rounded-full align-middle"
          style={{ background: side.color ?? undefined }}
        />
        <b className={STRONG}>{gpus === null ? side.label : `${side.label} ×${gpus}`}</b>
      </>
    );
    slots[`${key}s`] = <b className={STRONG}>{`${seconds} s`}</b>;
    slots[`${key}d`] = <b className={STRONG}>{dollars}</b>;
  }
  return (
    <p
      data-testid="video-results-sentence"
      className={cn(styles.stageSentence, 'text-sm leading-6 text-foreground md:hidden')}
    >
      {template.split(/\{(?<slot>\w+)\}/u).map((part, index) => (
        <Fragment key={index}>{index % 2 ? slots[part] : part}</Fragment>
      ))}
    </p>
  );
}

/** The prompt row, stage and transport, held in place until the first pair's reads land. */
function ClipsSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('space-y-3', className)}
      data-testid="video-results-clips-skeleton"
    >
      <div className="flex items-start gap-2 max-md:hidden">
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
        {/* A phone's block also holds the sentence, the Compare row and the prompt strip. */}
        <Skeleton className="h-18 w-full md:hidden" />
        <Skeleton className="h-8 w-full max-md:h-11" />
        <Skeleton className="h-11 w-full md:hidden" />
        <Skeleton className="h-19 w-full md:hidden" />
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
  className,
  children,
}: {
  groups: readonly ResultsClipGroup[];
  group: ResultsClipGroup | null;
  s: Strings;
  onPick: (group: ResultsClipGroup, index: number, poster: boolean) => void;
  className: string;
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
  return (
    <div
      ref={row}
      data-testid="video-results-prompt-row"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}
    >
      {groups.length > 1 && (
        <div
          role="group"
          aria-label={s.prompts}
          data-testid="video-results-prompts"
          className={cn(
            // The padding keeps the selected tile's ring inside the clip. A phone picks prompts
            // from the strip under the stage, which shows them all.
            '-m-0.5 flex min-w-0 items-start gap-2 p-0.5 max-md:hidden',
            expanded ? 'basis-full flex-wrap' : 'overflow-hidden max-[820px]:basis-full',
          )}
        >
          <PromptTiles
            items={shown}
            groups={groups}
            group={group}
            s={s}
            failedPosters={failedPosters}
            onPosterError={(url) => setFailedPosters((previous) => new Set([...previous, url]))}
            onPick={onPick}
          />
          {(rest > 0 || expanded) && (
            <button
              type="button"
              data-testid="video-results-prompts-more"
              aria-expanded={expanded}
              aria-label={expanded ? s.fewerPrompts : s.morePrompts(rest)}
              title={expanded ? s.fewerPrompts : s.morePrompts(rest)}
              className={cn(
                styles.hit,
                'relative h-13 w-10 shrink-0 rounded-md border border-dashed border-border bg-muted/20 text-2xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground',
              )}
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

/** The tiles of `items`, for the prompt row or the phone strip. */
function PromptTiles({
  items,
  groups,
  group,
  s,
  failedPosters,
  onPosterError,
  onPick,
  strip = false,
}: {
  items: readonly ResultsClipGroup[];
  groups: readonly ResultsClipGroup[];
  group: ResultsClipGroup | null;
  s: Strings;
  /** Posters that failed to load; their tiles fall back to the next poster, then to text. */
  failedPosters: ReadonlySet<string>;
  onPosterError: (url: string) => void;
  onPick: (group: ResultsClipGroup, index: number, poster: boolean) => void;
  strip?: boolean;
}) {
  return items.map((item) => {
    // The clip whose first frame a tile shows: the reference's, else the first clip's.
    const face = [resultsClipReference(item, NO_HIDDEN), [...item.clips.values()][0]].find(
      (clip) => clip?.posterUrl && !failedPosters.has(clip.posterUrl),
    );
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
        strip={strip}
        onPick={() => onPick(item, groups.indexOf(item), Boolean(poster))}
        onPosterError={onPosterError}
      />
    );
  });
}

/**
 * A phone's prompt picker under the stage: every prompt's tile in one row that scrolls sideways
 * and snaps, the next tile cut by the card's edge. A sideways swipe scrolls the row and an
 * upright one the page; a tap picks the prompt as a tile in the prompt row does.
 */
function PromptStrip({
  groups,
  group,
  s,
  onPick,
}: {
  groups: readonly ResultsClipGroup[];
  group: ResultsClipGroup | null;
  s: Strings;
  onPick: (group: ResultsClipGroup, index: number, poster: boolean) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [failedPosters, setFailedPosters] = useState<ReadonlySet<string>>(new Set());
  const shown = group?.key;
  // The shown prompt's tile stays in view; only the row scrolls, never the page.
  useLayoutEffect(() => {
    const row = strip.current;
    const tile = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !tile || row.clientWidth === 0) return;
    const box = row.getBoundingClientRect();
    const at = tile.getBoundingClientRect();
    if (at.left < box.left || at.right > box.right) row.scrollLeft += at.left - box.left - 16;
  }, [shown]);
  return (
    <div
      ref={strip}
      role="group"
      aria-label={s.prompts}
      data-testid="video-results-prompt-strip"
      // The row bleeds to the card's edges, so a cut tile shows there is more to swipe to.
      className="-mx-4 flex snap-x scroll-px-4 items-start gap-2 overflow-x-auto overscroll-x-contain px-4 py-0.5 [scrollbar-width:none] max-md:order-2 md:hidden [&::-webkit-scrollbar]:hidden"
    >
      <PromptTiles
        items={groups}
        groups={groups}
        group={group}
        s={s}
        failedPosters={failedPosters}
        onPosterError={(url) => setFailedPosters((previous) => new Set([...previous, url]))}
        onPick={onPick}
        strip
      />
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
  strip = false,
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
  /** A tile of the phone strip, which the prompt row's own tiles must not be mistaken for. */
  strip?: boolean;
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
  // The preview is a whole clip, so it waits for the pointer to rest: a move that ends in a click
  // would fetch it beside the clips that click has the stage load, the same clip among them.
  const rest = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stop = () => {
    clearTimeout(rest.current);
    setPreviewing(false);
    setMoving(false);
  };
  const start = () => {
    if (!preview || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Hover and focus can both start it; one rest runs at a time.
    clearTimeout(rest.current);
    rest.current = setTimeout(() => setPreviewing(true), PREVIEW_REST_MS);
  };
  useEffect(() => () => clearTimeout(rest.current), []);
  return (
    <button
      type="button"
      {...{ [strip ? 'data-strip-prompt' : 'data-prompt']: prompt }}
      aria-pressed={pressed}
      title={caseId}
      className={cn(
        'group/tile flex w-23 shrink-0 flex-col gap-1 text-left outline-none',
        strip && 'snap-start',
      )}
      onClick={() => {
        stop();
        onPick();
      }}
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

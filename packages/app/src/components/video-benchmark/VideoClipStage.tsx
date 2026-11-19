'use client';

import {
  ArrowLeftRight,
  Lock,
  MoveHorizontal,
  Play,
  Repeat,
  ScanSearch,
  StepBack,
  StepForward,
  Volume2,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { InfoHelp } from '@/components/ui/option-info';
import { saveDataRequested } from '@/components/ui/pointer-intent';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { useIsCoarsePointer, useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { clipGroupActive, frameAt, frameClock } from './clip-sync';
import { STAGE_ID, type StageView } from './clip-stage';
import { useClipGroup } from './use-clip-group';
import { useFirstFrame } from './use-first-frame';
import styles from './results.module.css';

const STRINGS = {
  en: {
    stage: (a: string, b: string) => `${a} against ${b}`,
    lock: 'Lock split',
    unlock: 'Unlock split',
    listen: (name: string) => `Listen to ${name}`,
    unofficial: 'Unofficial run',
    shown: 'Shown clip',
    mediaError: 'This clip could not be played.',
    retry: 'Retry',
    needsBoth: 'Both sides need a clip.',
    differenceUnavailable:
      'Difference unavailable: frames must have matching geometry and permit cross-origin pixel reads.',
    differenceLabel: 'RGB difference ×4 · preview',
    differenceNote:
      'Absolute RGB difference ×4 between the two clips at the same playback time, from their web encodes where they exist. This browser preview is separate from the all-frame PSNR measurement, which uses the originals.',
    play: 'Play',
    pause: 'Pause',
    playBoth: 'Play both clips',
    scrub: 'Scrub both clips',
    buffering: (percent: number) => `Buffering ${percent}%`,
    downloading: (percent: number) => `Loading ${percent}%`,
    seconds: 's',
    swap: 'Swap sides',
    inspect: 'Inspect',
    previousFrame: 'Previous frame',
    nextFrame: 'Next frame',
    previousFrameTitle: 'Previous frame (←)',
    nextFrameTitle: 'Next frame (→)',
    frame: (n: number, total: number) => `frame ${n} / ${total}`,
    speed: 'Speed',
    zoom: 'Zoom',
    loop: 'Loop',
    panHint: (touch: boolean) => `Drag to pan · ${touch ? '1×' : 'Esc'} resets`,
  },
  zh: {
    stage: (a: string, b: string) => `${a} 对比 ${b}`,
    lock: '锁定分界线',
    unlock: '解锁分界线',
    listen: (name: string) => `收听 ${name}`,
    unofficial: '非官方运行',
    shown: '当前显示的视频',
    mediaError: '此视频无法播放。',
    retry: '重试',
    needsBoth: '两侧都需要有视频。',
    differenceUnavailable: '无法显示差异：帧尺寸必须一致，且视频需允许跨域像素读取。',
    differenceLabel: 'RGB 差异 ×4 · 预览',
    differenceNote:
      '两段视频在相同播放时刻的 RGB 绝对差异，放大 4 倍；有网页转码版本时基于转码版本计算。此为浏览器预览，与基于原始视频的全帧 PSNR 测量相互独立。',
    play: '播放',
    pause: '暂停',
    playBoth: '同时播放两段视频',
    scrub: '同步拖动两段视频',
    buffering: (percent: number) => `缓冲中 ${percent}%`,
    downloading: (percent: number) => `加载中 ${percent}%`,
    seconds: 's',
    swap: '互换两侧',
    inspect: '检查',
    previousFrame: '上一帧',
    nextFrame: '下一帧',
    previousFrameTitle: '上一帧（←）',
    nextFrameTitle: '下一帧（→）',
    frame: (n: number, total: number) => `第 ${n} / ${total} 帧`,
    speed: '播放速度',
    zoom: '缩放',
    loop: '循环播放',
    panHint: (touch: boolean) => `拖动画面平移 · ${touch ? '选 1×' : '按 Esc'} 复位`,
  },
};

/** One side of the stage. */
export interface StageClip {
  /** Audio identity that survives a prompt switch: the side's point id, or `reference`. */
  source: string;
  /** Hardware key or `reference`; analytics and test hooks. */
  id: string;
  label: string;
  /** Serving engine, which the pill names after the hardware. */
  engine?: string;
  meta: string;
  /** Pill dot; null draws the reference's outlined dot. */
  color: string | null;
  /** Sealed original, played when the side has no web rendition; empty when no media is shown. */
  url: string;
  /** Lighter web rendition of `url`, which every view plays, Difference included. */
  previewUrl?: string;
  /** First frame of `url`, shown before Play; loading it requests no clip media. */
  posterUrl?: string;
  /** Why the side shows no clip while `url` is empty. */
  empty: string;
  unofficial?: boolean;
}

/** A side's color dot; the reference has no color, so its dot is outlined. */
export function SideDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={color ? { background: color } : { border: '1.5px solid currentColor' }}
    />
  );
}

export interface VideoClipStageProps {
  /** The focusable stage, which takes the Space and T shortcuts. */
  ref?: Ref<HTMLDivElement>;
  /** Subject, on the right (or bottom). */
  a: StageClip;
  /** Its pair, the baseline, on the left (or top). */
  b: StageClip;
  view: StageView;
  /** Changes with the prompt or the compared sources; pauses the clips. */
  selection: string;
  /** Prompt text on the idle frame, which replaces the posters' split before the first Play. */
  prompt?: string;
  /** Frame rate both sides were generated at; null disables frame stepping. */
  fps: number | null;
  /** Recorded frame count of the generated clips, when known. */
  frames: number | null;
  /** A side's web rendition failed to load; the caller drops it so the side plays the original. */
  onPreviewError: (previewUrl: string) => void;
  /** First frames the caller already loaded, so a swap to them never paints the idle frame. */
  loadedFrames?: ReadonlySet<string>;
  /** Clips one pick away, whose starts are read ahead once the shown pair has loaded in full. */
  ahead?: readonly string[];
  /** Exchanges the sides' places on the stage; the subject and its pair keep their roles. */
  swapped: boolean;
  onSwappedChange: (swapped: boolean) => void;
  /** A line between the picture and the transport. */
  caption?: ReactNode;
  /**
   * Where a phone shows Inspect, toggle and drawer, in place of the transport row. Null until
   * that element mounts; undefined keeps Inspect in the transport row at every width.
   */
  inspectSlot?: HTMLElement | null;
}

type Role = 'a' | 'b';
const ROLES = ['a', 'b'] as const;
const OTHER = { a: 'b', b: 'a' } as const;
/** Playback-time gap beyond which a Difference frame would compare different moments. */
const DIFFERENCE_SYNC_SECONDS = 0.12;
/** How many times the Difference picture adds the frames' difference up, as `absoluteFrameDifference` multiplies it. */
const DIFFERENCE_GAIN = 4;
/** After its frames last moved, a Difference picture is drawn at the full rate this long, then once per still period, in ms. */
const DIFFERENCE_SETTLE_MS = 500;
const DIFFERENCE_STILL_MS = 1000;
/** How far into the clips, in seconds, their first frames still stand for them. */
const FIRST_FRAME_SECONDS = 0.25;
const SPLIT_STEP = 5;
/** How far a finger travels sideways, in px, before its press is a wipe drag and not a tap. */
const WIPE_SLOP = 6;
// The Compare row, stage, transport and readout fit under the sticky header together: a picture is at
// most the window's height less 18rem, and the block narrows to match, one 16:9 frame wide or two
// side by side.
// A phone on its side lowers the reserve (`--stage-reserve` in results.module.css).
export const STAGE_FIT_WIDTH = {
  overlay: 'max(20rem, calc((100dvh - var(--stage-reserve, 18rem)) * 16 / 9))',
  side: 'max(20rem, calc((100dvh - var(--stage-reserve, 18rem)) * 32 / 9 + 0.75rem))',
};
/** The start of a clip read ahead: its header, its one keyframe and about the first second. */
const AHEAD_RANGE = 'bytes=0-262143';
const SPEEDS = [0.25, 0.5, 1] as const;
const ZOOMS = [1, 2, 4] as const;

/** Renders `children` in `slot` when there is one, else in place; nothing while `show` is false. */
function InSlot({
  slot,
  show = true,
  children,
}: {
  slot: HTMLElement | null;
  show?: boolean;
  children: ReactNode;
}) {
  return show ? (slot ? createPortal(children, slot) : children) : null;
}

export default function VideoClipStage({
  ref,
  a,
  b,
  view,
  selection,
  prompt,
  fps,
  frames,
  onPreviewError,
  loadedFrames,
  ahead = [],
  swapped,
  onSwappedChange,
  caption,
  inspectSlot,
}: VideoClipStageProps) {
  const s = STRINGS[useLocale()];
  const clips = { a, b };
  const latest = useRef(clips);
  latest.current = clips;
  /** Media stays unrequested until the first Play. */
  const [armed, setArmed] = useState(false);
  /** Sealed URLs that failed to play. */
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [audio, setAudio] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const [locked, setLocked] = useState(false);
  const [toggled, setToggled] = useState<Role>('a');
  const [peek, setPeek] = useState(false);
  const [differenceFailed, setDifferenceFailed] = useState(false);
  const [playback, setPlayback] = useState({ speed: 1, loop: true });
  const [inspect, setInspect] = useState(false);
  /** One zoom and pan, in percent of a side, applied to both sides and the Difference canvas. */
  const [lens, setLens] = useState({ zoom: 1, x: 0, y: 0 });
  /** First frames that have loaded; a poster that fails never counts as a picture to split. */
  const [loadedPosters, setLoadedPosters] = useState<ReadonlySet<string>>(new Set());
  // Before paint: a frame already loaded is complete as soon as its source is set, so a swap to
  // frames the clips layer loaded never paints the idle overlay over them.
  useLayoutEffect(() => {
    const loaded = (url: string) =>
      setLoadedPosters((previous) => (previous.has(url) ? previous : new Set([...previous, url])));
    const images = [a.posterUrl, b.posterUrl].flatMap((url) => {
      if (!url) return [];
      const image = new Image();
      image.addEventListener('load', () => loaded(url));
      image.src = url;
      if (image.complete && image.naturalWidth > 0) loaded(url);
      return [image];
    });
    return () => images.forEach((image) => image.removeAttribute('src'));
  }, [a.posterUrl, b.posterUrl]);
  /**
   * One pan gesture. `from` is the lens it started on while the pointer is held; `moved` outlives
   * the release, so the click that ends a pan is not a lock or flip.
   */
  const drag = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    from: typeof lens | null;
    moved: boolean;
  }>(null);
  // A finger cannot hover, so on a touch screen the split follows a press dragged sideways.
  // `moved` outlives the release, so the click that ends a drag does nothing.
  const touch = useIsCoarsePointer();
  /** A phone shows Inspect, toggle and drawer, in the caller's slot. */
  const slot = (useIsMobileViewport() && inspectSlot) || null;
  const wipe = useRef<{ id: number; x: number; moved: boolean }>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pendingSplit = useRef<number | null>(null);
  const splitFrame = useRef(0);
  const inspectId = useId();

  const playable = ROLES.filter((role) => clips[role].url && !errors.has(clips[role].url));
  const audible = playable.find((role) => clips[role].source === audio) ?? null;
  const group = useClipGroup(
    playable,
    audible,
    selection,
    (rejected) =>
      setErrors(
        (previous) =>
          new Set([...previous, ...rejected.map((role) => latest.current[role as Role].url)]),
      ),
    playback,
  );
  const { videos, phase, time, buffered, ready, duration } = group;
  const both = playable.length === 2;
  const shown: Role = peek ? OTHER[toggled] : toggled;
  const overlay = view !== 'side';
  // Two sealed originals stream at about 15 Mbit/s each, more than a phone link carries, so
  // Difference plays the renditions too; their difference is within 0.1 dB PSNR of the originals'.
  const src = { a: a.previewUrl || a.url, b: b.previewUrl || b.url };
  const firstFrame = {
    a: useFirstFrame(() => videos.current.get('a'), a.url ? src.a : undefined),
    b: useFirstFrame(() => videos.current.get('b'), b.url ? src.b : undefined),
  };
  const posterLoaded = (url = '') => loadedPosters.has(url) || Boolean(loadedFrames?.has(url));
  // At the start of the clips, each side's first frame covers its video until every side has
  // drawn a frame of its own, so the sides appear together and the stage is never empty.
  const covered = time <= FIRST_FRAME_SECONDS && playable.some((role) => !firstFrame[role]);
  /**
   * Before the first Play, the idle frame replaces the split until there is a picture to split:
   * both sides' loaded posters in a view that shows them (Difference hides them behind its
   * canvas), or else the clips themselves.
   */
  const postersShown =
    both && view !== 'diff' && playable.every((role) => posterLoaded(clips[role].posterUrl));
  const idle = !armed && playable.length > 0 && !postersShown;
  /** While idle the split stays hidden, so it neither follows the pointer nor locks. */
  const wiping = view === 'wipe' && !idle;
  /** The baseline sits on the left and the subject on the right until Swap. */
  const onLeft = (role: Role) => (role === 'b') !== swapped;
  const clock = frameClock(duration, fps, frames);
  const lensStyle =
    lens.zoom > 1
      ? { transform: `scale(${lens.zoom}) translate(${lens.x}%, ${lens.y}%)` }
      : undefined;

  // A hidden or failed audio source restores mute; a prompt switch keeps the same source.
  useLayoutEffect(() => {
    if (audio !== null && audible === null) setAudio(null);
  }, [audio, audible]);

  useEffect(() => {
    setDifferenceFailed(false);
    setPeek(false);
  }, [selection, view]);

  useEffect(() => () => cancelAnimationFrame(splitFrame.current), []);

  // Changing a side's source (rendition fallback) reloads it at 0. Before metadata,
  // currentTime sets the start position, so it resumes at the time of a side that kept its source,
  // or at the group time when both sources changed. A new selection starts its clips at 0.
  const shownTime = useRef(0);
  shownTime.current = time;
  const resumed = useRef(selection);
  useLayoutEffect(() => {
    if (resumed.current !== selection) {
      resumed.current = selection;
      return;
    }
    const anchor = [...videos.current.values()].find((video) => video.readyState > 0);
    const resumeAt = anchor ? anchor.currentTime : shownTime.current;
    for (const video of videos.current.values())
      if (video.readyState === 0) video.currentTime = resumeAt;
  }, [selection, src.a, src.b]);

  useEffect(() => {
    if (view !== 'diff' || !both) return undefined;
    let frame = 0;
    let lastDraw = -Infinity;
    /** The playback times last seen and when they last moved. */
    let seen: { subject: number; pair: number; on: HTMLCanvasElement | null; moved: number } = {
      subject: NaN,
      pair: NaN,
      on: null,
      moved: -Infinity,
    };
    let painted = -Infinity;
    /** Whether this pair's pixels have been read once, which a cross-origin frame refuses. */
    let readable = false;
    /** Holds |pair − subject| off screen; the stage's canvas is only ever drawn from it. */
    const scratch = document.createElement('canvas');
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 100) return;
      lastDraw = now;
      const subject = videos.current.get('a'),
        pair = videos.current.get('b'),
        target = canvas.current;
      if (!subject || !pair || !target || subject.readyState < 2 || pair.readyState < 2) return;
      if (pair.videoWidth === 0) return;
      if (subject.videoWidth !== pair.videoWidth || subject.videoHeight !== pair.videoHeight) {
        setDifferenceFailed(true);
        return;
      }
      if (Math.abs(subject.currentTime - pair.currentTime) > DIFFERENCE_SYNC_SECONDS) return;
      // A browser can show a sought frame a little after the seek ends, so the picture is drawn at
      // the full rate for a moment after the times last moved, then once a second.
      if (subject.seeking || pair.seeking) return;
      if (
        target !== seen.on ||
        subject.currentTime !== seen.subject ||
        pair.currentTime !== seen.pair
      )
        seen = { subject: subject.currentTime, pair: pair.currentTime, on: target, moved: now };
      if (now - seen.moved > DIFFERENCE_SETTLE_MS && now - painted < DIFFERENCE_STILL_MS) return;
      const output = target.getContext('2d');
      const work = scratch.getContext('2d');
      if (!output || !work) return;
      for (const surface of [scratch, target])
        if (surface.width !== pair.videoWidth || surface.height !== pair.videoHeight) {
          surface.width = pair.videoWidth;
          surface.height = pair.videoHeight;
        }
      try {
        // The canvases blend the frames, which is `absoluteFrameDifference` without reading two
        // frames into script: |pair − subject| off screen, then added up four times on the stage.
        work.globalCompositeOperation = 'copy';
        work.drawImage(pair, 0, 0);
        work.globalCompositeOperation = 'difference';
        work.drawImage(subject, 0, 0);
        if (!readable) {
          // Read off screen, so frames the page may not read never reach the stage.
          work.getImageData(0, 0, 1, 1);
          readable = true;
        }
        output.globalCompositeOperation = 'copy';
        output.drawImage(scratch, 0, 0);
        output.globalCompositeOperation = 'lighter';
        for (let layer = 1; layer < DIFFERENCE_GAIN; layer += 1) output.drawImage(scratch, 0, 0);
        painted = now;
      } catch {
        setDifferenceFailed(true);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [view, both, src.a, src.b]);

  // A pair is fully buffered only after the first Play, so nothing is read ahead before it, nor
  // beside clips still loading. The starts go into the HTTP cache, where a switch to them finds
  // its first frames. A touch device or a Save-Data reader fetches only what it asks for.
  const requestedAhead = useRef(new Set<string>());
  const aheadKey = ahead.join('\n');
  useEffect(() => {
    if (buffered < 1 || touch || saveDataRequested()) return;
    for (const url of aheadKey.split('\n')) {
      if (!url || requestedAhead.current.has(url)) continue;
      requestedAhead.current.add(url);
      void fetch(url, { headers: { Range: AHEAD_RANGE } })
        .then((response) => response.arrayBuffer())
        .catch(() => {});
    }
  }, [buffered, touch, aheadKey]);

  const active = clipGroupActive(phase);
  const togglePlay = () => {
    if (!armed) {
      setArmed(true);
      // Inside the gesture, so browsers that fetch only on a gesture start now.
      for (const video of videos.current.values()) video.preload = 'auto';
    }
    track(group.toggle() ? 'video_results_clips_play' : 'video_results_clips_pause');
  };
  const listen = (role: Role) => {
    const clip = clips[role];
    const next = audible === role ? null : clip.source;
    setAudio(next);
    track('video_results_audio_changed', { enabled: next !== null, source: clip.id });
    const video = videos.current.get(role);
    if (!next || !video) return;
    video.muted = false;
    if (phase === 'playing')
      void video.play().catch(() => {
        video.muted = true;
        setAudio((current) => (current === next ? null : current));
      });
  };
  const flip = (source: 'key' | 'click') => {
    setToggled((current) => OTHER[current]);
    track('video_results_toggle_flipped', { source });
  };
  const lock = (enabled: boolean) => {
    setLocked(enabled);
    track('video_results_wipe_locked', { enabled });
  };
  /** A held arrow key repeats the step about 30 times a second; only its first press is tracked. */
  const stepFrame = (delta: -1 | 1, repeat = false) => {
    if (!clock) return;
    setDifferenceFailed(false);
    group.stepFrames(delta, clock);
    if (!repeat) track('video_results_frame_step', { direction: delta < 0 ? 'previous' : 'next' });
  };
  const release = () => {
    if (drag.current) drag.current.from = null;
  };
  const zoomTo = (zoom: number) => {
    // A drag still held would otherwise restore its starting zoom on the next move.
    release();
    setLens({ zoom, x: 0, y: 0 });
    track('video_results_zoom_changed', { zoom });
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    wipe.current = null;
    const onPicture = event.target === event.currentTarget;
    if (
      touch &&
      wiping &&
      !locked &&
      lens.zoom === 1 &&
      (onPicture || handle.current?.contains(event.target as Node))
    )
      wipe.current = { id: event.pointerId, x: event.clientX, moved: false };
    // Only the picture pans; a press on a pill or control keeps its own action.
    if (lens.zoom === 1 || !onPicture) return;
    // Pan is a share of one side, which is the whole stage except in Side by side.
    const side = event.currentTarget.querySelector('[data-side]')?.getBoundingClientRect();
    if (!side || side.width === 0 || side.height === 0) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      width: side.width,
      height: side.height,
      from: lens,
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const from = start?.from;
    if (start && from) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
      // Keeps the scaled side covering the stage: at 2× it may shift by a quarter of its width.
      const limit = ((from.zoom - 1) / (2 * from.zoom)) * 100;
      const pan = (offset: number, delta: number, size: number) =>
        Math.min(limit, Math.max(-limit, offset + (delta / size) * (100 / from.zoom)));
      setLens({
        zoom: from.zoom,
        x: pan(from.x, dx, start.width),
        y: pan(from.y, dy, start.height),
      });
      return;
    }
    if (!wiping || locked) return;
    if (touch) {
      const press = wipe.current;
      if (press?.id !== event.pointerId) return;
      if (!press.moved) {
        if (Math.abs(event.clientX - press.x) <= WIPE_SLOP) return;
        press.moved = true;
        // The drag keeps the split after the finger leaves the picture.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    pendingSplit.current = Math.min(
      100,
      Math.max(0, ((event.clientX - rect.left) / rect.width) * 100),
    );
    splitFrame.current ||= requestAnimationFrame(() => {
      splitFrame.current = 0;
      if (pendingSplit.current !== null) setSplit(pendingSplit.current);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Space and Enter keep activating the stage's own buttons.
    if (event.target !== event.currentTarget && (event.key === ' ' || event.key === 'Enter'))
      return;
    if (event.key === ' ') {
      event.preventDefault();
      if (view !== 'toggle') togglePlay();
      else if (!event.repeat && !peek) {
        setPeek(true);
        track('video_results_peek');
      }
    } else if (event.key.toLowerCase() === 't' && view === 'toggle') {
      event.preventDefault();
      flip('key');
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && clock) {
      event.preventDefault();
      stepFrame(event.key === 'ArrowLeft' ? -1 : 1, event.repeat);
    } else if (event.key === 'Escape' && (locked || lens.zoom > 1)) {
      event.preventDefault();
      if (locked) lock(false);
      if (lens.zoom > 1) zoomTo(1);
    }
  };

  /** Middle of the part of the stage a side shows, for its empty-state text. */
  const centerOf = (role: Role) =>
    view === 'wipe' ? (onLeft(role) ? split / 2 : split + (100 - split) / 2) : 50;
  // Named only while the group waits for data: a paused clip may load nothing.
  const progress = ready
    ? null
    : phase === 'buffering'
      ? s.buffering
      : phase === 'loading'
        ? s.downloading
        : null;

  const idleFrame = (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6">
      <button
        type="button"
        data-testid="video-results-start"
        aria-label={s.playBoth}
        className="pointer-events-auto grid size-12 place-items-center rounded-full bg-white text-black shadow-lg hover:bg-white/90"
        onClick={togglePlay}
      >
        <Play aria-hidden="true" className="ml-0.5 size-5 fill-current" />
      </button>
      {prompt && (
        <p className="line-clamp-2 max-w-md text-center text-xs text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
          {prompt}
        </p>
      )}
    </div>
  );

  return (
    <div
      id={STAGE_ID}
      className={cn(styles.stageColumn, 'mx-auto w-full min-w-0 scroll-mt-24 space-y-3')}
      style={{ maxWidth: overlay ? STAGE_FIT_WIDTH.overlay : STAGE_FIT_WIDTH.side }}
    >
      <div
        ref={ref}
        data-testid="video-results-stage"
        data-view={view}
        tabIndex={0}
        role="group"
        aria-label={s.stage(a.label, b.label)}
        className={cn(
          'relative isolate touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          overlay
            ? 'aspect-video w-full overflow-hidden rounded-lg bg-black'
            : 'grid gap-3 min-[640px]:grid-cols-2',
          wiping && !locked && 'cursor-ew-resize',
          lens.zoom > 1 && 'cursor-grab touch-none',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onClick={(event) => {
          // Picture layers pass the pointer through, so only a click on the picture targets the
          // stage itself; pills and controls keep theirs.
          if (event.target !== event.currentTarget) return;
          if (drag.current?.moved || wipe.current?.moved) {
            drag.current = null;
            wipe.current = null;
            return;
          }
          if (view === 'toggle') flip('click');
          // A tap cannot lock a split it never moved, so it plays or pauses; the handle still locks.
          else if (touch) {
            if (playable.length > 0) togglePlay();
          } else if (wiping) lock(!locked);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === ' ') setPeek(false);
        }}
        onBlur={() => setPeek(false)}
      >
        {ROLES.map((role) => {
          const clip = clips[role];
          const failed = clip.url !== '' && errors.has(clip.url);
          const hidden = view === 'diff' || (view === 'toggle' && shown !== role);
          return (
            <div
              key={role}
              data-testid="video-results-clip"
              data-side={role}
              data-hardware={clip.id}
              className={cn(
                'pointer-events-none',
                overlay ? 'absolute inset-0' : 'relative aspect-video overflow-hidden rounded-lg',
                // CSS order, not DOM order: moving a playing video element pauses it.
                !overlay && (onLeft(role) ? 'order-1' : 'order-2'),
              )}
            >
              <div
                className={cn('absolute inset-0 bg-black', hidden && 'invisible')}
                style={
                  view === 'wipe' && role === 'b'
                    ? {
                        clipPath: onLeft(role)
                          ? `inset(0 ${100 - split}% 0 0)`
                          : `inset(0 0 0 ${split}%)`,
                      }
                    : undefined
                }
              >
                {clip.url && (
                  <video
                    ref={group.register(role)}
                    src={src[role]}
                    poster={clip.posterUrl}
                    crossOrigin="anonymous"
                    muted
                    playsInline
                    preload={armed ? 'auto' : 'none'}
                    aria-label={clip.label}
                    className={cn('size-full object-contain', failed && 'invisible')}
                    style={lensStyle}
                    onProgress={group.refresh}
                    onCanPlayThrough={group.refresh}
                    onLoadedMetadata={group.measure(role)}
                    onDurationChange={group.measure(role)}
                    onError={(event) => {
                      const preview = clip.previewUrl;
                      if (preview && event.currentTarget.currentSrc === preview)
                        onPreviewError(preview);
                      else setErrors((previous) => new Set([...previous, clip.url]));
                    }}
                  />
                )}
                {clip.url && !failed && covered && posterLoaded(clip.posterUrl) && (
                  <img
                    data-testid="video-results-first-frame"
                    src={clip.posterUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 size-full object-contain"
                    style={lensStyle}
                  />
                )}
                {(!clip.url || failed) && (
                  <div
                    data-testid="video-results-media-empty"
                    className="absolute inset-y-0 flex w-3/5 -translate-x-1/2 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-white/70"
                    style={{ left: `${centerOf(role)}%` }}
                  >
                    <span>{failed ? s.mediaError : clip.empty}</span>
                    {failed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="pointer-events-auto border-white/30 bg-transparent text-white hover:bg-white/10"
                        onClick={() => {
                          track('video_results_clips_retry', { source: clip.id });
                          setErrors((previous) => {
                            const next = new Set(previous);
                            next.delete(clip.url);
                            return next;
                          });
                          videos.current.get(role)?.load();
                        }}
                      >
                        {s.retry}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div
                data-testid="video-results-pill"
                className={cn(
                  'pointer-events-auto absolute top-2 z-10 flex items-center gap-1.5 rounded-md bg-black/70 py-1 pr-1 pl-2 text-xs text-white',
                  onLeft(role) ? 'left-2' : 'right-2',
                  overlay ? 'max-w-[46%]' : 'max-w-[calc(100%-1rem)]',
                  audible === role && 'ring-2 ring-primary',
                  view === 'toggle' && shown !== role && 'opacity-45',
                  !playable.includes(role) && 'pr-2',
                )}
              >
                <SideDot color={clip.color} />
                <b className="min-w-0 truncate font-semibold">
                  {clip.label}
                  {clip.engine && (
                    <span className={cn(overlay && 'max-sm:hidden')}> · {clip.engine}</span>
                  )}
                </b>
                {/* The GPU count and tag start from a zero basis, so they take only the width the name leaves. */}
                {clip.meta && (
                  <span
                    className={cn(
                      'max-w-fit grow basis-0 truncate text-white/70',
                      overlay && 'max-sm:hidden',
                    )}
                  >
                    {clip.meta}
                  </span>
                )}
                {clip.unofficial && (
                  <span className="max-w-fit grow basis-0 truncate rounded bg-amber-400/20 px-1 text-amber-200">
                    {s.unofficial}
                  </span>
                )}
                {playable.includes(role) && (
                  <button
                    type="button"
                    data-testid="video-results-speaker"
                    aria-pressed={audible === role}
                    aria-label={s.listen(clip.label)}
                    title={s.listen(clip.label)}
                    className={cn(
                      styles.hit,
                      'relative grid size-6 shrink-0 place-items-center rounded hover:bg-white/15',
                      audible === role ? 'text-primary' : 'text-white/70',
                    )}
                    onClick={() => listen(role)}
                  >
                    <Volume2 aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </div>
              {onLeft(role) && idle && idleFrame}
            </div>
          );
        })}
        {view === 'diff' &&
          (both && !differenceFailed ? (
            <canvas
              ref={canvas}
              data-testid="video-results-difference"
              aria-label={s.differenceLabel}
              className="pointer-events-none absolute inset-0 size-full object-contain"
              style={lensStyle}
            />
          ) : (
            <p
              role="status"
              className="absolute inset-0 grid place-content-center bg-black p-6 text-center text-xs text-white/70"
            >
              {both ? s.differenceUnavailable : s.needsBoth}
            </p>
          ))}
        {view === 'diff' && both && !differenceFailed && (
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-md bg-black/70 px-2.5 py-1 text-xs text-white">
            <span>{s.differenceLabel}</span>
            <InfoHelp label={s.differenceLabel} value="difference-preview">
              {s.differenceNote}
            </InfoHelp>
          </div>
        )}
        {wiping && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0"
            style={{ left: `${split}%` }}
          >
            <div className="absolute inset-y-0 -left-px w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
            <button
              ref={handle}
              type="button"
              data-testid="video-results-split"
              aria-pressed={locked}
              aria-label={locked ? s.unlock : s.lock}
              title={locked ? s.unlock : s.lock}
              className={cn(
                styles.hit,
                'pointer-events-auto absolute top-1/2 left-0 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white',
                locked ? 'bg-white text-black' : 'bg-black/55 text-white',
              )}
              onClick={() => {
                if (wipe.current?.moved) wipe.current = null;
                else lock(!locked);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP;
                setSplit((current) => Math.min(100, Math.max(0, current + step)));
              }}
            >
              {locked ? (
                <Lock aria-hidden="true" className="size-3.5" />
              ) : (
                <MoveHorizontal aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        )}
        {view === 'toggle' && (
          <div
            role="group"
            aria-label={s.shown}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 overflow-hidden rounded-lg bg-black/70"
          >
            {(swapped ? ROLES : (['b', 'a'] as const)).map((role) => (
              <button
                key={role}
                type="button"
                data-testid={`video-results-toggle-${role}`}
                aria-pressed={shown === role}
                className={cn(
                  'h-8 max-w-40 truncate px-3 text-xs font-semibold',
                  shown === role ? 'bg-white text-black' : 'text-white/70',
                )}
                onClick={() => {
                  if (toggled !== role) flip('click');
                }}
              >
                {clips[role].label}
              </button>
            ))}
          </div>
        )}
        {lens.zoom > 1 && (
          <span className="pointer-events-none absolute right-2 bottom-2 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-2xs text-white">
            {lens.zoom}×
          </span>
        )}
      </div>
      {caption}
      {/* Under 768 px the row keeps one shape whatever plays: the time and the buffering note share a slot. */}
      <div className="flex flex-wrap items-center gap-3 max-md:gap-2">
        <Button
          data-testid="video-results-play"
          variant="outline"
          size="sm"
          className="max-md:min-w-16"
          disabled={playable.length === 0}
          aria-pressed={active}
          onClick={togglePlay}
        >
          {active ? s.pause : s.play}
        </Button>
        <input
          data-testid="video-results-scrub"
          type="range"
          min={0}
          max={duration || 1}
          step={0.02}
          value={Math.min(time, duration || 1)}
          disabled={duration === 0}
          aria-label={s.scrub}
          className="h-11 min-w-0 flex-1 basis-28 accent-primary max-md:basis-12 md:h-8"
          onInput={(event) => {
            const next = Number(event.currentTarget.value);
            setDifferenceFailed(false);
            group.seek(next);
            track('video_results_clips_scrub', { seconds: next });
          }}
        />
        <span
          className={cn(
            'font-mono text-xs text-muted-foreground max-md:min-w-[14ch]',
            progress && 'max-md:hidden',
          )}
        >
          {time.toFixed(2)} / {duration > 0 ? duration.toFixed(2) : '—'} {s.seconds}
        </span>
        {progress && (
          <span
            data-testid="video-results-buffering"
            className="font-mono text-xs text-muted-foreground max-md:min-w-[14ch]"
          >
            {progress(Math.round(buffered * 100))}
          </span>
        )}
        <Button
          data-testid="video-results-swap"
          variant="outline"
          size="icon-xs"
          aria-pressed={swapped}
          aria-label={s.swap}
          title={s.swap}
          onClick={() => {
            onSwappedChange(!swapped);
            track('video_results_clips_swap', { enabled: !swapped });
          }}
        >
          <ArrowLeftRight aria-hidden="true" />
        </Button>
        <InSlot slot={slot}>
          <Button
            data-testid="video-results-inspect-toggle"
            variant="outline"
            size="sm"
            // Hidden by CSS from a phone's first paint, before the slot it moves to has mounted.
            className={
              slot ? 'self-start' : inspectSlot === undefined ? undefined : 'max-md:hidden'
            }
            aria-expanded={inspect}
            aria-controls={inspectId}
            onClick={() => {
              setInspect(!inspect);
              track('video_results_inspect_toggled', { enabled: !inspect });
            }}
          >
            <ScanSearch aria-hidden="true" />
            {s.inspect}
          </Button>
        </InSlot>
      </div>
      <InSlot slot={slot} show={inspect}>
        <div
          id={inspectId}
          data-testid="video-results-inspect"
          role="group"
          aria-label={s.inspect}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/60 px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-1.5">
            <Button
              data-testid="video-results-frame-previous"
              variant="outline"
              size="icon-xs"
              aria-label={s.previousFrame}
              title={s.previousFrameTitle}
              disabled={!clock}
              onClick={() => stepFrame(-1)}
            >
              <StepBack aria-hidden="true" />
            </Button>
            <Button
              data-testid="video-results-frame-next"
              variant="outline"
              size="icon-xs"
              aria-label={s.nextFrame}
              title={s.nextFrameTitle}
              disabled={!clock}
              onClick={() => stepFrame(1)}
            >
              <StepForward aria-hidden="true" />
            </Button>
            <span
              data-testid="video-results-frame"
              className="min-w-28 font-mono text-muted-foreground"
            >
              {clock ? s.frame(frameAt(time, clock.fps, clock.total) + 1, clock.total) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{s.speed}</span>
            <SegmentedToggle
              role="group"
              ariaLabel={s.speed}
              value={String(playback.speed)}
              size="sm"
              options={SPEEDS.map((speed) => ({
                value: String(speed),
                label: `${speed}×`,
                testId: `video-results-speed-${speed}`,
              }))}
              onValueChange={(value) => {
                const speed = Number(value);
                setPlayback((current) => ({ ...current, speed }));
                track('video_results_speed_changed', { speed });
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{s.zoom}</span>
            <SegmentedToggle
              role="group"
              ariaLabel={s.zoom}
              value={String(lens.zoom)}
              size="sm"
              options={ZOOMS.map((zoom) => ({
                value: String(zoom),
                label: `${zoom}×`,
                testId: `video-results-zoom-${zoom}`,
              }))}
              onValueChange={(value) => zoomTo(Number(value))}
            />
          </div>
          <Button
            data-testid="video-results-loop"
            variant="outline"
            size="sm"
            aria-pressed={playback.loop}
            onClick={() => {
              setPlayback((current) => ({ ...current, loop: !current.loop }));
              track('video_results_loop_toggled', { enabled: !playback.loop });
            }}
          >
            <Repeat aria-hidden="true" />
            {s.loop}
          </Button>
          {lens.zoom > 1 && <span className="text-muted-foreground">{s.panHint(touch)}</span>}
        </div>
      </InSlot>
    </div>
  );
}

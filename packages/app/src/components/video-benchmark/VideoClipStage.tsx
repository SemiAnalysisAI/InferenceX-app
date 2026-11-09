'use client';

import { Lock, MoveHorizontal, Play, Volume2 } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { InfoHelp } from '@/components/ui/option-info';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { clipGroupActive } from './clip-sync';
import type { StageView } from './clip-stage';
import { absoluteFrameDifference } from './results-clips';
import { useClipGroup } from './use-clip-group';

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
      'Absolute RGB difference ×4 between the two clips at the same playback time. This browser preview is separate from the all-frame PSNR measurement.',
    play: 'Play',
    pause: 'Pause',
    playBoth: 'Play both clips',
    scrub: 'Scrub both clips',
    buffering: (percent: number) => `Buffering ${percent}%`,
    downloading: (percent: number) => `Loading ${percent}%`,
    seconds: 's',
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
      '两段视频在相同播放时刻的 RGB 绝对差异，放大 4 倍。此为浏览器预览，与全帧 PSNR 测量相互独立。',
    play: '播放',
    pause: '暂停',
    playBoth: '同时播放两段视频',
    scrub: '同步拖动两段视频',
    buffering: (percent: number) => `缓冲中 ${percent}%`,
    downloading: (percent: number) => `加载中 ${percent}%`,
    seconds: 's',
  },
};

/** One side of the stage. */
export interface StageClip {
  /** Audio identity that survives a prompt switch: the side's point id, or `reference`. */
  source: string;
  /** Hardware key or `reference`; analytics and test hooks. */
  id: string;
  label: string;
  meta: string;
  /** Pill dot; null draws the reference's outlined dot. */
  color: string | null;
  /** Sealed original, which Difference always reads; empty when no media is shown. */
  url: string;
  /** Lighter web rendition of `url` for the other views. */
  previewUrl?: string;
  /** Why the side shows no clip while `url` is empty. */
  empty: string;
  unofficial?: boolean;
}

export interface VideoClipStageProps {
  /** Subject, on the left (or top). */
  a: StageClip;
  /** Its pair, on the right (or bottom). */
  b: StageClip;
  view: StageView;
  /** Changes with the prompt or the compared sources; pauses the clips. */
  selection: string;
  /** Prompt text on the idle frame shown before the first Play. */
  prompt?: string;
  /** A side's web rendition failed to load; the caller drops it so the side plays the original. */
  onPreviewError: (previewUrl: string) => void;
}

type Role = 'a' | 'b';
const ROLES = ['a', 'b'] as const;
const OTHER = { a: 'b', b: 'a' } as const;
/** Playback-time gap beyond which a Difference frame would compare different moments. */
const DIFFERENCE_SYNC_SECONDS = 0.12;
const SPLIT_STEP = 5;

export default function VideoClipStage({
  a,
  b,
  view,
  selection,
  prompt,
  onPreviewError,
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const pendingSplit = useRef<number | null>(null);
  const splitFrame = useRef(0);

  const playable = ROLES.filter((role) => clips[role].url && !errors.has(clips[role].url));
  const audible = playable.find((role) => clips[role].source === audio) ?? null;
  const group = useClipGroup(playable, audible, selection, (rejected) =>
    setErrors(
      (previous) =>
        new Set([...previous, ...rejected.map((role) => latest.current[role as Role].url)]),
    ),
  );
  const { videos, phase, time, buffered, ready, duration } = group;
  const both = playable.length === 2;
  const shown: Role = peek ? OTHER[toggled] : toggled;
  const overlay = view !== 'side';
  /** Before the first Play: the idle frame replaces the split until there is a picture to split. */
  const idle = !armed && playable.length > 0;
  const original = view === 'diff';

  // A hidden or failed audio source restores mute; a prompt switch keeps the same source.
  useLayoutEffect(() => {
    if (audio !== null && audible === null) setAudio(null);
  }, [audio, audible]);

  useEffect(() => {
    setDifferenceFailed(false);
    setPeek(false);
  }, [selection, view]);

  useEffect(() => () => cancelAnimationFrame(splitFrame.current), []);

  // Changing a side's source (Difference, rendition fallback) reloads it at 0. Before metadata,
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
  }, [selection, original, a.previewUrl, b.previewUrl]);

  useEffect(() => {
    if (view !== 'diff' || !both) return undefined;
    let frame = 0;
    let lastDraw = -Infinity;
    const buffer = document.createElement('canvas');
    const context = buffer.getContext('2d', { willReadFrequently: true });
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!context || now - lastDraw < 100) return;
      lastDraw = now;
      const left = videos.current.get('a'),
        right = videos.current.get('b'),
        target = canvas.current;
      if (!left || !right || !target || left.readyState < 2 || right.readyState < 2) return;
      if (right.videoWidth === 0) return;
      if (left.videoWidth !== right.videoWidth || left.videoHeight !== right.videoHeight) {
        setDifferenceFailed(true);
        return;
      }
      if (Math.abs(left.currentTime - right.currentTime) > DIFFERENCE_SYNC_SECONDS) return;
      buffer.width = right.videoWidth;
      buffer.height = right.videoHeight;
      try {
        context.drawImage(right, 0, 0);
        const base = context.getImageData(0, 0, buffer.width, buffer.height);
        context.drawImage(left, 0, 0);
        const candidate = context.getImageData(0, 0, buffer.width, buffer.height);
        target.width = buffer.width;
        target.height = buffer.height;
        const output = target.getContext('2d');
        if (output) {
          const difference = output.createImageData(buffer.width, buffer.height);
          difference.data.set(absoluteFrameDifference(base.data, candidate.data));
          output.putImageData(difference, 0, 0);
        }
      } catch {
        setDifferenceFailed(true);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [view, both, a.url, b.url]);

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
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (view !== 'wipe' || locked) return;
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
    } else if (event.key === 'Escape' && locked) {
      event.preventDefault();
      lock(false);
    }
  };

  const srcOf = (clip: StageClip) => (original || !clip.previewUrl ? clip.url : clip.previewUrl);
  /** Middle of the part of the stage a side shows, for its empty-state text. */
  const centerOf = (role: Role) =>
    view === 'wipe' ? (role === 'a' ? split / 2 : split + (100 - split) / 2) : 50;
  const progress =
    phase === 'buffering'
      ? s.buffering
      : armed && !ready && playable.length > 0 && (phase === 'paused' || phase === 'loading')
        ? s.downloading
        : null;

  const idleFrame = (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6">
      <button
        type="button"
        data-testid="video-results-start"
        aria-label={s.playBoth}
        className="pointer-events-auto grid size-12 place-items-center rounded-full bg-white text-black shadow-lg hover:bg-white/90"
        onClick={(event) => {
          event.stopPropagation();
          togglePlay();
        }}
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
    <div className="min-w-0 space-y-3">
      <div
        data-testid="video-results-stage"
        data-view={view}
        tabIndex={0}
        role="group"
        aria-label={s.stage(a.label, b.label)}
        className={cn(
          'relative isolate touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // The stage and its transport fit a laptop viewport below the chart.
          overlay
            ? 'mx-auto aspect-video w-full max-w-[calc((100svh-10rem)*16/9)] overflow-hidden rounded-lg bg-black'
            : 'grid gap-3 min-[640px]:grid-cols-2',
          view === 'wipe' && !locked && 'cursor-ew-resize',
        )}
        onPointerMove={onPointerMove}
        onClick={() => {
          if (view === 'wipe') lock(!locked);
          else if (view === 'toggle') flip('click');
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
              )}
            >
              <div
                className={cn('absolute inset-0 bg-black', hidden && 'invisible')}
                style={
                  view === 'wipe' && role === 'b'
                    ? { clipPath: `inset(0 0 0 ${split}%)` }
                    : undefined
                }
              >
                {clip.url && (
                  <video
                    ref={group.register(role)}
                    src={srcOf(clip)}
                    crossOrigin="anonymous"
                    muted
                    playsInline
                    preload={armed ? 'auto' : 'none'}
                    aria-label={clip.label}
                    className={cn('size-full object-contain', failed && 'invisible')}
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
                        onClick={(event) => {
                          event.stopPropagation();
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
                  role === 'a' ? 'left-2' : 'right-2',
                  overlay ? 'max-w-[46%]' : 'max-w-[calc(100%-1rem)]',
                  audible === role && 'ring-2 ring-amber-400',
                  view === 'toggle' && shown !== role && 'opacity-45',
                  !playable.includes(role) && 'pr-2',
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={
                    clip.color ? { background: clip.color } : { border: '1.5px solid currentColor' }
                  }
                />
                <b className="min-w-0 truncate font-semibold">{clip.label}</b>
                {clip.meta && <span className="shrink-0 text-white/70">{clip.meta}</span>}
                {clip.unofficial && (
                  <span className="shrink-0 rounded bg-amber-400/20 px-1 text-amber-200">
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
                      'grid size-6 shrink-0 place-items-center rounded hover:bg-white/15',
                      audible === role ? 'text-amber-400' : 'text-white/70',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      listen(role);
                    }}
                  >
                    <Volume2 aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </div>
              {role === 'a' && idle && idleFrame}
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
        {view === 'wipe' && !idle && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0"
            style={{ left: `${split}%` }}
          >
            <div className="absolute inset-y-0 -left-px w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
            <button
              type="button"
              data-testid="video-results-split"
              aria-pressed={locked}
              aria-label={locked ? s.unlock : s.lock}
              title={locked ? s.unlock : s.lock}
              className={cn(
                'pointer-events-auto absolute top-1/2 left-0 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white',
                locked ? 'bg-white text-black' : 'bg-black/55 text-white',
              )}
              onClick={(event) => {
                event.stopPropagation();
                lock(!locked);
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
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                data-testid={`video-results-toggle-${role}`}
                aria-pressed={shown === role}
                className={cn(
                  'h-8 max-w-40 truncate px-3 text-xs font-semibold',
                  shown === role ? 'bg-white text-black' : 'text-white/70',
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (toggled !== role) flip('click');
                }}
              >
                {clips[role].label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="video-results-play"
          variant="outline"
          size="sm"
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
          className="h-11 min-w-0 flex-1 basis-28 accent-primary md:h-8"
          onInput={(event) => {
            const next = Number(event.currentTarget.value);
            setDifferenceFailed(false);
            group.seek(next);
            track('video_results_clips_scrub', { seconds: next });
          }}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {time.toFixed(2)} / {duration > 0 ? duration.toFixed(2) : '—'} {s.seconds}
        </span>
        {progress && (
          <span
            data-testid="video-results-buffering"
            className="font-mono text-xs text-muted-foreground"
          >
            {progress(Math.round(buffered * 100))}
          </span>
        )}
      </div>
    </div>
  );
}

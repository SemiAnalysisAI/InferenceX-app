'use client';

import { Check, Pause, Play, Share2, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { buildShareUrl } from '@/lib/routing/url-state';
import { cn } from '@/lib/shared/utils';
import { EASE, MOTION, cssEase, reducedMotion } from './motion';
import { useChanges } from './motion-dom';
import styles from './results.module.css';
import { useFirstFrame } from './use-first-frame';

const STRINGS = {
  en: {
    close: 'Close point details',
    play: 'Play clip',
    pause: 'Pause clip',
    seed: 'seed',
    compare: 'Compare',
    share: 'Share',
    copied: 'Copied',
  },
  zh: {
    close: '关闭数据点详情',
    play: '播放视频',
    pause: '暂停视频',
    seed: 'seed',
    compare: '对比',
    share: '分享',
    copied: '已复制',
  },
};

/** A downward drag this long on the sheet's header closes it, in px. */
const SWIPE_CLOSE = 72;
/** How much of what follows the first screen shows under it, cut mid-line to say it scrolls, in px. */
const PEEK = 24;
/** Clear space kept between the point's mark and the sheet, in px. */
const ANCHOR_GAP = 20;
/** Frames after a dismissal on which the page is put back again if it has moved. */
const RETURN_FRAMES = 5;
/** Frames a smooth return is given to come to rest before it is left alone. */
const RETURN_WAIT_FRAMES = 120;
/** How far from its place, in px, a page at rest is still put back after a smooth return. */
const RETURN_SLACK = 24;
/** What a reader does to scroll the page themselves, which ends the return. */
const HOLDS = ['wheel', 'touchstart', 'keydown'] as const;

export interface VideoPointSheetProps {
  /** Hardware name, after its color dot. */
  title: string;
  color: string;
  /** Engine, GPU count and run date, in that order; a named run's marker comes last. */
  facts: readonly string[];
  /**
   * The point's clip of the shown prompt: undefined while it is still being read, null when the
   * point has none.
   */
  clip: { poster: string | null; src: string | null } | null | undefined;
  /** Shown in place of the clip for a point whose run has none. */
  noClips?: string;
  prompt: { id: string; seed: number } | null;
  /** The four headline figures. */
  metrics: readonly { label: string; value: string }[];
  /** Plays the point on the clip stage; absent for a point without clips. */
  onCompare?: () => void;
  telemetry: { label: string; onOpen: () => void };
  /** Analytics context: the point's hardware and whether it is a named run's. */
  context: { gpu: string; overlay: boolean };
  /** Identifies the point, so a sheet that moves to another point follows it. */
  pointKey: string;
  /** The point's mark on the chart, which the page scrolls clear of the sheet. */
  anchor?: () => Element | null;
  /** A tap beside the sheet at these viewport coordinates; true when it opened another point. */
  onOutside?: (x: number, y: number) => boolean;
  onClose: () => void;
  /** Everything else the pinned panel shows, below the first screen. */
  children: ReactNode;
}

/**
 * A touch screen's view of one chart point: a sheet over the bottom of the page, with the point's
 * clip, four figures and three actions on its first screen and the rest of the pinned panel below.
 * It reuses the chart tooltip's sheet style (`[data-chart-tooltip][data-sheet]` in globals.css).
 * It opens no taller than its first screen, so the chart and the point's mark stay in view above
 * it, and grows to the tooltip sheet's height once the reader scrolls it. The page behind is
 * never locked: a clear backdrop takes the touches, and closing returns the page to where a tap
 * found it.
 */
export default function VideoPointSheet({
  title,
  color,
  facts,
  clip,
  noClips,
  prompt,
  metrics,
  onCompare,
  telemetry,
  context,
  pointKey,
  anchor,
  onOutside,
  onClose,
  children,
}: VideoPointSheetProps) {
  const s = STRINGS[useLocale()];
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pull, setPull] = useState(0);
  /** Let go short of closing: the sheet eases back to rest instead of following a finger. */
  const [settling, setSettling] = useState(false);
  /** Sliding away at the reader's word; the page behind already takes touches. */
  const [leaving, setLeaving] = useState(false);
  const exit = useRef<Animation | null>(null);
  // A sheet that moves to another point while it slides away stays, for that point.
  useEffect(() => {
    exit.current?.cancel();
    exit.current = null;
    setLeaving(false);
  }, [pointKey]);
  useEffect(() => () => exit.current?.cancel(), []);
  const moved = useChanges(pointKey);
  /** The drag on the header: its pointer, where it began and how far down it has gone. */
  const press = useRef<{ id: number; y: number; pull: number } | null>(null);
  const more = useRef<HTMLDivElement>(null);
  /** Height of the first screen, measured; null before the sheet is drawn. */
  const [fold, setFold] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  /** Where the page was before it scrolled the point clear of the sheet. */
  const origin = useRef<number | null>(null);
  /** The point this sheet last scrolled the page for; a later run for it finds the page moving. */
  const scrolledFor = useRef<string | null>(null);
  /** Closes at the reader's word, which also puts the page back; an action that leaves does not. */
  const dismiss = () => {
    if (exit.current) return;
    const top = origin.current;
    const element = sheet.current;
    const still = reducedMotion() || typeof element?.animate !== 'function';
    if (top !== null) {
      // The page goes back the way it came, by a smooth scroll.
      window.scrollTo(still ? { top } : { top, behavior: 'smooth' });
      // The scroll that cleared the point may still be running, and it can carry on past this
      // return or, when it has only just begun, through it. An immediate return is checked on
      // the next frames; a smooth one once the page has come to rest, unless the reader has
      // taken hold of the page meanwhile.
      let frames = still ? RETURN_FRAMES : RETURN_WAIT_FRAMES;
      let last = Number.NaN;
      let rested = 0;
      let held = false;
      const hold = () => {
        held = true;
      };
      const check = () => {
        frames -= 1;
        if (still) {
          if (window.scrollY !== top) window.scrollTo({ top });
        } else {
          rested = window.scrollY === last ? rested + 1 : 0;
          last = window.scrollY;
          if (held) frames = 0;
          else if (rested >= RETURN_FRAMES) {
            // A few pixels short is the earlier scroll's doing; anywhere else, something else has
            // moved the page since, and that stands.
            if (last !== top && Math.abs(last - top) <= RETURN_SLACK) window.scrollTo({ top });
            frames = 0;
          }
        }
        if (frames > 0) requestAnimationFrame(check);
        else for (const type of HOLDS) window.removeEventListener(type, hold);
      };
      if (!still) for (const type of HOLDS) window.addEventListener(type, hold, { passive: true });
      requestAnimationFrame(check);
    }
    if (still || !element) {
      onClose();
      return;
    }
    // The sheet leaves the way it came, from wherever a drag left it, and closes when it is gone.
    setLeaving(true);
    const slide = element.animate(
      [
        { transform: `translateY(${press.current?.pull ?? pull}px)`, opacity: 1 },
        { transform: 'translateY(100%)', opacity: 0 },
      ],
      { duration: MOTION.fast, easing: cssEase(EASE.exit), fill: 'forwards' },
    );
    exit.current = slide;
    slide.addEventListener('finish', () => {
      if (exit.current === slide) onClose();
    });
  };
  const close = useRef(dismiss);
  close.current = dismiss;

  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (more.current) setFold(more.current.offsetTop + PEEK);
  });
  // The sheet covers the bottom of the screen; a point under it scrolls up into view.
  useEffect(() => {
    const element = sheet.current;
    const mark = anchor?.()?.getBoundingClientRect();
    // Not before the sheet has its opening height, and again if its first screen grows.
    if (!element || !mark || fold === null) return;
    // The slide-in moves the sheet by a transform, so its resting top comes from its height.
    const over = mark.bottom + ANCHOR_GAP - (window.innerHeight - element.offsetHeight);
    if (over <= 0) return;
    // The place to return to is where a tap found the page, so it is read before the first scroll
    // for that point; a run that follows, once the clip is read, finds the page on its way. A
    // point a link opened was never on screen, so it has no such place.
    if (
      origin.current === null &&
      scrolledFor.current !== pointKey &&
      mark.top < window.innerHeight
    )
      origin.current = window.scrollY;
    scrolledFor.current = pointKey;
    window.scrollBy({
      top: over,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [fold, pointKey, anchor]);
  // Focus moves into the sheet and returns to where it was; Escape closes. The sheet is modal,
  // so Tab goes round its own controls and never reaches the page under the backdrop.
  useEffect(() => {
    if (!mounted) return undefined;
    const before = document.activeElement;
    sheet.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current();
        return;
      }
      const element = sheet.current;
      if (event.key !== 'Tab' || !element) return;
      const stops = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
      const edge = event.shiftKey ? stops[0] : stops.at(-1);
      const active = document.activeElement;
      // From the sheet itself, Tab already lands on its first control.
      if (active === edge || !element.contains(active) || (event.shiftKey && active === element)) {
        event.preventDefault();
        (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (before instanceof HTMLElement) before.focus({ preventScroll: true });
    };
  }, [mounted]);
  // Another prompt or point is another clip, which starts paused.
  const src = clip?.src ?? null;
  useEffect(() => setPlaying(false), [src]);
  const firstFrame = useFirstFrame(() => video.current, src ?? undefined);

  if (!mounted) return null;

  const togglePlay = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      track('video_results_sheet_clip_played', context);
      // Rejected when the browser refuses playback; the poster and the button stay.
      element.play().catch(() => setPlaying(false));
      setPlaying(true);
    } else {
      element.pause();
      setPlaying(false);
    }
  };
  const share = async () => {
    const url = buildShareUrl();
    const native = typeof navigator.share === 'function';
    track('video_results_sheet_shared', { ...context, native });
    if (native) {
      // The reader may dismiss the system sheet, which rejects.
      await navigator.share({ title: document.title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Without clipboard access the address bar still holds the link.
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    setSettling(false);
    press.current = { id: event.pointerId, y: event.clientY, pull: 0 };
    // A finger's moves and its lift come here wherever it goes; a mouse's or a pen's go to what is
    // under it, and a quick drag is off the header before the sheet has followed it.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already up has no drag to keep.
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (press.current?.id !== event.pointerId) return;
    press.current.pull = Math.max(0, event.clientY - press.current.y);
    setPull(press.current.pull);
  };
  const release = () => {
    const drag = press.current;
    if (!drag) return;
    // A flick lifts before the last move is drawn, so the distance comes from the drag itself.
    if (drag.pull > SWIPE_CLOSE) {
      dismiss();
      press.current = null;
      return;
    }
    press.current = null;
    setSettling(true);
    setPull(0);
  };

  return createPortal(
    <>
      <button
        type="button"
        data-testid="video-point-sheet-backdrop"
        aria-label={s.close}
        className={cn(
          'fixed inset-0 z-[9998] cursor-default touch-none',
          leaving && 'pointer-events-none',
        )}
        onClick={(event) => {
          // A tap that moves the sheet to another point leaves the focus in the sheet.
          if (onOutside?.(event.clientX, event.clientY))
            sheet.current?.focus({ preventScroll: true });
          else dismiss();
        }}
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-chart-tooltip
        data-sheet="true"
        data-testid="video-point-sheet"
        data-settling={settling || undefined}
        data-leaving={leaving || undefined}
        // Under 768 px globals.css sizes the sheet; a wider touch screen gets the same sheet, centered.
        className={cn(
          styles.sheet,
          'fixed inset-x-0 bottom-0 z-[9999] mx-auto w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-border bg-popover text-sm shadow-2xl outline-none',
        )}
        style={{
          maxHeight: `min(72dvh, ${expanded || fold === null ? 640 : fold}px)`,
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
        }}
        onScroll={(event) => {
          if (!expanded && event.currentTarget.scrollTop > 0) setExpanded(true);
        }}
      >
        <div className="px-4 pb-4 max-md:pt-0 md:pt-4">
          {/*
            Dragging the header down closes the sheet; its buttons keep their taps. Under 768 px it
            reaches up over the grab bar the sheet style draws, which is where a thumb lands.
          */}
          <div
            className="flex touch-none items-center gap-2 max-md:relative max-md:z-[2] max-md:-mt-5 max-md:pt-5"
            data-testid="video-point-sheet-header"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <div className="min-w-0 flex-1">
              <span id={titleId} className="text-base font-semibold text-foreground">
                {title}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">{facts.join(' · ')}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={s.close}
              data-testid="video-point-sheet-close"
              onClick={dismiss}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {/* The clip beside its four figures keeps the sheet short, so the chart stays in view. */}
          <div
            key={moved}
            className={cn('flex items-start gap-3', moved > 0 && styles.swapIn)}
            data-testid="video-point-sheet-figures"
          >
            {clip !== null && (
              <div className="w-[44%] max-w-44 shrink-0">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                  {clip === undefined ? (
                    <Skeleton className="absolute inset-0 rounded-none" />
                  ) : clip.src ? (
                    <>
                      <video
                        ref={video}
                        src={clip.src}
                        poster={clip.poster ?? undefined}
                        preload="none"
                        muted
                        playsInline
                        loop
                        data-testid="video-point-sheet-video"
                        className="absolute inset-0 size-full object-contain"
                        onPause={() => setPlaying(false)}
                        onPlay={() => setPlaying(true)}
                      />
                      {/* play() ends the poster; until a frame is drawn the first frame stays. */}
                      {clip.poster && !firstFrame.presented && (
                        <img
                          src={clip.poster}
                          alt=""
                          data-testid="video-point-sheet-first-frame"
                          className="absolute inset-0 size-full object-contain"
                        />
                      )}
                      <button
                        type="button"
                        aria-label={playing ? s.pause : s.play}
                        aria-pressed={playing}
                        data-testid="video-point-sheet-play"
                        className="absolute inset-0 grid place-items-center"
                        onClick={togglePlay}
                      >
                        <span
                          className={
                            playing
                              ? 'grid size-11 place-items-center rounded-full bg-black/55 text-white opacity-0'
                              : 'grid size-11 place-items-center rounded-full bg-black/55 text-white ring-2 ring-white/90'
                          }
                        >
                          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                        </span>
                      </button>
                    </>
                  ) : (
                    clip.poster && (
                      <img
                        src={clip.poster}
                        alt=""
                        className="absolute inset-0 size-full object-contain"
                      />
                    )
                  )}
                </div>
                {prompt && (
                  <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
                    {prompt.id} ·{' '}
                    <span className="whitespace-nowrap">
                      {s.seed} {prompt.seed}
                    </span>
                  </p>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {clip === null && noClips && (
                <p
                  className="mb-1.5 text-xs text-muted-foreground"
                  data-testid="video-point-sheet-empty"
                >
                  {noClips}
                </p>
              )}
              <dl className="space-y-1" data-testid="video-point-sheet-metrics">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="flex flex-wrap items-baseline justify-between gap-x-2"
                  >
                    <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                    <dd className="m-0 ml-auto text-sm font-semibold text-foreground tabular-nums">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onCompare && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                data-action="compare"
                onClick={onCompare}
              >
                {s.compare}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              data-action="share"
              onClick={share}
            >
              {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
              {copied ? s.copied : s.share}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              data-action="view-telemetry"
              onClick={telemetry.onOpen}
            >
              {telemetry.label}
            </Button>
          </div>
          <div ref={more} className="mt-4 text-xs" data-testid="video-point-sheet-more">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

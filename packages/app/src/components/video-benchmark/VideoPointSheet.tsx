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
/** How much of what follows the first screen shows under it, to say it scrolls, in px. */
const PEEK = 24;
/** Clear space kept between the point's mark and the sheet, in px. */
const ANCHOR_GAP = 20;

/**
 * A touch screen's view of one chart point, in the chart tooltip's sheet style: its clip, four
 * figures and three actions on the first screen, the rest of the pinned panel (`children`) below.
 * It opens no taller than its first screen, so the point stays in view above it, and grows once
 * scrolled. The page behind is not locked; closing returns it to where the tap found it.
 */
export default function VideoPointSheet({
  pointKey,
  title,
  color,
  facts,
  clip,
  noClips,
  prompt,
  metrics,
  onCompare,
  telemetry,
  onTelemetry,
  context,
  anchor,
  onOutside,
  onClose,
  children,
}: {
  pointKey: string;
  title: string;
  color: string;
  facts: readonly string[];
  /** The point's clip of the shown prompt: undefined while it is read, null when it has none. */
  clip: { poster: string | null; src: string | null } | null | undefined;
  /** Shown in place of the clip for a point whose run has none. */
  noClips?: string;
  prompt: { id: string; seed: number } | null;
  metrics: readonly (readonly [label: string, value: string])[];
  /** Plays the point on the clip stage; absent for a point without clips. */
  onCompare?: () => void;
  telemetry: string;
  onTelemetry: () => void;
  context: { gpu: string; overlay: boolean };
  /** The point's mark on the chart, which the page scrolls clear of the sheet. */
  anchor: () => Element | null;
  /** A tap beside the sheet; true when it opened another point. */
  onOutside: (x: number, y: number) => boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const s = STRINGS[useLocale()];
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pull, setPull] = useState(0);
  /** The drag on the header: its pointer, where it began and how far down it has gone. */
  const press = useRef<{ id: number; y: number; pull: number } | null>(null);
  const more = useRef<HTMLDivElement>(null);
  /** Height of the first screen; null before the sheet is drawn. */
  const [fold, setFold] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  /** Where the page was before it scrolled the point clear of the sheet. */
  const origin = useRef<number | null>(null);
  const scrolledFor = useRef<string | null>(null);
  /** Closes at the reader's word, which also puts the page back; an action that leaves does not. */
  const dismiss = () => {
    const top = origin.current;
    if (top !== null) {
      window.scrollTo({ top });
      // The smooth scroll that cleared the point may still run past this, so five frames check.
      let frames = 5;
      const hold = () => {
        if (window.scrollY !== top) window.scrollTo({ top });
        frames -= 1;
        if (frames > 0) requestAnimationFrame(hold);
      };
      requestAnimationFrame(hold);
    }
    onClose();
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
    const mark = anchor()?.getBoundingClientRect();
    if (!element || !mark || fold === null) return;
    // The slide-in moves the sheet by a transform, so its resting top comes from its height.
    const over = mark.bottom + ANCHOR_GAP - (window.innerHeight - element.offsetHeight);
    if (over <= 0) return;
    // The place to return to is read before the first scroll for a point; a point a link opened
    // was never on screen, so it has none.
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
  // Focus moves into the sheet and back; Escape closes; Tab stays among the sheet's controls.
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
    press.current = { id: event.pointerId, y: event.clientY, pull: 0 };
    // A mouse's or a pen's moves go to what is under it, and a quick drag leaves the header.
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
    press.current = null;
    // A flick lifts before the last move is drawn, so the distance comes from the drag itself.
    if (drag.pull > SWIPE_CLOSE) dismiss();
    else setPull(0);
  };

  return createPortal(
    <>
      <button
        type="button"
        data-testid="video-point-sheet-backdrop"
        aria-label={s.close}
        className="fixed inset-0 z-[9998] cursor-default touch-none"
        onClick={(event) => {
          // A tap that moves the sheet to another point leaves the focus in the sheet.
          if (onOutside(event.clientX, event.clientY))
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
        // Under 768 px globals.css sizes the sheet; a wider touch screen gets the same sheet, centered.
        className="fixed inset-x-0 bottom-0 z-[9999] mx-auto w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-border bg-popover text-sm shadow-2xl outline-none"
        style={{
          maxHeight: `min(72dvh, ${expanded || fold === null ? 640 : fold}px)`,
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
        }}
        onScroll={(event) => {
          if (!expanded && event.currentTarget.scrollTop > 0) setExpanded(true);
        }}
      >
        <div className="px-4 pb-4 max-md:pt-0 md:pt-4">
          {/* Dragging the header down closes the sheet. Under 768 px it reaches over the grab bar. */}
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
          <div className="flex items-start gap-3">
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
                      {clip.poster && !firstFrame && (
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
                {metrics.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-baseline justify-between gap-x-2"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="m-0 ml-auto text-sm font-semibold text-foreground tabular-nums">
                      {value}
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
              onClick={onTelemetry}
            >
              {telemetry}
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

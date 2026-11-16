'use client';

import { useLayoutEffect, useRef, useState } from 'react';

const HAVE_CURRENT_DATA = 2;

/**
 * Calls `shown` once, when the video next puts a frame on screen. Returns the cancel. A browser
 * without `requestVideoFrameCallback` is taken to have painted a frame one paint after it has one
 * decoded.
 */
export function onNextFrame(video: HTMLVideoElement, shown: () => void): () => void {
  if ('requestVideoFrameCallback' in video) {
    const id = video.requestVideoFrameCallback(() => shown());
    return () => video.cancelVideoFrameCallback(id);
  }
  const element: HTMLVideoElement = video;
  const events = ['loadeddata', 'seeked', 'timeupdate', 'playing'] as const;
  let frame = 0;
  const stop = () => events.forEach((event) => element.removeEventListener(event, check));
  function check() {
    if (frame !== 0 || element.readyState < HAVE_CURRENT_DATA || element.seeking) return;
    stop();
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(shown);
    });
  }
  events.forEach((event) => element.addEventListener(event, check));
  return () => {
    stop();
    cancelAnimationFrame(frame);
  };
}

/**
 * Whether the video `element` returns has put a frame of `src` on screen. Until it has, its first
 * frame's picture belongs over it: a call to play() stops the browser painting the `poster`, and
 * iOS then paints nothing until a frame is decoded, which is black for as long as the clip loads.
 * `reset` starts the wait again for a source that is loaded anew.
 */
export function useFirstFrame(
  element: () => HTMLVideoElement | null | undefined,
  src: string | undefined,
) {
  const [shown, setShown] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const waiting = useRef<{
    video: HTMLVideoElement;
    src: string;
    round: number;
    cancel: () => void;
  } | null>(null);
  // After every render, since the element can mount later than its source is known; and before
  // the browser acts on a new source, so no frame of it is missed.
  useLayoutEffect(() => {
    const video = element() ?? null;
    const current = waiting.current;
    if (current?.video === video && current?.src === src && current?.round === round) return;
    current?.cancel();
    // Another source, or another element for the same one, has drawn nothing yet: a clip that
    // comes back after another was shown is loaded anew.
    setShown(null);
    if (!video || !src) {
      waiting.current = null;
      return;
    }
    let stop = onNextFrame(video, () => setShown(src));
    // The element dropped what it had loaded, as load() and a purge by the browser do.
    const emptied = () => {
      setShown(null);
      stop();
      stop = onNextFrame(video, () => setShown(src));
    };
    video.addEventListener('emptied', emptied);
    waiting.current = {
      video,
      src,
      round,
      cancel: () => {
        stop();
        video.removeEventListener('emptied', emptied);
      },
    };
  });
  useLayoutEffect(
    () => () => {
      waiting.current?.cancel();
      waiting.current = null;
    },
    [],
  );
  return {
    presented: src !== undefined && shown === src,
    reset: () => {
      setShown(null);
      setRound((current) => current + 1);
    },
  };
}

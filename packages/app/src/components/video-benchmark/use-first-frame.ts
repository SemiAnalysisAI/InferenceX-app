'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Calls `shown` once, when the video next puts a frame on screen, and returns the cancel. Without
 * `requestVideoFrameCallback` a frame counts as painted one paint after it is decoded.
 */
function onNextFrame(video: HTMLVideoElement, shown: () => void): () => void {
  if ('requestVideoFrameCallback' in video) {
    const id = video.requestVideoFrameCallback(() => shown());
    return () => video.cancelVideoFrameCallback(id);
  }
  const element: HTMLVideoElement = video;
  const events = ['loadeddata', 'seeked', 'timeupdate', 'playing'] as const;
  let frame = 0;
  const stop = () => events.forEach((event) => element.removeEventListener(event, check));
  function check() {
    if (frame !== 0 || element.readyState < 2 || element.seeking) return;
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
 * frame's picture belongs over it: play() stops the browser painting the `poster`, and iOS then
 * paints nothing until a frame is decoded, which is black for as long as the clip loads.
 */
export function useFirstFrame(
  element: () => HTMLVideoElement | null | undefined,
  src: string | undefined,
): boolean {
  const [shown, setShown] = useState<string | null>(null);
  const waiting = useRef<{ video: HTMLVideoElement; src: string; cancel: () => void } | null>(null);
  // After every render, since the element can mount later than its source is known; and before
  // the browser acts on a new source, so no frame of it is missed.
  useLayoutEffect(() => {
    const video = element() ?? null;
    const current = waiting.current;
    if (current?.video === video && current?.src === src) return;
    current?.cancel();
    waiting.current = null;
    // Another source, or another element for the same one, has drawn nothing yet.
    setShown(null);
    if (!video || !src) return;
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
      cancel: () => {
        stop();
        video.removeEventListener('emptied', emptied);
      },
    };
  });
  // Cleared, so effects that run again (a revealed `Activity`) subscribe again.
  useLayoutEffect(
    () => () => {
      waiting.current?.cancel();
      waiting.current = null;
    },
    [],
  );
  return src !== undefined && shown === src;
}

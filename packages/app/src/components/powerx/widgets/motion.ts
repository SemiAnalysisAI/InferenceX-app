'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/components/inference/replay/useReducedMotion';

const easeOutCubic = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export const stepProgress = (elapsedMs: number, delayMs: number, durationMs: number): number =>
  easeOutCubic((elapsedMs - delayMs) / durationMs);

/**
 * Milliseconds into a one-time build that starts when the ref's element first scrolls into view:
 * 0 before that, Infinity once it has played. A disabled build or reduced motion is Infinity.
 */
export function useBuildClock<T extends Element>(
  enabled: boolean,
  totalMs: number,
): [(node: T | null) => void, number] {
  const reduced = useReducedMotion();
  const [node, setNode] = useState<T | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const played = useRef(false);
  // A chip switch mid-build changes the length; the running build reads the latest one.
  const totalRef = useRef(totalMs);
  totalRef.current = totalMs;
  const skip = !enabled || reduced;

  useEffect(() => {
    if (skip || node === null || played.current) return undefined;
    let frame = 0;
    const play = () => {
      const start = performance.now();
      const tick = (now: number) => {
        if (now - start >= totalRef.current) {
          played.current = true;
          setElapsed(Number.POSITIVE_INFINITY);
          return;
        }
        setElapsed(now - start);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    if (typeof IntersectionObserver === 'undefined') {
      play();
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [skip, node]);

  return [setNode, skip ? Number.POSITIVE_INFINITY : elapsed];
}

/**
 * Eases each number from what is on screen to its new target, so a chip switch moves the drawing
 * instead of jumping it. The first render and reduced motion show the target.
 *
 * Pass `easeKey` when only some changes should ease: the values ease when `easeKey` changes and
 * snap to the target otherwise. A slider drag fires a new target on every input event; easing
 * each one restarts the animation from a value that is still catching up, so the drawing trails
 * the thumb for as long as it moves.
 */
export function useEasedValues<K extends string>(
  target: Record<K, number>,
  durationMs = 350,
  easeKey?: string,
): Record<K, number> {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<Partial<Record<K, number>>>(target);
  const shownRef = useRef<Partial<Record<K, number>>>(target);
  const keys = Object.keys(target) as K[];
  // The entries stand in for `target`, whose identity changes every render.
  const signature = Object.entries(target).join(';');
  // What the last effect ran for: a new target under the same `easeKey` snaps.
  const appliedRef = useRef({ signature, easeKey });
  const applied = appliedRef.current;
  const snap =
    reduced ||
    (easeKey !== undefined && easeKey === applied.easeKey && signature !== applied.signature);

  useEffect(() => {
    appliedRef.current = { signature, easeKey };
    const from = shownRef.current;
    const show = (values: Partial<Record<K, number>>) => {
      shownRef.current = values;
      setShown(values);
    };
    if (keys.every((key) => from[key] === target[key])) return undefined;
    if (snap) {
      show(target);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const eased = stepProgress(now - start, 0, durationMs);
      const next: Partial<Record<K, number>> = {};
      for (const key of keys) {
        const origin = from[key] ?? target[key];
        next[key] = origin + (target[key] - origin) * eased;
      }
      show(next);
      if (eased < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, easeKey, reduced, durationMs]);

  if (snap) return target;
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = shown[key] ?? target[key];
  return out;
}

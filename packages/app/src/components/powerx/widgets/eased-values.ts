'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/components/inference/replay/useReducedMotion';

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Eases each number from what is on screen to its new target, so a chip switch or a slider drag
 * moves the drawing instead of jumping it. The first render and reduced motion show the target.
 */
export function useEasedValues<K extends string>(
  target: Record<K, number>,
  durationMs = 350,
): Record<K, number> {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<Partial<Record<K, number>>>(target);
  const shownRef = useRef<Partial<Record<K, number>>>(target);
  const keys = Object.keys(target) as K[];
  // The entries stand in for `target`, whose identity changes every render.
  const signature = Object.entries(target).join(';');

  useEffect(() => {
    const from = shownRef.current;
    const show = (values: Partial<Record<K, number>>) => {
      shownRef.current = values;
      setShown(values);
    };
    if (reduced) {
      show(target);
      return undefined;
    }
    if (keys.every((key) => from[key] === target[key])) return undefined;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const eased = easeOutCubic(Math.min(1, (now - start) / durationMs));
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
  }, [signature, reduced, durationMs]);

  if (reduced) return target;
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = shown[key] ?? target[key];
  return out;
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export { useReducedMotion } from '@/components/inference/replay/useReducedMotion';
export { Reveal } from '@/components/motion/reveal';

/**
 * Motion for the /powerx/tutorial widgets: one rAF tween engine for numbers (bars, watt labels,
 * readouts) plus an in-view trigger. Stroke draws and fades are CSS (`[data-draw]`, `[data-fade]`
 * in motion.css) keyed off the same `data-inview` flag. Everything renders in its final state on
 * the server and under `prefers-reduced-motion`.
 */

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** The site's enter easing (`--motion-ease-enter`) in JS: fast start, long settle. */
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export interface TweenSpec {
  delayMs: number;
  durationMs: number;
  /** Where the build phase starts; omitted means the key snaps to its target. */
  from?: number;
}

export type TweenPhase = 'build' | 'update';
export type TweenPlan = (key: string, phase: TweenPhase) => TweenSpec;
export type TweenValues = Record<string, number>;

/** 0 before the delay, 1 at or after delay + duration; a zero duration is a step. */
export function tweenProgress(elapsedMs: number, spec: TweenSpec): number {
  if (spec.durationMs <= 0) return elapsedMs >= spec.delayMs ? 1 : 0;
  return clamp01((elapsedMs - spec.delayMs) / spec.durationMs);
}

export function tweenValue(from: number, to: number, elapsedMs: number, spec: TweenSpec): number {
  return from + (to - from) * easeOutCubic(tweenProgress(elapsedMs, spec));
}

/** When the last key settles. */
export function planDurationMs(specs: Record<string, TweenSpec>): number {
  return Math.max(0, ...Object.values(specs).map((spec) => spec.delayMs + spec.durationMs));
}

/** Every key of `to` at `elapsedMs`; keys missing from `from` start at their target. */
export function sampleTweens(
  from: TweenValues,
  to: TweenValues,
  specs: Record<string, TweenSpec>,
  elapsedMs: number,
): TweenValues {
  const out: TweenValues = {};
  for (const key of Object.keys(to)) {
    const spec = specs[key] ?? { delayMs: 0, durationMs: 0 };
    out[key] = tweenValue(from[key] ?? to[key], to[key], elapsedMs, spec);
  }
  return out;
}

/** The frame a build starts from: each key's `from`, or its target when it only snaps. */
export function startFrame(to: TweenValues, specs: Record<string, TweenSpec>): TweenValues {
  const out: TweenValues = {};
  for (const key of Object.keys(to)) out[key] = specs[key]?.from ?? to[key];
  return out;
}

const signatureOf = (values: TweenValues | null): string =>
  values === null
    ? ''
    : Object.keys(values)
        .map((key) => `${key}=${values[key]}`)
        .join('|');

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface UseTweensOptions {
  /** False holds the build's start frame; the build plays once this first turns true. */
  active?: boolean;
  /** True snaps every key to its target (reduced motion). */
  reduced?: boolean;
  plan: TweenPlan;
}

/**
 * Tweens every number in `target`. The first run while `active` is the build (per-key delays
 * and `from` values, so parts can appear in sequence); later target changes are updates that
 * interpolate from whatever is on screen. Server render and reduced motion show the target.
 */
export function useTweens(
  target: TweenValues | null,
  { active = true, reduced = false, plan }: UseTweensOptions,
): TweenValues {
  const [displayed, setDisplayed] = useState<TweenValues>(() => target ?? {});
  const shown = useRef<TweenValues>(target ?? {});
  const built = useRef(false);
  const planRef = useRef(plan);
  planRef.current = plan;
  const signature = signatureOf(target);

  useIsoLayoutEffect(() => {
    if (target === null) return undefined;
    const show = (values: TweenValues) => {
      shown.current = values;
      setDisplayed(values);
    };
    if (reduced) {
      built.current = true;
      show({ ...target });
      return undefined;
    }
    const phase: TweenPhase = built.current ? 'update' : 'build';
    const specs: Record<string, TweenSpec> = {};
    for (const key of Object.keys(target)) specs[key] = planRef.current(key, phase);
    if (!active) {
      show(startFrame(target, specs));
      return undefined;
    }
    const from = phase === 'build' ? startFrame(target, specs) : shown.current;
    const total = planDurationMs(specs);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // Only a build that painted counts: React's dev-mode effect replay cancels before a frame.
      built.current = true;
      const elapsed = now - start;
      show(sampleTweens(from, target, specs, elapsed));
      if (elapsed < total) frame = requestAnimationFrame(tick);
    };
    show(sampleTweens(from, target, specs, 0));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The signature stands in for `target`, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, active, reduced]);

  if (target === null) return displayed;
  if (reduced) return target;
  return { ...target, ...displayed };
}

export interface UseCountUpOptions {
  /** False holds 0 until the number should count. */
  active?: boolean;
  reduced?: boolean;
  delayMs?: number;
  durationMs?: number;
  /** How long a later change of `value` takes. */
  updateMs?: number;
}

/** One number that counts up from 0 on its first activation and eases between later values. */
export function useCountUp(
  value: number,
  {
    active = true,
    reduced = false,
    delayMs = 0,
    durationMs = 900,
    updateMs = 350,
  }: UseCountUpOptions = {},
): number {
  const shown = useTweens(
    { value },
    {
      active,
      reduced,
      plan: (_key, phase) =>
        phase === 'build' ? { delayMs, durationMs, from: 0 } : { delayMs: 0, durationMs: updateMs },
    },
  );
  return shown.value;
}

export interface UseInViewOptions {
  /** Stay true after the first intersection (the default). */
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
}

/**
 * [ref, inView]: attach the ref to the element to watch. True immediately where
 * IntersectionObserver is missing, so nothing can stay hidden.
 */
export function useInView<T extends Element = HTMLDivElement>({
  once = true,
  threshold = 0,
  rootMargin = '0px',
}: UseInViewOptions = {}): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (node === null) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting);
        if (hit) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, once, threshold, rootMargin]);
  return [setNode, inView];
}

/** `data-inview` for the CSS reveals: present only once the trigger fired. */
export const inViewAttr = (inView: boolean): 'true' | undefined => (inView ? 'true' : undefined);

/** The custom properties the CSS reveals read: stagger delay and, optionally, durations. */
export function motionVars({
  delayMs = 0,
  fadeMs,
  drawMs,
}: {
  delayMs?: number;
  fadeMs?: number;
  drawMs?: number;
}): React.CSSProperties {
  const vars: Record<string, string> = { '--motion-delay': `${delayMs}ms` };
  if (fadeMs !== undefined) vars['--motion-fade-duration'] = `${fadeMs}ms`;
  if (drawMs !== undefined) vars['--motion-draw-duration'] = `${drawMs}ms`;
  return vars as React.CSSProperties;
}

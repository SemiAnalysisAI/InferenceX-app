'use client';

import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import { EASE, MOTION, cssEase, reducedMotion } from './motion';

/**
 * Runs `run` just before React changes the page for a new `token`, while the page still shows
 * the old state. A height or a picture read there is the state the change starts from.
 */
export class BeforeCommit extends Component<{ token: unknown; run: () => void }> {
  override getSnapshotBeforeUpdate(previous: { token: unknown }): null {
    if (previous.token !== this.props.token) this.props.run();
    return null;
  }

  override componentDidUpdate(): void {
    // Required beside getSnapshotBeforeUpdate; the work is done there.
  }

  override render(): ReactNode {
    return null;
  }
}

/** Animates an element's height between two values, clipped while it runs. */
function easeHeight(element: HTMLElement, from: number, to: number): Animation | null {
  if (from === to || typeof element.animate !== 'function') return null;
  const { overflow } = element.style;
  element.style.overflow = 'clip';
  // Named while it runs, for a style or a test that has to wait for the element's full height.
  element.dataset.easing = '';
  const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
    // Space that closes goes a little faster than space that opens.
    duration: to > from ? MOTION.base : MOTION.fast,
    easing: cssEase(to > from ? EASE.enter : EASE.standard),
  });
  const restore = () => {
    element.style.overflow = overflow;
    delete element.dataset.easing;
  };
  animation.addEventListener('finish', restore);
  animation.addEventListener('cancel', restore);
  return animation;
}

/**
 * Eases an element to its new height when `token` changes what it holds: a drawer that opens
 * under a button, a row that shows more tiles. The height is read once before the change and
 * once after it; the content itself is not animated. The element is the returned `ref`'s, or
 * `target`'s when the element is not this component's to render. Render `before` beside it.
 */
export function useHeightEase<T extends HTMLElement>(
  token: unknown,
  target?: () => HTMLElement | null,
): { ref: RefObject<T | null>; before: ReactNode } {
  const ref = useRef<T>(null);
  const find = useRef(target);
  find.current = target;
  const from = useRef<{ element: HTMLElement; height: number } | null>(null);
  const read = useCallback(() => {
    const element = find.current ? find.current() : ref.current;
    from.current = element && !reducedMotion() ? { element, height: element.offsetHeight } : null;
  }, []);
  useLayoutEffect(() => {
    const start = from.current;
    from.current = null;
    if (!start?.element.isConnected) return undefined;
    const animation = easeHeight(start.element, start.height, start.element.offsetHeight);
    return () => animation?.cancel();
  }, [token]);
  return { ref, before: <BeforeCommit token={token} run={read} /> };
}

/**
 * How many times `token` has changed since the component mounted; 0 until the first change. A
 * null token is one that is not there yet: arriving at the first token is not a change, and
 * neither is a gap between two renders of the same one.
 */
export function useChanges(token: unknown): number {
  const last = useRef(token);
  const count = useRef(0);
  if (token !== null && last.current !== token) {
    if (last.current !== null) count.current += 1;
    last.current = token;
  }
  return count.current;
}

/** Marks a `<details>` whose opening and closing eases: `<details {...DISCLOSURE}>`. */
export const DISCLOSURE = { 'data-disclosure': '' } as const;

interface Easing {
  animation: Animation;
  closing: boolean;
}

/**
 * Eases every `<details data-disclosure>` under the returned element open and shut. A click on
 * its summary still opens it at once; the element grows from its closed height to its open one.
 * A close runs the other way and drops the `open` attribute when it ends, with `data-closing`
 * set meanwhile so the chevron turns at the click. Under reduced motion, and where the browser
 * cannot animate, the click is left alone.
 */
export function useDisclosureMotion<T extends HTMLElement>(): RefObject<T | null> {
  const root = useRef<T>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return undefined;
    const running = new WeakMap<HTMLDetailsElement, Easing>();
    /** The height each one had while closed, the last time it was seen closed, and its width then. */
    const closed = new WeakMap<HTMLDetailsElement, { width: number; height: number }>();
    const onClick = (event: MouseEvent) => {
      const summary = event.target instanceof Element ? event.target.closest('summary') : null;
      const details = summary?.parentElement;
      if (
        !summary ||
        !(details instanceof HTMLDetailsElement) ||
        !Object.hasOwn(details.dataset, 'disclosure') ||
        !host.contains(details) ||
        event.defaultPrevented ||
        reducedMotion() ||
        typeof details.animate !== 'function'
      )
        return;
      // A link or button inside the summary keeps its own click.
      if (event.target instanceof Element && event.target.closest('a, button, input') !== null)
        return;
      event.preventDefault();
      const current = running.get(details);
      const from = details.offsetHeight;
      const opening = !details.open || current?.closing === true;
      running.delete(details);
      current?.animation.cancel();
      if (opening) {
        if (!details.open) closed.set(details, { width: details.offsetWidth, height: from });
        delete details.dataset.closing;
        details.open = true;
        const animation = easeHeight(details, from, details.offsetHeight);
        if (animation) running.set(details, { animation, closing: false });
        return;
      }
      // Its closed height is the one it opened from; at another width, or opened by something
      // else, it is the summary's own box.
      const seen = closed.get(details);
      const edge =
        summary.getBoundingClientRect().bottom -
        details.getBoundingClientRect().top +
        (Number.parseFloat(getComputedStyle(summary).marginBottom) || 0);
      const animation = easeHeight(
        details,
        from,
        seen?.width === details.offsetWidth ? seen.height : edge,
      );
      const shut = () => {
        delete details.dataset.closing;
        details.open = false;
      };
      if (!animation) {
        shut();
        return;
      }
      details.dataset.closing = '';
      running.set(details, { animation, closing: true });
      animation.addEventListener('finish', () => {
        if (running.get(details)?.animation !== animation) return;
        running.delete(details);
        shut();
      });
    };
    host.addEventListener('click', onClick);
    return () => host.removeEventListener('click', onClick);
  }, []);
  return root;
}

/**
 * Touch-vs-mouse detection for chart hover handlers.
 *
 * Mobile browsers emulate hover for taps: a tap dispatches compatibility
 * `mouseover` / `mouseenter` / `mousemove` before `click`. iOS Safari also
 * treats any hover handler that reveals content (our hover tooltip switching
 * from `display: none` to `display: block`) as a "hover tap" and then drops
 * the `click`. On charts that meant a tap only ever showed the unpinned hover
 * tooltip: it never pinned, so the per-point metrics and the "View charts" /
 * "View logs" actions were unreachable on phones.
 *
 * Hover handlers call {@link isTouchCompatMouseEvent} and skip their
 * hover-only work for touch-derived events, so the tap reaches the `click`
 * handler that pins the tooltip.
 */

/** How long after a touch the following compatibility mouse events count as touch. */
const TOUCH_COMPAT_WINDOW_MS = 1000;

let lastTouchAt = Number.NEGATIVE_INFINITY;
let installed = false;

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const markTouch = () => {
  lastTouchAt = now();
};

const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') markTouch();
};

const onPointerMove = (event: PointerEvent) => {
  // A real mouse moving again ends the touch window on hybrid devices.
  if (event.pointerType === 'mouse') lastTouchAt = Number.NEGATIVE_INFINITY;
};

/** Install the document-level listeners once (idempotent, SSR-safe). */
export function installTouchInputTracking(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener('touchstart', markTouch, opts);
  document.addEventListener('pointerdown', onPointerDown, opts);
  document.addEventListener('pointermove', onPointerMove, opts);
}

interface SourceCapabilitiesLike {
  firesTouchEvents?: boolean;
}

/**
 * True when a mouse event is a compatibility event synthesized from a touch,
 * or the device has no hover-capable pointer at all.
 */
export function isTouchCompatMouseEvent(event?: Event | null): boolean {
  installTouchInputTracking();
  const capabilities = (event as { sourceCapabilities?: SourceCapabilitiesLike } | null)
    ?.sourceCapabilities;
  if (capabilities?.firesTouchEvents) return true;
  if (now() - lastTouchAt < TOUCH_COMPAT_WINDOW_MS) return true;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(hover: none)').matches;
  }
  return false;
}

/** Test-only reset. */
export function resetTouchInputTrackingForTests(): void {
  lastTouchAt = Number.NEGATIVE_INFINITY;
}

/**
 * Safe lanes for transient elements (toasts, the seal, flights).
 *
 * Before a transient element appears we measure what is on screen that must stay readable:
 * the actual text extents (not whole blocks), controls, chart canvases and SVGs, images.
 * We then slide a box of the needed size over the viewport and take the first spot that touches
 * none of them. If there is no such spot the caller skips the visual and keeps the live-region text.
 */

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const BLOCKERS =
  "button, a[href], input, select, textarea, canvas, svg:not([aria-hidden='true']), img:not(.oc-rain), [role='tab'], [role='slider'], [data-slot='select-trigger']";
const TEXT_ROOTS = 'body';
const MARGIN = 6;

function visible(rect: DOMRect | Box, vw: number, vh: number): boolean {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  return (
    width > 1 && height > 1 && rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh
  );
}

function collect(vw: number, vh: number, ignore?: Element | null): Box[] {
  const boxes: Box[] = [];
  const push = (rect: DOMRect | Box) => {
    if (!visible(rect, vw, vh)) return;
    boxes.push({
      left: rect.left - MARGIN,
      top: rect.top - MARGIN,
      right: rect.right + MARGIN,
      bottom: rect.bottom + MARGIN,
    });
  };

  for (const root of document.querySelectorAll(TEXT_ROOTS)) {
    if (ignore?.contains(root)) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let count = 0;
    for (let node = walker.nextNode(); node && count < 8000; node = walker.nextNode()) {
      count++;
      if (!node.nodeValue?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || ignore?.contains(parent)) continue;
      if (parent.closest('.oc-fx, .oc-toasts, .orange-chicken-scene, script, style')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) push(rect);
    }
  }
  for (const el of document.querySelectorAll(BLOCKERS)) {
    if (ignore?.contains(el) || el.closest('.oc-fx, .oc-toasts, .orange-chicken-scene')) continue;
    push(el.getBoundingClientRect());
  }
  // A chart card (plot, legend, empty and loading states) is never covered: reserve all of it.
  for (const fig of document.querySelectorAll(
    "figure[data-testid='chart-figure'], [data-testid='scatter-empty-state'], [data-slot='skeleton'][class*='h-[600px]']",
  )) {
    push(fig.getBoundingClientRect());
  }
  return boxes;
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Top edge of the page area below the sticky header. */
function topLimit(): number {
  const header = document.querySelector('header');
  const bottom = header ? header.getBoundingClientRect().bottom : 0;
  return Math.max(0, Math.min(bottom, 120)) + 8;
}

/**
 * Finds a spot of `width` x `height` (viewport pixels) that covers no text, control or chart.
 * Returns null when every position would cover something.
 */
export function pickLane(
  width: number,
  height: number,
  ignore?: Element | null,
): { left: number; top: number } | null {
  if (typeof window === 'undefined') return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (width > vw - 16 || height > vh - 16) return null;
  const boxes = collect(vw, vh, ignore);
  const minTop = topLimit();
  const xs = [
    Math.round((vw - width) / 2),
    vw - width - 12,
    12,
    ...Array.from({ length: 6 }, (_, i) => Math.round(12 + ((vw - width - 24) * (i + 1)) / 7)),
  ];
  for (let top = vh - height - 12; top >= minTop; top -= 12) {
    for (const left of xs) {
      const box = { left, top, right: left + width, bottom: top + height };
      if (!boxes.some((other) => overlap(box, other) > 0)) return { left, top };
    }
  }
  // Then the top of the page, scanning downward from the header.
  for (let top = minTop; top <= vh - height - 12; top += 12) {
    for (const left of xs) {
      const box = { left, top, right: left + width, bottom: top + height };
      if (!boxes.some((other) => overlap(box, other) > 0)) return { left, top };
    }
  }
  return null;
}

/** True when a box already placed on screen still covers no text, control or chart. */
export function laneIsClear(
  rect: { left: number; top: number; width: number; height: number },
  ignore?: Element | null,
): boolean {
  if (typeof window === 'undefined') return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box = {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
  if (box.left < 0 || box.top < 0 || box.right > vw || box.bottom > vh - 4) return false;
  return !collect(vw, vh, ignore).some((other) => overlap(box, other) > 0);
}

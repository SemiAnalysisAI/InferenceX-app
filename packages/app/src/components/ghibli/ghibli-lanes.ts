/**
 * Safe lanes for everything the theme shows for a moment: flights, toasts, peeks and choruses.
 *
 * The viewport is sampled on a coarse grid with `elementFromPoint`. A cell is blocked when the
 * page shows text, an image, a chart, an axis, a legend or a control there, or when it lies
 * inside one of those elements' boxes. Blocked cells grow by one cell so sprites keep a margin.
 * A transient element is only placed on free cells; when there are none, it is skipped.
 */

const CELL = 20;

/** Elements that carry meaning: never covered, not even for a moment. */
const CONTENT = [
  'svg[data-testid="d3-chart-svg"]',
  'canvas',
  'table',
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  '[role="combobox"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="slider"]',
  '[data-testid="chart-legend"]',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'dt',
  'dd',
  'figcaption',
  'blockquote',
  'pre',
  'code',
  'small',
  'strong',
  'em',
  'span',
  'img',
  'svg',
  'header',
  'nav',
].join(', ');

/** Elements whose boxes are blocked as a whole, gaps included. */
const BOXES = [
  'svg[data-testid="d3-chart-svg"]',
  'svg[data-testid*="chart"]',
  'svg[role="img"]',
  'table',
  '[data-testid="chart-legend"]',
  'button',
  'a[href]',
  'input',
  'select',
  '[role="combobox"]',
  '[role="tab"]',
  'header',
  'nav',
  'h1',
  'h2',
  'h3',
].join(', ');

/** The theme's own art: sprites may pass over it. */
const OWN_ART = '.ghibli-banner-wash, .ghibli-sky, .ghibli-footer-sea, .ghibli-card-still';

export interface Box {
  x: number;
  y: number;
}

export interface Lane {
  y: number;
  x0: number;
  x1: number;
}

function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) {
      return true;
    }
  }
  return false;
}

export class SafeMap {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  /** Summed-area table of blocked cells, (cols + 1) x (rows + 1). */
  private readonly sums: Uint32Array;

  constructor(ignore: Element, topInset: number, art: readonly Element[] = []) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    const raw = new Uint8Array(this.cols * this.rows);
    const mark = (left: number, top: number, right: number, bottom: number) => {
      const c0 = Math.max(0, Math.floor(left / CELL));
      const c1 = Math.min(this.cols - 1, Math.floor((right - 1) / CELL));
      const r0 = Math.max(0, Math.floor(top / CELL));
      const r1 = Math.min(this.rows - 1, Math.floor((bottom - 1) / CELL));
      for (let r = r0; r <= r1; r += 1)
        for (let c = c0; c <= c1; c += 1) raw[r * this.cols + c] = 1;
    };
    mark(0, 0, width, topInset);
    // The theme's own standing art (the film strip, the kodama): lines and flights pass it by.
    for (const el of art) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) mark(rect.left, rect.top, rect.right, rect.bottom);
    }
    for (const el of document.querySelectorAll(BOXES)) {
      if (ignore.contains(el) || el.closest(OWN_ART)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) continue;
      if (!el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) continue;
      mark(rect.left, rect.top, rect.right, rect.bottom);
    }
    // Two samples per cell, so a line of small text between samples is still caught.
    const seen = new Map<Element, boolean>();
    const isContent = (hit: Element | null): boolean => {
      if (!hit || ignore.contains(hit)) return false;
      const known = seen.get(hit);
      if (known !== undefined) return known;
      const result = !hit.closest(OWN_ART) && (hit.matches(CONTENT) || hasOwnText(hit));
      seen.set(hit, result);
      return result;
    };
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (raw[r * this.cols + c]) continue;
        const x = c * CELL + CELL / 2;
        if (
          isContent(document.elementFromPoint(x, r * CELL + CELL * 0.25)) ||
          isContent(document.elementFromPoint(x, r * CELL + CELL * 0.75))
        ) {
          raw[r * this.cols + c] = 2;
        }
      }
    }
    // Grow every blocked cell by one, for a margin around text and controls.
    this.blocked = new Uint8Array(raw.length);
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (!raw[r * this.cols + c]) continue;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) {
              this.blocked[rr * this.cols + cc] = 1;
            }
          }
        }
      }
    }
    const stride = this.cols + 1;
    this.sums = new Uint32Array(stride * (this.rows + 1));
    for (let r = 0; r < this.rows; r += 1) {
      let line = 0;
      for (let c = 0; c < this.cols; c += 1) {
        line += this.blocked[r * this.cols + c];
        this.sums[(r + 1) * stride + c + 1] = this.sums[r * stride + c + 1] + line;
      }
    }
  }

  /** Blocked cells in the cell range [c0, c1) x [r0, r1). */
  private count(c0: number, r0: number, c1: number, r1: number): number {
    const stride = this.cols + 1;
    return (
      this.sums[r1 * stride + c1] -
      this.sums[r0 * stride + c1] -
      this.sums[r1 * stride + c0] +
      this.sums[r0 * stride + c0]
    );
  }

  /** True when a box in viewport pixels covers no blocked cell and sits fully on screen. */
  free(left: number, top: number, width: number, height: number): boolean {
    if (left < 0 || top < 0) return false;
    const c0 = Math.floor(left / CELL);
    const r0 = Math.floor(top / CELL);
    const c1 = Math.ceil((left + width) / CELL);
    const r1 = Math.ceil((top + height) / CELL);
    if (c1 > this.cols || r1 > this.rows) return false;
    return this.count(c0, r0, c1, r1) === 0;
  }

  /** The free box of this size nearest to `prefer`, or null. */
  box(width: number, height: number, prefer: Box, within?: DOMRect): Box | null {
    const w = Math.ceil(width / CELL);
    const h = Math.ceil(height / CELL);
    let best: Box | null = null;
    let bestDistance = Infinity;
    for (let r = 0; r + h <= this.rows; r += 1) {
      for (let c = 0; c + w <= this.cols; c += 1) {
        if (within) {
          const x = c * CELL;
          const y = r * CELL;
          if (x < within.left || y < within.top) continue;
          if (x + w * CELL > within.right || y + h * CELL > within.bottom) continue;
        }
        if (this.count(c, r, c + w, r + h) !== 0) continue;
        const distance = Math.hypot(c * CELL - prefer.x, r * CELL - prefer.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x: c * CELL, y: r * CELL };
        }
      }
    }
    return best;
  }

  /**
   * The widest free horizontal run of this height, at least `minWidth` wide. `prefer` picks
   * between runs of similar width: the upper or the lower part of the screen.
   */
  lane(height: number, minWidth: number, prefer: 'top' | 'bottom' = 'top'): Lane | null {
    const h = Math.ceil(height / CELL);
    let best: Lane | null = null;
    let bestScore = -Infinity;
    for (let r = 0; r + h <= this.rows; r += 1) {
      let start = -1;
      for (let c = 0; c <= this.cols; c += 1) {
        const open = c < this.cols && this.count(c, r, c + 1, r + h) === 0;
        if (open && start < 0) start = c;
        if (!open && start >= 0) {
          const width = (c - start) * CELL;
          if (width >= minWidth) {
            const place = prefer === 'top' ? -r : r;
            const score = width + place * CELL * 0.5;
            if (score > bestScore) {
              bestScore = score;
              best = { y: r * CELL, x0: start * CELL, x1: c * CELL };
            }
          }
          start = -1;
        }
      }
    }
    return best;
  }
}

/** True when the page shows text, art or a control at this point (the layer is skipped). */
export function contentAt(x: number, y: number, ignore: Element): boolean {
  // The theme's own layer may sit on top (a toast takes pointer events): look beneath it.
  let hit = document.elementFromPoint(x, y);
  if (hit && ignore.contains(hit)) {
    hit = document.elementsFromPoint(x, y).find((el) => !ignore.contains(el)) ?? null;
  }
  if (!hit || hit.closest(OWN_ART)) return false;
  return hit.matches(CONTENT) || hasOwnText(hit) || hit.closest(BOXES) !== null;
}

/** Hit-tests a 4x4 grid across a box. */
export function coversContent(
  rect: { left: number; top: number; width: number; height: number },
  ignore: Element,
): boolean {
  for (const fx of [0.08, 0.36, 0.64, 0.92]) {
    for (const fy of [0.08, 0.36, 0.64, 0.92]) {
      if (contentAt(rect.left + rect.width * fx, rect.top + rect.height * fy, ignore)) return true;
    }
  }
  return false;
}

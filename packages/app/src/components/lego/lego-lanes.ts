// Safe lanes. Everything the theme shows for a moment (a caption, a cameo, a stud shower, the
// rescue lifeline) first asks where the page is empty. The survey marks what a visitor reads or
// uses in the viewport: every line of text, every control, picture, table and the whole card of
// a chart. A transient element is placed in a rectangle that touches none of it, or not shown.

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Spot {
  left: number;
  top: number;
}

export interface Lanes {
  /**
   * Top-left corner of a free rectangle of this size, the one nearest to `aim`. Rectangles in
   * the open (between cards, in the page margins) come first; with `inside`, the blank part of
   * a card that holds no chart is the second choice.
   */
  find: (
    width: number,
    height: number,
    aim: { x: number; y: number },
    inside?: boolean,
  ) => Spot | null;
  /** True when nothing a visitor reads or uses is under this rectangle. */
  isFree: (box: Box, inside?: boolean) => boolean;
  /** Take a rectangle out of the free space (the theme's own figure, say). */
  block: (box: Box, pad?: number) => void;
  /** Left edges of the strips of this width that are free from the header to the bottom. */
  columns: (width: number) => Strip[];
}

const CELL = 2;
const CONTROL =
  "a, button, input, select, textarea, label, summary, [role='tab'], [role='button'], [role='switch'], [role='combobox'], [role='slider'], [tabindex]:not([tabindex='-1'])";
// A notice strip counts whole, blank middle included: a caption must not sit on a disclaimer.
const SOLID = `img, svg, canvas, video, table, [role='note'], [role='alert'], ${CONTROL}`;
const CHART = 'svg[data-testid="d3-chart-svg"], table, canvas';
const CARD = "[data-slot='card'], [data-slot='control-panel']";

/** An empty strip of the page under the header, and how far down it stays empty. */
export interface Strip {
  left: number;
  top: number;
  bottom: number;
}

export function surveyLanes(): Lanes {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  /** 1: a card's blank inside. 2: text, a control, a picture, a chart card. */
  const cells = new Uint8Array(cols * rows);
  let sums: [Int32Array, Int32Array] | null = null;

  const mark = (box: Box, level: 1 | 2, pad: number, under = pad) => {
    const c0 = Math.max(0, Math.floor((box.left - pad) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((box.right + pad) / CELL));
    const r0 = Math.max(0, Math.floor((box.top - pad) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((box.bottom + under) / CELL));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const at = row * cols + col;
        if (cells[at] < level) cells[at] = level;
      }
    }
    sums = null;
  };

  const header = document.querySelector('header')?.getBoundingClientRect();
  const roof = Math.max(0, header?.bottom ?? 0);
  if (header) mark({ left: 0, right: width, top: 0, bottom: roof }, 2, 2);

  const range = document.createRange();
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
        const element = node as Element;
        if (element.classList.contains('lego-scene')) return NodeFilter.FILTER_REJECT;
        const box = element.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) {
          // No box of its own: hidden, or `display: contents` with children that do have one.
          return getComputedStyle(element).display === 'none'
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP;
        }
        if (box.bottom < 0 || box.top > height || box.right < 0 || box.left > width) {
          return NodeFilter.FILTER_REJECT;
        }
        if (element.matches(SOLID)) {
          mark(box, 2, 5);
          return NodeFilter.FILTER_REJECT;
        }
        if (element.matches(CARD)) {
          // A card's hard shadow hangs six pixels under it.
          if (element.querySelector(CHART)) {
            mark(box, 2, 2, 7);
            return NodeFilter.FILTER_REJECT;
          }
          mark(box, 1, 2, 7);
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );
  while (walker.nextNode()) {
    range.selectNodeContents(walker.currentNode);
    for (const box of range.getClientRects()) {
      if (box.width > 0 && box.height > 0) mark(box, 2, 5);
    }
  }

  /** Summed-area tables: how many cells at or above each level lie left of and above a cell. */
  const tables = (): [Int32Array, Int32Array] => {
    if (sums) return sums;
    const stride = cols + 1;
    const soft = new Int32Array(stride * (rows + 1));
    const hard = new Int32Array(stride * (rows + 1));
    for (let row = 0; row < rows; row++) {
      let softRun = 0;
      let hardRun = 0;
      for (let col = 0; col < cols; col++) {
        const level = cells[row * cols + col];
        if (level >= 1) softRun++;
        if (level >= 2) hardRun++;
        const at = (row + 1) * stride + col + 1;
        soft[at] = soft[at - stride] + softRun;
        hard[at] = hard[at - stride] + hardRun;
      }
    }
    sums = [soft, hard];
    return sums;
  };

  const count = (table: Int32Array, c0: number, r0: number, c1: number, r1: number) => {
    const stride = cols + 1;
    return (
      table[(r1 + 1) * stride + c1 + 1] -
      table[r0 * stride + c1 + 1] -
      table[(r1 + 1) * stride + c0] +
      table[r0 * stride + c0]
    );
  };

  const isFree = (box: Box, inside = false) => {
    if (box.left < 0 || box.top < roof || box.right > width || box.bottom > height) return false;
    const c0 = Math.floor(box.left / CELL);
    const c1 = Math.min(cols - 1, Math.floor((box.right - 0.01) / CELL));
    const r0 = Math.floor(box.top / CELL);
    const r1 = Math.min(rows - 1, Math.floor((box.bottom - 0.01) / CELL));
    return count(tables()[inside ? 1 : 0], c0, r0, c1, r1) === 0;
  };

  const search = (w: number, h: number, aim: { x: number; y: number }, table: Int32Array) => {
    const spanCols = Math.ceil(w / CELL);
    const spanRows = Math.ceil(h / CELL);
    const firstRow = Math.ceil((roof + 2) / CELL);
    const lastRow = Math.floor((height - 4) / CELL) - spanRows;
    const firstCol = 1;
    const lastCol = Math.floor((width - 4) / CELL) - spanCols;
    let best: Spot | null = null;
    let bestCost = Infinity;
    for (let row = firstRow; row <= lastRow; row++) {
      const dy = row * CELL + h / 2 - aim.y;
      // A line of text is easier to follow sideways than up or down the page.
      const rowCost = dy * dy * 1.6;
      if (rowCost >= bestCost) continue;
      for (let col = firstCol; col <= lastCol; col++) {
        const dx = col * CELL + w / 2 - aim.x;
        const cost = rowCost + dx * dx;
        if (cost >= bestCost) continue;
        if (count(table, col, row, col + spanCols - 1, row + spanRows - 1) > 0) continue;
        best = { left: col * CELL, top: row * CELL };
        bestCost = cost;
      }
    }
    return best;
  };

  return {
    find(w, h, aim, inside = false) {
      if (w <= 0 || h <= 0) return null;
      const [soft, hard] = tables();
      return search(w, h, aim, soft) ?? (inside ? search(w, h, aim, hard) : null);
    },
    isFree,
    block(box, pad = 4) {
      mark(box, 2, pad);
    },
    columns(strip) {
      const table = tables()[0];
      const span = Math.ceil(strip / CELL);
      const r0 = Math.floor((roof + 2) / CELL) + 1;
      const least = Math.floor((height * 0.45) / CELL);
      const out: Strip[] = [];
      for (let col = 0; col + span <= cols; col += span) {
        // How far down this strip stays empty: halve the search until the blocked row is found.
        let low = r0;
        let high = rows - 1;
        if (count(table, col, r0, col + span - 1, high) > 0) {
          while (low < high) {
            const mid = (low + high) >> 1;
            if (count(table, col, r0, col + span - 1, mid) > 0) high = mid;
            else low = mid + 1;
          }
          high = low - 1;
        }
        if (high - r0 >= least)
          out.push({ left: col * CELL, top: r0 * CELL, bottom: (high + 1) * CELL });
      }
      return out;
    },
  };
}

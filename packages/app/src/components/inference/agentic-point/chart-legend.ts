/**
 * Legend layout for the hand-rolled agentic point-detail charts.
 *
 * Those charts are plain SVG inside a fixed viewBox that scales to the card
 * width, so there is no DOM to measure text against at layout time. The legend
 * used to sit on an equal-width grid (`innerW / itemCount`), which collides as
 * soon as the labels are longer than their slot — the inline 720-unit render of
 * the KV-cache chart packs eleven per-engine series into ~58 units each and the
 * labels overprint one another.
 *
 * Instead we estimate each label's advance width from its characters and pack
 * items greedily into as many rows as they need. Estimates are deliberately a
 * little generous: over-estimating wraps one item early, under-estimating
 * reintroduces the overlap this module exists to prevent.
 */

/** Font size the chart legends render at. */
export const LEGEND_FONT_SIZE = 11;

/** Baseline-to-baseline distance between wrapped legend rows. */
export const LEGEND_ROW_HEIGHT = 14;

/** x offset from an item's origin to the start of its color swatch. */
export const LEGEND_SWATCH_INSET = 2;

/** Width of the color swatch (line segment or filled rect). */
export const LEGEND_SWATCH_WIDTH = 12;

/** x offset from an item's origin to the start of its text. */
export const LEGEND_TEXT_OFFSET = 18;

/** Horizontal gap between two legend items on the same row. */
export const LEGEND_ITEM_GAP = 12;

/** Distance from the bottom of the viewBox to the last legend row's baseline. */
export const LEGEND_BASELINE_OFFSET = 8;

// Fullwidth scripts (CJK ideographs, kana, Hangul, fullwidth forms) advance
// roughly one em per character rather than the ~0.5em of Latin lowercase.
const FULLWIDTH =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

// Character classes, in em units at the legend font size. Sampled against the
// app's sans stack and rounded up.
const NARROW_CHARS = new Set(" .,:;!|'`ijltfr()[]{}/\\-");
const WIDE_CHARS = new Set('mwMW@%');
const UPPER_OR_DIGIT = /[A-Z0-9$#]/u;

const EM_FULLWIDTH = 1;
const EM_NARROW = 0.34;
const EM_WIDE = 0.88;
const EM_UPPER_OR_DIGIT = 0.62;
const EM_DEFAULT = 0.53;

/**
 * Approximate rendered width of `text` in viewBox units.
 *
 * Not exact — SVG text has no measurable width until it is in the document —
 * but consistently at or slightly above the real advance width, which is the
 * side to err on for collision avoidance.
 */
export function estimateTextWidth(text: string, fontSize: number = LEGEND_FONT_SIZE): number {
  let em = 0;
  for (const ch of text) {
    if (FULLWIDTH.test(ch)) em += EM_FULLWIDTH;
    else if (NARROW_CHARS.has(ch)) em += EM_NARROW;
    else if (WIDE_CHARS.has(ch)) em += EM_WIDE;
    else if (UPPER_OR_DIGIT.test(ch)) em += EM_UPPER_OR_DIGIT;
    else em += EM_DEFAULT;
  }
  return em * fontSize;
}

/** Placement of one legend item within the wrapped legend block. */
export interface LegendItemLayout {
  /** x of the item's origin, relative to the left edge of the plot area. */
  x: number;
  /** 0-based row the item was packed into; row 0 is the topmost. */
  row: number;
}

export interface LegendLayout {
  items: LegendItemLayout[];
  /** Number of rows the legend occupies. At least 1, even when empty. */
  rows: number;
  /**
   * Vertical space, in viewBox units, the legend needs beyond the single row
   * the chart already reserves in its bottom padding. Charts add this to both
   * their height and their bottom padding so the plot area is unchanged and
   * the extra rows extend the SVG downward.
   */
  extraHeight: number;
}

/**
 * Pack legend labels into rows no wider than `availableWidth`.
 *
 * A label wider than the whole row still gets its own row rather than being
 * dropped — a clipped label is more useful than a missing one.
 */
export function layoutChartLegend(
  labels: readonly string[],
  availableWidth: number,
  fontSize: number = LEGEND_FONT_SIZE,
): LegendLayout {
  const items: LegendItemLayout[] = [];
  let row = 0;
  let cursor = 0;

  for (const label of labels) {
    const itemWidth = LEGEND_TEXT_OFFSET + estimateTextWidth(label, fontSize);
    if (cursor > 0 && cursor + itemWidth > availableWidth) {
      row += 1;
      cursor = 0;
    }
    items.push({ x: cursor, row });
    cursor += itemWidth + LEGEND_ITEM_GAP;
  }

  const rows = items.length === 0 ? 1 : row + 1;
  return { items, rows, extraHeight: (rows - 1) * LEGEND_ROW_HEIGHT };
}

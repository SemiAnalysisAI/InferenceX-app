/**
 * Opacity decisions for the in-chart label overlays (line labels + parallelism
 * labels) rendered by `ScatterGraph`. Extracted as pure helpers so the
 * visibility invariant is unit-testable independent of the D3 render.
 *
 * Why this exists (GH #470): with a single precision selected the chart
 * de-duplicates line labels to **one per hardware type** — e.g. the
 * `b300_sglang_fp4`, `b300_sglang_fp8` and `b300_sglang_bf16` curves all share
 * the label text "B300 (SGLang)", so only one is kept (`visible: true`) and the
 * rest are hidden (`visible: false`). The render writes that decision to a
 * `data-visible` attribute on each `.line-label`.
 *
 * The bug: several visibility-sync code paths (legend hover, hover-end, and the
 * filter-change effect) re-derived line-label opacity from hardware membership
 * **alone**, ignoring `data-visible`. Because every duplicate carries the same
 * `data-hw-key` (e.g. `b300_sglang`), all of them got re-shown — stacking three
 * identical "B300 (SGLang)" labels on the curve. These helpers fold the
 * `data-visible` flag back into every decision so hidden duplicates stay hidden.
 *
 * Parallelism labels carry a `data-precision` attribute and intentionally have
 * no `data-visible` gate (multiple segments per curve are expected); they take
 * the precision branch and are unaffected.
 */

export interface LabelAttrs {
  /** `data-hw-key` — base hardware key, shared across a hw's curves. */
  hwKey?: string;
  /** `data-precision` — set on parallelism labels, absent on line labels. */
  precision?: string;
  /** `data-visible` — `'1'`/`'0'`; only line labels set this. */
  visible?: string;
}

/** True unless the render explicitly hid this label (`data-visible="0"`). */
const renderKept = (attrs: LabelAttrs): boolean => attrs.visible !== '0';

/**
 * Opacity for a label while a legend row is hovered. Line/parallelism labels
 * whose hardware matches the hovered row light up — but a label the render hid
 * (a de-duplicated duplicate) stays hidden.
 */
export const labelOpacityForHover = (attrs: LabelAttrs, hoveredHwKey: string): 0 | 1 => {
  if (!attrs.hwKey) return 0;
  if (!renderKept(attrs)) return 0;
  return attrs.hwKey === hoveredHwKey ? 1 : 0;
};

/**
 * Steady-state opacity (no hover): used by both the hover-end reset and the
 * filter-change sync effect. Line labels (no precision) show when their
 * hardware is active **and** the render kept them; parallelism labels show when
 * their hardware is active and their precision is selected.
 */
export const labelOpacityForActiveState = (
  attrs: LabelAttrs,
  activeHwTypes: ReadonlySet<string>,
  selectedPrecisions: readonly string[],
): 0 | 1 => {
  const { hwKey, precision } = attrs;
  if (!hwKey) return 0;
  if (!precision) {
    return activeHwTypes.has(hwKey) && renderKept(attrs) ? 1 : 0;
  }
  return activeHwTypes.has(hwKey) && selectedPrecisions.includes(precision) ? 1 : 0;
};

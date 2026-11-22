/**
 * Compare at: the one interactivity (tok/s/user) PowerX reads at. The Breakdown bars and
 * the Over time trace follow it. It lives in the URL as `i_at`; the default (80) leaves
 * the parameter out.
 */
export const POWERX_COMPARE_AT_DEFAULT = 80;
export const POWERX_COMPARE_AT_PRESETS = [50, 80, 130, 200] as const;
/** The slider's bounds when no data range is known yet. */
export const POWERX_COMPARE_AT_MIN = 5;
export const POWERX_COMPARE_AT_MAX = 400;

/** `i_at` → tok/s/user. Missing, malformed or non-positive values read as the default. */
export function parsePowerXCompareAt(raw: string | null | undefined): number {
  if (!raw) return POWERX_COMPARE_AT_DEFAULT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return POWERX_COMPARE_AT_DEFAULT;
  return clampPowerXCompareAt(value);
}

/** Whole tok/s/user inside the slider bounds. */
export function clampPowerXCompareAt(value: number): number {
  return Math.min(POWERX_COMPARE_AT_MAX, Math.max(1, Math.round(value)));
}

/** tok/s/user → `i_at`; the default writes nothing. */
export function serializePowerXCompareAt(value: number): string {
  const clamped = clampPowerXCompareAt(value);
  return clamped === POWERX_COMPARE_AT_DEFAULT ? '' : String(clamped);
}

/**
 * The interactivity range every GPU can be read at: the overlap of the per-GPU ranges, or
 * the full span when they do not overlap. Null when no GPU has a positive value.
 */
export function powerXCoveredRange(
  perGpu: readonly (readonly number[])[],
): readonly [number, number] | null {
  const ranges = perGpu
    .map((values) => values.filter((value) => Number.isFinite(value) && value > 0))
    .filter((values) => values.length > 0)
    .map((values) => [Math.min(...values), Math.max(...values)] as const);
  if (ranges.length === 0) return null;
  const lo = Math.max(...ranges.map(([min]) => min));
  const hi = Math.min(...ranges.map(([, max]) => max));
  if (lo <= hi) return [lo, hi];
  return [Math.min(...ranges.map(([min]) => min)), Math.max(...ranges.map(([, max]) => max))];
}

/**
 * The Compare at every tab reads. An explicit pick (from `i_at` or a control) is kept as is;
 * the default (80) clamps into the range the visible GPUs cover, so a model whose sweep
 * never reaches 80 tok/s/user still reads at a real point.
 */
export function resolvePowerXCompareAt(
  value: number,
  explicit: boolean,
  range: readonly [number, number] | null,
): number {
  if (explicit || !range) return value;
  const [lo, hi] = range;
  return clampPowerXCompareAt(Math.min(Math.max(value, lo), hi));
}

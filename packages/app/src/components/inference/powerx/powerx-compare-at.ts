/**
 * Compare at: the one interactivity (tok/s/user) every PowerX tab reads at. The ranking,
 * the Breakdown bars, the Over time trace and the orange reading line all follow it. It
 * lives in the URL as `i_at`; the default (80) leaves the parameter out.
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

/** The item whose x is closest to `at` on a log scale (interactivity spans decades). */
export function nearestByInteractivity<T>(
  items: readonly T[],
  at: number,
  x: (item: T) => number,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const value = x(item);
    if (!(value > 0)) continue;
    const distance = Math.abs(Math.log(value / at));
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

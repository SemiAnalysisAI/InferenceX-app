import type { CSSProperties } from 'react';

import type { FrameworkReleases } from '@/lib/api';

/** Map framework variants to their base framework for release lookup. */
export const FRAMEWORK_TO_BASE: Record<string, string> = {
  vllm: 'vllm',
  sglang: 'sglang',
  'dynamo-sglang': 'sglang',
  'llmd-vllm': 'vllm',
  'mori-sglang': 'sglang',
};

/** Collapse framework variants into the engine family used by the UI filter. */
export function baseFramework(framework: string): string {
  const mapped = FRAMEWORK_TO_BASE[framework];
  if (mapped) return mapped;
  if (framework.startsWith('dynamo-')) return framework.slice('dynamo-'.length);
  if (framework.startsWith('mori-')) return framework.slice('mori-'.length);
  return framework;
}

/**
 * Substrings that mark an image tag as unstable / pre-release. Lowercased
 * comparison — kept here (not inlined) so tests can re-import and stay in
 * sync with the runtime classifier.
 */
export const UNSTABLE_PATTERNS = ['nightly', 'rocm/sgl-dev', 'sglang-rocm'];

/** Age past which the cell is rendered at max red — anything older looks identical. */
export const AGE_MAX_RED_DAYS = 60;

/** Whole-day delta between today (UTC) and an ISO date string (YYYY-MM-DD). */
export function daysSince(dateStr: string, today: Date): number {
  const submitted = new Date(`${dateStr}T00:00:00Z`).getTime();
  const ms = today.getTime() - submitted;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Inline style for the Days-Since-Update cell so older rows scream louder
 * visually. Ramps from a subtle red at 1 day to deep red at 60 days (then
 * clamps); 0-day rows return `undefined` so the cell falls back to the
 * muted-foreground class.
 */
export function ageColorStyle(days: number): CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  // Perceptually-uniform OKLCH ramp at hue 25 (red): lightness drops as
  // chroma rises, so the cell goes from light pink to saturated dark red.
  const L = 0.78 - 0.28 * t;
  const C = 0.12 + 0.12 * t;
  return { color: `oklch(${L.toFixed(3)} ${C.toFixed(3)} 25)` };
}

/**
 * Companion to ageColorStyle for the whole row's background tint — same
 * 1d → 60d ramp but expressed as a low-alpha fill so the row content stays
 * readable. 0-day rows return undefined so the row falls back to its
 * hover-only class background.
 */
export function ageRowStyle(days: number): CSSProperties | undefined {
  if (days < 1) return undefined;
  const t = Math.min(AGE_MAX_RED_DAYS, days) / AGE_MAX_RED_DAYS;
  // Alpha tops out around 0.28 — enough that 60d+ rows are unmistakably
  // tinted without drowning out the text or competing with hover affordance.
  const alpha = (0.04 + 0.24 * t).toFixed(3);
  return { backgroundColor: `oklch(0.60 0.22 25 / ${alpha})` };
}

/** Check if the image tag is outdated or uses an unstable/dev image. */
export function isOutdated(image: string, actualLatest: string | null): boolean {
  const lower = image.toLowerCase();
  if (UNSTABLE_PATTERNS.some((p) => lower.includes(p))) return true;
  if (!actualLatest) return false;
  return !image.includes(actualLatest);
}

export function getActualLatestTag(
  framework: string,
  releases: FrameworkReleases | undefined,
): string | null {
  if (!releases) return null;
  const base = FRAMEWORK_TO_BASE[framework];
  if (!base) return null;
  return releases[base] ?? null;
}

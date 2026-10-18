import { comparablePoints, comparePointKey } from './compare';
import type { VideoPoint } from './metrics';

/** Reader choices for the compare panel; a null hardware means "the default for the loaded points". */
export interface VideoCompareSelection {
  baseline: string | null;
  candidate: string | null;
  /** 0-based index into the matched case list. */
  caseIndex: number;
}

export interface ComparePair {
  baseline: string | null;
  candidate: string | null;
}

export const DEFAULT_VIDEO_COMPARE_SELECTION: VideoCompareSelection = {
  baseline: null,
  candidate: null,
  caseIndex: 0,
};

const POINT_KEY = /^[a-z0-9][a-z0-9-]{0,31}(?::(?:sglang|vllm-omni):[a-f0-9]{40})?$/u;
const CASE_INDEX = /^\d{1,4}$/u;

/** Slowest measured C1 hardware (highest P50) as baseline, fastest as candidate. */
export function defaultComparePair(points: VideoPoint[]): ComparePair {
  const measured = comparablePoints(points);
  if (measured.length < 2)
    return { baseline: comparePointKey(measured[0] ?? null), candidate: null };
  let slowest = measured[0];
  let fastest = measured[0];
  for (const point of measured) {
    if ((point.p50 ?? 0) > (slowest.p50 ?? 0)) slowest = point;
    if ((point.p50 ?? 0) < (fastest.p50 ?? 0)) fastest = point;
  }
  return { baseline: comparePointKey(slowest), candidate: comparePointKey(fastest) };
}

/** `v_base`, `v_cand` and `v_case` live beside the dashboard's other `v_` params; unknown values read as defaults. */
export function readVideoCompareSelection(search: string): VideoCompareSelection {
  const p = new URLSearchParams(search);
  const key = (value: string | null) => (value !== null && POINT_KEY.test(value) ? value : null);
  const index = p.get('v_case');
  return {
    baseline: key(p.get('v_base')),
    candidate: key(p.get('v_cand')),
    caseIndex: index !== null && CASE_INDEX.test(index) ? Number(index) : 0,
  };
}

/** Resolve choices against the loaded points; a hardware without a measured C1 cell falls back to the default. */
export function resolveCompareSelection(
  selection: VideoCompareSelection,
  points: VideoPoint[],
): { baseline: VideoPoint | null; candidate: VideoPoint | null; caseIndex: number } {
  const measured = comparablePoints(points);
  const defaults = defaultComparePair(points);
  const find = (key: string | null) =>
    key === null
      ? null
      : (measured.find((point) => comparePointKey(point) === key) ??
        measured.find((point) => point.hardwareKey === key) ??
        null);
  const chosen = { baseline: find(selection.baseline), candidate: find(selection.candidate) };
  let baseline = chosen.baseline ?? find(defaults.baseline);
  let candidate = chosen.candidate ?? find(defaults.candidate);
  if (baseline && candidate && comparePointKey(baseline) === comparePointKey(candidate)) {
    // Choosing the other side's hardware in the panel swaps the two sides, so a side that
    // defaulted onto the chosen hardware moves to the other default; two equal explicit sides
    // keep the baseline. Any still-equal pair takes the first other measured hardware.
    const shared = comparePointKey(baseline);
    const differing = (point: VideoPoint | null) =>
      point && comparePointKey(point) !== shared ? point : null;
    const other = measured.find((point) => comparePointKey(point) !== shared) ?? null;
    if (chosen.candidate && !chosen.baseline)
      baseline = differing(find(defaults.candidate)) ?? other;
    else
      candidate =
        differing(find(defaults.candidate)) ?? differing(find(defaults.baseline)) ?? other;
  }
  return { baseline, candidate, caseIndex: selection.caseIndex };
}

/** Returns a new URL with defaults omitted; the input URL is not mutated. */
export function writeVideoCompareSelection(
  url: URL,
  resolved: VideoCompareSelection,
  defaults: ComparePair,
): URL {
  const out = new URL(url);
  const set = (key: string, value: string | null) =>
    value === null ? out.searchParams.delete(key) : out.searchParams.set(key, value);
  set('v_base', resolved.baseline === defaults.baseline ? null : resolved.baseline);
  set('v_cand', resolved.candidate === defaults.candidate ? null : resolved.candidate);
  set('v_case', resolved.caseIndex > 0 ? String(resolved.caseIndex) : null);
  return out;
}

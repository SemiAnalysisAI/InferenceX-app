import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { getCostField } from './interpolation';
import type { CostProvider, CostType, GPUDataPoint } from './types';
import type { GroupMeta, OverlayGroupMeta } from './useThroughputData';

/**
 * First-token limits: the cheapest *measured* configuration per vendor that
 * clears an interactivity floor while keeping time-to-first-token under a cap.
 *
 * This deliberately reads measured rows, not the interpolated Pareto frontier
 * the calculator uses. A TTFT cap is a hard operating constraint, and the
 * frontier only tracks throughput against interactivity — a knot that
 * interpolates cheaply at the target may sit between two rows whose first-token
 * waits are seconds apart. Reading rows keeps every bar a configuration that
 * actually ran under both constraints at once, which is also what an article
 * can cite: a run URL, not a spline.
 *
 * The interactivity and TTFT filters are separate percentile statistics on the
 * same row. Passing both says the row's p90 streaming speed and its p90 first
 * token both cleared their bars, not that every individual request did.
 */

/** Default TTFT ladder, in seconds. */
export const DEFAULT_FIRST_TOKEN_CAPS: readonly number[] = [2, 5, 10, 15, 20];

/** Hard ceiling on ladder length so a pasted URL cannot render hundreds of groups. */
export const MAX_FIRST_TOKEN_CAPS = 8;

/**
 * Interactivity floor the page opens on. AgentX publishes its cost comparisons
 * at 150 tok/s/user; fixed sequences are read at the calculator's default.
 */
export const DEFAULT_FIRST_TOKEN_MIN_INTERACTIVITY = { agentic: 150, fixed: 35 } as const;

/**
 * Parse a comma-separated ladder such as `2,5,10`. Values are de-duplicated,
 * sorted ascending, and capped at {@link MAX_FIRST_TOKEN_CAPS}. Returns null
 * when nothing usable remains, so callers can fall back to the default.
 */
export function parseFirstTokenCaps(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const caps = new Set<number>();
  for (const part of raw.split(',')) {
    const value = Number.parseFloat(part.trim());
    if (Number.isFinite(value) && value > 0) caps.add(value);
  }
  if (caps.size === 0) return null;
  return [...caps].toSorted((a, b) => a - b).slice(0, MAX_FIRST_TOKEN_CAPS);
}

export function formatFirstTokenCaps(caps: readonly number[]): string {
  return caps.join(',');
}

/** Chinese label of the median statistic; percentiles stay `P90` / `P75`. */
export const ZH_MEDIAN = '中位数';

/**
 * Chinese names a statistic differently for the median and for a percentile:
 * the median follows its noun (`交互性中位数`, `TTFT 中位数`) while a percentile
 * precedes it (`P90 交互性`), the way the rest of the site writes them. `before`
 * is the text the phrase continues; a space separates the two only when the
 * phrase begins with Latin text, matching the site's CJK/Latin spacing.
 */
export function zhStatPhrase(noun: string, stat: string, before = ''): string {
  const phrase =
    stat === ZH_MEDIAN
      ? `${noun}${/[A-Za-z]$/u.test(noun) ? ' ' : ''}${ZH_MEDIAN}`
      : `${stat} ${noun}`;
  const gap = before !== '' && /^[A-Za-z]/u.test(phrase) ? ' ' : '';
  return `${before}${gap}${phrase}`;
}

/** Vendors shown first, in this order; any other vendor follows alphabetically. */
const VENDOR_ORDER = ['NVIDIA', 'AMD'];

export const UNKNOWN_VENDOR = 'Other';

/** Vendor for a hardware key — `b200_dynamo-sglang` → `NVIDIA`. */
export function hardwareVendor(hwKey: string): string {
  const base = hwKey.split(/[-_]/u)[0];
  return HW_REGISTRY[base]?.vendor ?? UNKNOWN_VENDOR;
}

export function compareVendors(a: string, b: string): number {
  const ia = VENDOR_ORDER.indexOf(a);
  const ib = VENDOR_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) {
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  }
  return a.localeCompare(b);
}

/** One bar family: a vendor's official rows, or one unofficial run's rows. */
export interface FirstTokenSeries {
  /** `vendor:<name>` for official series, `run:<index>` for overlays. */
  key: string;
  label: string;
  vendor?: string;
  runIndex?: number;
}

/** The configuration a bar stands for. */
export interface FirstTokenWinner {
  seriesKey: string;
  hwKey: string;
  vendor: string;
  precision: string;
  /** $/M tokens at the selected pricing tier and token type. */
  cost: number;
  /** Seconds, at the percentile the page reads. */
  ttft: number;
  /** tok/s/user, at the percentile the page reads. */
  interactivity: number;
  point: GPUDataPoint;
  runIndex?: number;
}

export interface FirstTokenCell {
  cap: number;
  series: FirstTokenSeries;
  /** Null when nothing in the series cleared both constraints. */
  winner: FirstTokenWinner | null;
}

/** How the official vendors compare under one cap. */
export interface FirstTokenCapSummary {
  cap: number;
  best: FirstTokenWinner | null;
  runnerUp: FirstTokenWinner | null;
  /** `(runnerUp − best) / runnerUp`; null without two qualifying vendors. */
  pctLower: number | null;
}

export interface FirstTokenResult {
  series: FirstTokenSeries[];
  cells: FirstTokenCell[];
  summaries: FirstTokenCapSummary[];
  /** Official rows that cleared the interactivity floor, before any TTFT cap. */
  qualifyingRows: number;
  /** Official rows the page could read at all: visible hardware with a TTFT. */
  measuredRows: number;
}

export interface FirstTokenSelectionInput {
  official: Record<string, GPUDataPoint[]>;
  officialMeta: Record<string, GroupMeta>;
  overlay?: Record<string, GPUDataPoint[]>;
  overlayMeta?: Record<string, OverlayGroupMeta>;
  /** Branch (or fallback) label per run index, for the overlay series label. */
  overlayLabels?: Record<number, string>;
  caps: readonly number[];
  minInteractivity: number;
  costProvider: CostProvider;
  costType: CostType;
  /** Legend selection by base hwKey. Omit to consider every group. */
  visibleHwKeys?: ReadonlySet<string>;
}

interface Candidate {
  hwKey: string;
  precision: string;
  vendor: string;
  cost: number;
  ttft: number;
  interactivity: number;
  point: GPUDataPoint;
  runIndex?: number;
}

function readable(point: GPUDataPoint): point is GPUDataPoint & { ttft: number } {
  return typeof point.ttft === 'number' && Number.isFinite(point.ttft) && point.ttft > 0;
}

function collectCandidates(
  groups: Record<string, GPUDataPoint[]>,
  meta: Record<string, GroupMeta | OverlayGroupMeta>,
  costProvider: CostProvider,
  costType: CostType,
  visibleHwKeys?: ReadonlySet<string>,
): Candidate[] {
  const out: Candidate[] = [];
  for (const [groupKey, points] of Object.entries(groups)) {
    const groupMeta = meta[groupKey];
    const hwKey = groupMeta?.hwKey ?? groupKey;
    if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;
    const runIndex = groupMeta && 'runIndex' in groupMeta ? groupMeta.runIndex : undefined;
    const vendor = hardwareVendor(hwKey);
    for (const point of points) {
      if (!readable(point)) continue;
      const cost = getCostField(point, costProvider, costType);
      if (!Number.isFinite(cost) || cost <= 0) continue;
      if (!Number.isFinite(point.interactivity)) continue;
      out.push({
        hwKey,
        precision: point.precision,
        vendor,
        cost,
        ttft: point.ttft,
        interactivity: point.interactivity,
        point,
        ...(runIndex === undefined ? {} : { runIndex }),
      });
    }
  }
  return out;
}

/**
 * Lower cost wins. Ties break toward the shorter first-token wait, then the
 * faster stream, so a duplicate row cannot pick the worse-behaved twin.
 */
function betterCandidate(a: Candidate, b: Candidate): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.ttft !== b.ttft) return a.ttft < b.ttft;
  return a.interactivity > b.interactivity;
}

function pickWinner(
  candidates: readonly Candidate[],
  cap: number,
  minInteractivity: number,
  seriesKey: string,
): FirstTokenWinner | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (candidate.ttft > cap || candidate.interactivity < minInteractivity) continue;
    if (best === null || betterCandidate(candidate, best)) best = candidate;
  }
  return best ? { seriesKey, ...best } : null;
}

/**
 * For every cap in the ladder, the cheapest measured configuration per vendor
 * (and per loaded unofficial run) that cleared the interactivity floor with a
 * first token under the cap.
 */
export function selectFirstTokenWinners(input: FirstTokenSelectionInput): FirstTokenResult {
  const { caps, minInteractivity, costProvider, costType, visibleHwKeys } = input;

  const official = collectCandidates(
    input.official,
    input.officialMeta,
    costProvider,
    costType,
    visibleHwKeys,
  );
  const overlay = collectCandidates(
    input.overlay ?? {},
    input.overlayMeta ?? {},
    costProvider,
    costType,
    visibleHwKeys,
  );

  // A vendor appears as soon as it has readable rows, even when none of them
  // clear a cap: an empty column says "nothing measured under this limit",
  // which is the finding, and hiding it would read as the vendor not existing.
  const vendors = [...new Set(official.map((c) => c.vendor))].toSorted(compareVendors);
  const byVendor = new Map<string, Candidate[]>();
  for (const candidate of official) {
    const list = byVendor.get(candidate.vendor) ?? [];
    list.push(candidate);
    byVendor.set(candidate.vendor, list);
  }

  const runIndexes = [
    ...new Set(overlay.map((c) => c.runIndex).filter((idx): idx is number => idx !== undefined)),
  ].toSorted((a, b) => a - b);
  const byRun = new Map<number, Candidate[]>();
  for (const candidate of overlay) {
    if (candidate.runIndex === undefined) continue;
    const list = byRun.get(candidate.runIndex) ?? [];
    list.push(candidate);
    byRun.set(candidate.runIndex, list);
  }

  const series: FirstTokenSeries[] = [
    ...vendors.map((vendor) => ({ key: `vendor:${vendor}`, label: vendor, vendor })),
    ...runIndexes.map((runIndex) => ({
      key: `run:${runIndex}`,
      label: `✕ ${input.overlayLabels?.[runIndex] ?? `run ${runIndex + 1}`}`,
      runIndex,
    })),
  ];

  const cells: FirstTokenCell[] = [];
  const summaries: FirstTokenCapSummary[] = [];
  for (const cap of caps) {
    const officialWinners: FirstTokenWinner[] = [];
    for (const entry of series) {
      const candidates =
        entry.vendor === undefined ? byRun.get(entry.runIndex!) : byVendor.get(entry.vendor);
      const winner = pickWinner(candidates ?? [], cap, minInteractivity, entry.key);
      cells.push({ cap, series: entry, winner });
      if (winner && entry.vendor !== undefined) officialWinners.push(winner);
    }
    officialWinners.sort((a, b) => a.cost - b.cost);
    const best = officialWinners[0] ?? null;
    const runnerUp = officialWinners[1] ?? null;
    summaries.push({
      cap,
      best,
      runnerUp,
      pctLower:
        best && runnerUp && runnerUp.cost > 0 ? (runnerUp.cost - best.cost) / runnerUp.cost : null,
    });
  }

  return {
    series,
    cells,
    summaries,
    qualifyingRows: official.filter((c) => c.interactivity >= minInteractivity).length,
    measuredRows: official.length,
  };
}

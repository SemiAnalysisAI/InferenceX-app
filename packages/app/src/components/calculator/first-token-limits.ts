import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { getCostField } from './interpolation';
import type { CostProvider, CostType, GPUDataPoint } from './types';
import type { GroupMeta, OverlayGroupMeta } from './useThroughputData';

export const DEFAULT_FIRST_TOKEN_CAPS: readonly number[] = [2, 5, 10, 15, 20];

export const MAX_FIRST_TOKEN_CAPS = 8;

export const DEFAULT_FIRST_TOKEN_MIN_INTERACTIVITY = { agentic: 150, fixed: 35 } as const;

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

export function formatCap(cap: number): string {
  return Number.isInteger(cap) ? String(cap) : String(Number(cap.toFixed(2)));
}

export const ZH_MEDIAN = '中位数';

export function zhStatPhrase(noun: string, stat: string, before = ''): string {
  const phrase =
    stat === ZH_MEDIAN
      ? `${noun}${/[A-Za-z]$/u.test(noun) ? ' ' : ''}${ZH_MEDIAN}`
      : `${stat} ${noun}`;
  const gap = before !== '' && /^[A-Za-z]/u.test(phrase) ? ' ' : '';
  return `${before}${gap}${phrase}`;
}

const VENDOR_ORDER = ['NVIDIA', 'AMD'];

export const UNKNOWN_VENDOR = 'Other';

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

export interface FirstTokenSeries {
  key: string;
  label: string;
  vendor?: string;
  runIndex?: number;
}

export interface FirstTokenWinner {
  seriesKey: string;
  hwKey: string;
  vendor: string;
  precision: string;
  cost: number;
  ttft: number;
  interactivity: number;
  point: GPUDataPoint;
  runIndex?: number;
}

export interface FirstTokenCell {
  cap: number;
  series: FirstTokenSeries;
  winner: FirstTokenWinner | null;
}

export interface FirstTokenCapSummary {
  cap: number;
  best: FirstTokenWinner | null;
  runnerUp: FirstTokenWinner | null;
  pctLower: number | null;
}

export interface FirstTokenResult {
  series: FirstTokenSeries[];
  cells: FirstTokenCell[];
  summaries: FirstTokenCapSummary[];
  qualifyingRows: number;
  measuredRows: number;
  overlayMeasuredRows: number;
  overlayQualifyingRows: number;
}

export interface FirstTokenSelectionInput {
  official: Record<string, GPUDataPoint[]>;
  officialMeta: Record<string, GroupMeta>;
  overlay?: Record<string, GPUDataPoint[]>;
  overlayMeta?: Record<string, OverlayGroupMeta>;
  overlayLabels?: Record<number, string>;
  caps: readonly number[];
  minInteractivity: number;
  costProvider: CostProvider;
  costType: CostType;
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
    overlayMeasuredRows: overlay.length,
    overlayQualifyingRows: overlay.filter((c) => c.interactivity >= minInteractivity).length,
  };
}

import type { Locale } from '@/lib/i18n/i18n';

import type { InferenceData, PowerCompare } from '../types';
import type { PowerXRole } from './powerx-role';

/**
 * Pure helpers for the GPU role surfaces: the prefill / decode GPU counts the table and
 * CSV show, and the rows of the Energy view's "Prefill vs decode" stacked bars.
 */

/** A pool's GPU count, or `aggregated` when every GPU does both prefill and decode. */
export type RoleGpuCount = number | 'aggregated';

type RoleCountPoint = Pick<InferenceData, 'disagg' | 'num_prefill_gpu' | 'num_decode_gpu'>;

/**
 * True when a row runs aggregated: no separate prefill and decode pools. Aggregated rows
 * still carry `num_prefill_gpu` (often the whole deployment) and `num_decode_gpu = 0`,
 * which must never be read as pool sizes.
 */
export function isAggregatedRoleRow(point: RoleCountPoint): boolean {
  return !(
    point.disagg &&
    Number.isFinite(point.num_prefill_gpu) &&
    Number.isFinite(point.num_decode_gpu) &&
    (point.num_prefill_gpu ?? 0) > 0 &&
    (point.num_decode_gpu ?? 0) > 0
  );
}

export function roleGpuCounts(point: RoleCountPoint): {
  prefill: RoleGpuCount;
  decode: RoleGpuCount;
} {
  if (isAggregatedRoleRow(point)) return { prefill: 'aggregated', decode: 'aggregated' };
  return { prefill: point.num_prefill_gpu!, decode: point.num_decode_gpu! };
}

/**
 * Whether the table and CSV carry the Prefill GPUs / Decode GPUs columns: a PowerX GPU
 * role other than All GPUs, or rows already split into role series.
 */
export function showRoleGpuColumns(
  role: PowerXRole | undefined,
  powerCompare: PowerCompare,
): boolean {
  return (role !== undefined && role !== 'all') || powerCompare === 'roles';
}

const AGGREGATED_LABEL: Record<Locale, string> = { en: 'aggregated', zh: '聚合' };

export function roleGpuCountLabel(count: RoleGpuCount, locale: Locale): string {
  return count === 'aggregated' ? AGGREGATED_LABEL[locale] : String(count);
}

export interface RoleSplitRow {
  point: InferenceData;
  /** Prefill energy restated per output token (adds up with decode). */
  prefillJ: number;
  /** Decode-pool energy per output token. */
  decodeJ: number;
  /** Measured all-GPU J per output token; falls back to prefill + decode when absent. */
  measuredJ: number;
  /** prefill / (prefill + decode), 0..1. */
  prefillShare: number;
  prefillGpus: number;
  decodeGpus: number;
}

export interface RoleSplitGroup {
  /** hwKey | precision | run_url (overlays only). */
  key: string;
  hwKey: string;
  overlay: boolean;
  runUrl?: string;
  rows: RoleSplitRow[];
}

export interface RoleSplitUnsplitChip {
  key: string;
  hwKey: string;
  overlay: boolean;
  runUrl?: string;
  point: InferenceData;
  /** `aggregated`: every GPU does both. `no-telemetry`: disaggregated, no per-pool energy. */
  reason: 'aggregated' | 'no-telemetry';
}

export interface RoleSplitResult {
  groups: RoleSplitGroup[];
  unsplit: RoleSplitUnsplitChip[];
}

function finite(value: { y: number } | undefined): number | null {
  return value && Number.isFinite(value.y) ? value.y : null;
}

/** The split row of one benchmark point, or null when its energy cannot be split by pool. */
export function roleSplitRow(point: InferenceData): RoleSplitRow | null {
  if (isAggregatedRoleRow(point)) return null;
  const prefillJ = finite(point.reconstructedPrefillJPerOutputToken);
  const decodeJ = finite(point.measuredDecodeJPerOutputToken);
  if (prefillJ === null || decodeJ === null || prefillJ < 0 || decodeJ < 0) return null;
  const sum = prefillJ + decodeJ;
  if (sum <= 0) return null;
  return {
    point,
    prefillJ,
    decodeJ,
    measuredJ: finite(point.measuredJPerOutputToken) ?? sum,
    prefillShare: prefillJ / sum,
    prefillGpus: point.num_prefill_gpu!,
    decodeGpus: point.num_decode_gpu!,
  };
}

function groupKey(point: InferenceData, overlay: boolean): string {
  return [point.hwKey, point.precision ?? '', overlay ? (point.run_url ?? '') : ''].join('|');
}

/**
 * Bars for the "Prefill vs decode" Energy view: one row per benchmark point, grouped per
 * chip (and per run for overlays), each group sorted by interactivity (`x`). Chips with no
 * splittable point are returned in `unsplit` so the view can list them, dimmed.
 * Role clones (`powerVariant` prefill / decode) are skipped: the base row carries both pools.
 */
export function roleSplitRows(
  points: readonly InferenceData[],
  overlayPoints: readonly InferenceData[] = [],
): RoleSplitResult {
  const groups = new Map<string, RoleSplitGroup>();
  const seen = new Map<string, { point: InferenceData; overlay: boolean; disagg: boolean }>();
  const add = (point: InferenceData, overlay: boolean) => {
    if (point.hidden) return;
    if (point.powerVariant && point.powerVariant.id !== 'all') return;
    const key = groupKey(point, overlay);
    const prior = seen.get(key);
    seen.set(key, {
      point: prior?.point ?? point,
      overlay,
      disagg: Boolean(prior?.disagg) || !isAggregatedRoleRow(point),
    });
    const row = roleSplitRow(point);
    if (!row) return;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        hwKey: point.hwKey,
        overlay,
        runUrl: overlay ? point.run_url : undefined,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  };
  for (const point of points) add(point, false);
  for (const point of overlayPoints) add(point, true);

  for (const group of groups.values()) group.rows.sort((a, b) => a.point.x - b.point.x);
  const unsplit: RoleSplitUnsplitChip[] = [];
  for (const [key, entry] of seen) {
    if (groups.has(key)) continue;
    unsplit.push({
      key,
      hwKey: entry.point.hwKey,
      overlay: entry.overlay,
      runUrl: entry.overlay ? entry.point.run_url : undefined,
      point: entry.point,
      reason: entry.disagg ? 'no-telemetry' : 'aggregated',
    });
  }
  return { groups: [...groups.values()], unsplit };
}

/** Largest bar extent across groups, so every bar shares one scale. */
export function roleSplitScaleMax(groups: readonly RoleSplitGroup[]): number {
  let max = 0;
  for (const group of groups) {
    for (const row of group.rows) max = Math.max(max, row.prefillJ + row.decodeJ, row.measuredJ);
  }
  return max;
}

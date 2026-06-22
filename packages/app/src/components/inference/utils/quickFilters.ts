import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type {
  DisaggMode,
  InferenceData,
  QuickFilters,
  SpecMode,
} from '@/components/inference/types';

export type { DisaggMode, QuickFilters, SpecMode };

/**
 * Quick filters let users narrow the chart to any combination of GPU vendor,
 * aggregation mode, and speculative-decoding method without touching the legend
 * or GPU-config selectors. They are coarse pre-filters applied to the point set
 * (official + unofficial-run overlay), so the legend, rooflines, and Pareto all
 * reflect only the matching configs.
 *
 * Empty array within a category = no constraint (show everything). Values within
 * a category are OR'd; categories are AND'd.
 */

/** Referentially stable "no filters" value for defaults and resets. */
export const EMPTY_QUICK_FILTERS: QuickFilters = { vendors: [], disagg: [], spec: [] };

/** True when at least one category constrains the point set. */
export function quickFiltersActive(f: QuickFilters): boolean {
  return f.vendors.length > 0 || f.disagg.length > 0 || f.spec.length > 0;
}

/** Resolve a point's GPU vendor from the base GPU in its hardware key. */
export function pointVendor(hwKey: string): string | undefined {
  return GPU_VENDORS[hwKey.split('_')[0]];
}

/** A point uses MTP when its spec_decoding is 'mtp' (mirrored by the `_mtp` hwKey suffix). */
function pointIsMtp(point: InferenceData): boolean {
  return point.spec_decoding === 'mtp' || String(point.hwKey).endsWith('_mtp');
}

/** Whether a single data point satisfies every active quick-filter category. */
export function matchesQuickFilters(point: InferenceData, f: QuickFilters): boolean {
  if (f.vendors.length > 0) {
    const vendor = pointVendor(String(point.hwKey));
    if (!vendor || !f.vendors.includes(vendor)) return false;
  }
  if (f.disagg.length > 0) {
    const mode: DisaggMode = point.disagg ? 'disagg' : 'agg';
    if (!f.disagg.includes(mode)) return false;
  }
  if (f.spec.length > 0) {
    const mode: SpecMode = pointIsMtp(point) ? 'mtp' : 'stp';
    if (!f.spec.includes(mode)) return false;
  }
  return true;
}

/** Apply quick filters to a point list (no-op when nothing is selected). */
export function applyQuickFilters<T extends InferenceData>(data: T[], f: QuickFilters): T[] {
  if (!quickFiltersActive(f)) return data;
  return data.filter((d) => matchesQuickFilters(d, f));
}

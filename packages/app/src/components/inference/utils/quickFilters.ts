import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type {
  AvailableQuickFilters,
  DisaggMode,
  InferenceData,
  QuickFilters,
  SpecMode,
} from '@/components/inference/types';

export type { AvailableQuickFilters, DisaggMode, QuickFilters, SpecMode };

/** Vendor display order for the quick-filter pills. */
const VENDOR_ORDER = ['NVIDIA', 'AMD'];

/**
 * Quick filters let users narrow the chart to any combination of GPU vendor,
 * serving framework, aggregation mode, and speculative-decoding method without
 * touching the legend or GPU-config selectors. They are coarse pre-filters
 * applied to the point set (official + unofficial-run overlay), so the legend,
 * rooflines, and Pareto all reflect only the matching configs.
 *
 * Empty array within a category = no constraint (show everything). Values within
 * a category are OR'd; categories are AND'd.
 */

/** Referentially stable "no filters" value for defaults and resets. */
export const EMPTY_QUICK_FILTERS: QuickFilters = {
  vendors: [],
  frameworks: [],
  disagg: [],
  spec: [],
};

/**
 * Serving-framework families surfaced as quick filters, in display order. Each
 * family groups its base + variant engines (e.g. TRT covers `trt`, `trtllm`,
 * `dynamo-trt`). Labels render exactly as the GPUs/engines are branded.
 */
export const FRAMEWORK_FAMILIES = [
  { key: 'vllm', label: 'vLLM' },
  { key: 'sglang', label: 'SGLang' },
  { key: 'trt', label: 'TRT' },
  { key: 'atom', label: 'ATOM' },
] as const;

const FRAMEWORK_FAMILY_ORDER = FRAMEWORK_FAMILIES.map((f) => f.key);

/**
 * Map a raw framework string (e.g. `dynamo-trt`, `mori-sglang`, `mooncake-atom`)
 * to its engine family, or undefined when it matches no known family.
 */
export function frameworkFamily(framework: string | undefined): string | undefined {
  if (!framework) return undefined;
  const f = framework.toLowerCase();
  // The family substrings are mutually exclusive, so order is irrelevant.
  if (f.includes('vllm')) return 'vllm';
  if (f.includes('sglang')) return 'sglang';
  if (f.includes('trt')) return 'trt';
  if (f.includes('atom')) return 'atom';
  return undefined;
}

/**
 * Compute, in a single pass, which quick-filter values actually have data in a
 * point list. Used to render only existing framework pills and to disable
 * vendor / aggregation / spec options that would yield an empty chart. Each
 * category is returned in display order.
 */
export function computeAvailableQuickFilters(
  points: Iterable<InferenceData>,
): AvailableQuickFilters {
  const vendors = new Set<string>();
  const frameworks = new Set<string>();
  let hasAgg = false;
  let hasDisagg = false;
  let hasMtp = false;
  let hasStp = false;
  for (const p of points) {
    const vendor = pointVendor(String(p.hwKey));
    if (vendor) vendors.add(vendor);
    const fam = frameworkFamily(p.framework);
    if (fam) frameworks.add(fam);
    if (p.disagg) hasDisagg = true;
    else hasAgg = true;
    if (pointSpecMode(p) === 'mtp') hasMtp = true;
    else hasStp = true;
  }
  const disagg: DisaggMode[] = [];
  if (hasAgg) disagg.push('agg');
  if (hasDisagg) disagg.push('disagg');
  const spec: SpecMode[] = [];
  if (hasMtp) spec.push('mtp');
  if (hasStp) spec.push('stp');
  return {
    vendors: VENDOR_ORDER.filter((v) => vendors.has(v)),
    frameworks: FRAMEWORK_FAMILY_ORDER.filter((f) => frameworks.has(f)),
    disagg,
    spec,
  };
}

/** True when at least one category constrains the point set. */
export function quickFiltersActive(f: QuickFilters): boolean {
  return (
    f.vendors.length > 0 || f.frameworks.length > 0 || f.disagg.length > 0 || f.spec.length > 0
  );
}

/** Resolve a point's GPU vendor from the base GPU in its hardware key. */
export function pointVendor(hwKey: string): string | undefined {
  return GPU_VENDORS[hwKey.split('_')[0]];
}

/**
 * Classify a point for the spec-decoding filter. STP means *standard* decoding,
 * which the DB marks `none` (no spec suffix on the hwKey). Any other value means a
 * speculative method is active, so it groups under MTP (the "spec decoding on" pill).
 * Keying STP off `none` — rather than treating everything that isn't `mtp` as STP —
 * keeps non-standard methods (e.g. EAGLE) out of the standard bucket.
 */
function pointSpecMode(point: InferenceData): SpecMode {
  const s = point.spec_decoding;
  const isStandard =
    (s === 'none' || s === '' || s === undefined || s === null) &&
    !String(point.hwKey).endsWith('_mtp');
  return isStandard ? 'stp' : 'mtp';
}

/** Whether a single data point satisfies every active quick-filter category. */
export function matchesQuickFilters(point: InferenceData, f: QuickFilters): boolean {
  if (f.vendors.length > 0) {
    const vendor = pointVendor(String(point.hwKey));
    if (!vendor || !f.vendors.includes(vendor)) return false;
  }
  if (f.frameworks.length > 0) {
    const fam = frameworkFamily(point.framework);
    if (!fam || !f.frameworks.includes(fam)) return false;
  }
  if (f.disagg.length > 0) {
    const mode: DisaggMode = point.disagg ? 'disagg' : 'agg';
    if (!f.disagg.includes(mode)) return false;
  }
  if (f.spec.length > 0 && !f.spec.includes(pointSpecMode(point))) return false;
  return true;
}

/** Apply quick filters to a point list (no-op when nothing is selected). */
export function applyQuickFilters<T extends InferenceData>(data: T[], f: QuickFilters): T[] {
  if (!quickFiltersActive(f)) return data;
  return data.filter((d) => matchesQuickFilters(d, f));
}

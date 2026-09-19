/**
 * Comparison series for the gated measured-power charts (`i_pcompare`).
 *
 * The selected metric stays the chart's base series. A comparison adds sibling
 * series drawn from the SAME points — one per other power boundary
 * (`boundaries`, PowerX Figures 2/3) or per worker role (`roles`, Figures 6/7)
 * — so ScatterGraph can draw them with the hardware's colour and a per-variant
 * dash through its ordinary series pipeline (frontier, Optimal Only, tooltip,
 * table, CSV, `?unofficialrun=` overlay). A variant point is a clone of its
 * base point with `y` remapped and `powerVariant` set; base points are left
 * untouched so a chart without comparison is byte-identical to before.
 *
 * Variants exist only where the metric names a whole-deployment average
 * (W per chip) or J per output token, because those are the only quantities
 * every boundary and role publishes on a common axis; everywhere else the
 * comparison yields no series and the control says so.
 */
import type { Locale } from '@/lib/i18n';
import { POWER_BASES, POWER_BASIS_FIELDS, POWER_BASIS_LABELS } from '@/lib/power-basis';

import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { InferenceData, PowerCompare, PowerRole, PowerVariant } from '../types';
import { reconstructedRoleEnergy } from './role-energy';

export const POWER_COMPARE_MODES = [
  'none',
  'boundaries',
  'roles',
] as const satisfies readonly PowerCompare[];

export function parsePowerCompare(value: string | null | undefined): PowerCompare {
  return value === 'boundaries' || value === 'roles' ? value : 'none';
}

/** Point fields a comparison series can plot; each is a `{ y, roof }` pair. */
export type PowerSeriesField = keyof Pick<
  InferenceData,
  | 'measuredAvgPower'
  | 'measuredPrefillAvgPower'
  | 'measuredDecodeAvgPower'
  | 'measuredJPerOutputToken'
  | 'measuredDecodeJPerOutputToken'
  | 'reconstructedPrefillJPerOutputToken'
  | 'gpuProvisionedWatts'
  | 'gpuProvisionedJPerOutputToken'
  | 'utilityProvisionedWatts'
  | 'utilityProvisionedJPerOutputToken'
  | 'utilityModeledWatts'
  | 'utilityModeledJPerOutputToken'
>;

export interface PowerCompareSeries {
  variant: PowerVariant;
  field: PowerSeriesField;
}

const ROLES = ['all', 'prefill', 'decode'] as const satisfies readonly PowerRole[];

const ROLE_WATT_FIELDS: Record<PowerRole, PowerSeriesField> = {
  all: 'measuredAvgPower',
  prefill: 'measuredPrefillAvgPower',
  decode: 'measuredDecodeAvgPower',
};
// Energy per output token per role. The prefill pool's own figure is per input
// token; `reconstructedPrefillJPerOutputToken` carries it onto the output-token
// axis (utils/role-energy.ts).
const ROLE_ENERGY_FIELDS: Record<PowerRole, PowerSeriesField> = {
  all: 'measuredJPerOutputToken',
  prefill: 'reconstructedPrefillJPerOutputToken',
  decode: 'measuredDecodeJPerOutputToken',
};

const ROLE_LABELS: Record<PowerRole, { en: string; zh: string }> = {
  all: { en: 'All GPUs', zh: '全部 GPU' },
  prefill: { en: 'Prefill GPUs', zh: '预填充 GPU' },
  decode: { en: 'Decode GPUs', zh: '解码 GPU' },
};

/** SVG dash per variant; the base series and `all` stay solid. */
const VARIANT_DASH: Record<string, string> = {
  'gpu-measured': '',
  'gpu-provisioned': '8 4',
  'utility-provisioned': '3 3',
  'utility-modeled': '10 3 2 3',
  all: '',
  prefill: '7 3',
  decode: '2 3',
};

/**
 * The quantity a metric key plots on the comparison's common axis, or null
 * when the key is not a whole-deployment average W/chip or J per output token.
 */
function comparableQuantity(metric: string): 'watts' | 'energy' | null {
  const config = getMeasuredMetricConfig(metric);
  if (!config) return null;
  if (config.family === 'power') {
    return config.scope === 'all' && config.statistic === 'average' && config.display === 'watts'
      ? 'watts'
      : null;
  }
  return config.scope === 'all' && config.denominator === 'output' && config.unit === 'joules'
    ? 'energy'
    : null;
}

/**
 * The base series' own identity under a comparison — the boundary or role the
 * selected metric already plots — or null when the metric admits no comparison
 * of that kind.
 */
export function powerCompareBase(metric: string, mode: PowerCompare): PowerVariant | null {
  const config = getMeasuredMetricConfig(metric);
  if (!config || mode === 'none') return null;
  if (mode === 'boundaries') {
    return comparableQuantity(metric) ? { kind: 'basis', id: config.basis } : null;
  }
  if (config.basis !== 'gpu-measured') return null;
  if (config.family === 'power') {
    return config.statistic === 'average' && config.display === 'watts'
      ? { kind: 'role', id: config.scope }
      : null;
  }
  // Role energy compares J per output token; a prefill J per input token axis
  // has no decode counterpart.
  return config.denominator === 'output' && config.unit === 'joules' && config.scope !== 'prefill'
    ? { kind: 'role', id: config.scope }
    : null;
}

/** The sibling series a comparison adds to the selected metric (never the base itself). */
export function powerCompareVariants(metric: string, mode: PowerCompare): PowerCompareSeries[] {
  const base = powerCompareBase(metric, mode);
  const config = getMeasuredMetricConfig(metric);
  if (!base || !config) return [];
  if (base.kind === 'basis') {
    const quantity = comparableQuantity(metric);
    if (!quantity) return [];
    return POWER_BASES.filter((basis) => basis !== base.id).map((basis) => ({
      variant: { kind: 'basis', id: basis },
      field:
        basis === 'gpu-measured'
          ? quantity === 'watts'
            ? 'measuredAvgPower'
            : 'measuredJPerOutputToken'
          : POWER_BASIS_FIELDS[basis][quantity],
    }));
  }
  const fields = config.family === 'power' ? ROLE_WATT_FIELDS : ROLE_ENERGY_FIELDS;
  return ROLES.filter((role) => role !== base.id).map((role) => ({
    variant: { kind: 'role', id: role },
    field: fields[role],
  }));
}

/** Whether choosing `mode` on `metric` draws anything. `none` is always available. */
export function powerCompareAvailable(metric: string, mode: PowerCompare): boolean {
  return mode === 'none' || powerCompareVariants(metric, mode).length > 0;
}

/**
 * Appends one clone per comparison series to `points` (already remapped onto
 * the selected metric). A point lacking a variant's field contributes nothing
 * to that series — never a 0 — so the availability rules of each boundary and
 * role carry through unchanged.
 */
export function expandPowerCompareSeries(
  points: readonly InferenceData[],
  metric: string,
  mode: PowerCompare,
): InferenceData[] {
  const series = powerCompareVariants(metric, mode);
  if (series.length === 0) return [...points];
  const result: InferenceData[] = [...points];
  for (const { variant, field } of series) {
    for (const point of points) {
      const value = point[field];
      if (!value || !Number.isFinite(value.y)) continue;
      result.push({ ...point, y: value.y, roof: value.roof, powerVariant: variant });
    }
  }
  return result;
}

/** Comparison mode implied by the variants present in a rendered point set. */
export function inferPowerCompare(points: readonly InferenceData[]): PowerCompare {
  for (const point of points) {
    if (point.powerVariant?.kind === 'basis') return 'boundaries';
    if (point.powerVariant?.kind === 'role') return 'roles';
  }
  return 'none';
}

/** Distinct variants in draw order: the base first, then siblings in canonical order. */
export function powerVariantsInData(
  points: readonly InferenceData[],
  metric: string,
): PowerVariant[] {
  const mode = inferPowerCompare(points);
  if (mode === 'none') return [];
  const present = new Set(points.map((point) => point.powerVariant?.id).filter(Boolean));
  const base = powerCompareBase(metric, mode);
  const ordered: PowerVariant[] =
    mode === 'boundaries'
      ? POWER_BASES.map((id) => ({ kind: 'basis', id }))
      : ROLES.map((id) => ({ kind: 'role', id }));
  return ordered.filter((variant) => variant.id === base?.id || present.has(variant.id));
}

export function powerVariantId(variant: PowerVariant | null | undefined): string {
  return variant?.id ?? '';
}

export function powerVariantDash(variant: PowerVariant | null | undefined): string {
  return variant ? VARIANT_DASH[variant.id] : '';
}

export function powerVariantLabel(variant: PowerVariant, locale: Locale): string {
  return variant.kind === 'basis'
    ? POWER_BASIS_LABELS[variant.id][locale]
    : ROLE_LABELS[variant.id][locale];
}

/**
 * Series label for a table or CSV row: the point's variant, or the base
 * series' identity when the chart is comparing and this is a base point.
 */
export function powerSeriesLabel(
  point: Pick<InferenceData, 'powerVariant'>,
  metric: string,
  mode: PowerCompare,
  locale: Locale,
): string {
  const variant = point.powerVariant ?? powerCompareBase(metric, mode);
  return variant ? powerVariantLabel(variant, locale) : '';
}

/** Prefill share of the reconstructed request energy for a role-energy point, in percent. */
export function reconstructedPrefillShare(point: InferenceData): number | null {
  return reconstructedRoleEnergy(point)?.prefillShare ?? null;
}

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
import {
  POWER_BASES,
  POWER_BASIS_FIELDS,
  POWER_BASIS_LABELS,
  type PowerBasis,
} from '@/lib/power-basis';

import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { InferenceData, PowerCompare, PowerRole, PowerVariant } from '../types';

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

/** Short boundary names for in-chart line labels; the legend keeps the full names. */
const BASIS_SHORT_LABELS: Record<PowerBasis, { en: string; zh: string }> = {
  'gpu-measured': { en: 'Measured', zh: '实测' },
  'gpu-provisioned': { en: 'TDP', zh: 'TDP' },
  'utility-provisioned': { en: 'All-in', zh: '全站' },
  'utility-modeled': { en: 'PUE modeled', zh: 'PUE 建模' },
};

/** Suffix text a line label carries for one comparison series. */
export function powerVariantShortLabel(variant: PowerVariant, locale: Locale): string {
  return variant.kind === 'basis'
    ? BASIS_SHORT_LABELS[variant.id][locale]
    : ROLE_LABELS[variant.id][locale];
}

/** `700 W`, `1.37 kW`, `19.2 kW`: kilowatts from 1000 W, at most two decimals, zeros trimmed. */
export function formatWatts(watts: number): string {
  if (Math.abs(watts) >= 1000) {
    return `${(watts / 1000).toFixed(2).replace(/\.?0+$/u, '')} kW`;
  }
  return `${Math.round(watts)} W`;
}

/**
 * The value a series holds at every point, or null when it varies. A
 * provisioned boundary (TDP, all-in) is one number per hardware, so its line
 * label can state it instead of sending the reader to the axis. Non-finite
 * values are ignored; an empty series is null.
 */
export function flatSeriesValue(values: readonly number[], relTolerance = 0.005): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const first = finite[0];
  const tolerance = Math.abs(first) * relTolerance;
  return finite.every((value) => Math.abs(value - first) <= tolerance) ? first : null;
}

export interface PowerLineLabelOptions {
  /** The selected metric's own series keeps the plain hardware label. */
  isBase: boolean;
  locale: Locale;
  /** Shared watts of a flat series (`flatSeriesValue`), appended after the name. */
  flatWatts?: number | null;
}

const LINE_LABEL_SUFFIX_SEPARATOR = ' · ';

/** Suffix appended to a comparison sibling's line label; '' for the base series. */
export function powerLineLabelSuffix(
  variant: PowerVariant | null | undefined,
  opts: PowerLineLabelOptions,
): string {
  if (opts.isBase || !variant) return '';
  const watts =
    typeof opts.flatWatts === 'number' && Number.isFinite(opts.flatWatts)
      ? ` ${formatWatts(opts.flatWatts)}`
      : '';
  return `${LINE_LABEL_SUFFIX_SEPARATOR}${powerVariantShortLabel(variant, opts.locale)}${watts}`;
}

const LINE_LABEL_SERIES_DELIMITER = '::';

/**
 * Line-label series id: the hardware key for the base series (existing pinned
 * anchors and hover hooks key on it) and `<hw>::<variant>` for a sibling.
 */
export function lineLabelSeriesId(
  hw: string,
  variant: PowerVariant | null | undefined,
  isBase: boolean,
): string {
  return isBase || !variant ? hw : `${hw}${LINE_LABEL_SERIES_DELIMITER}${variant.id}`;
}

/** Inverse of `lineLabelSeriesId`: the hardware key behind a line-label series id. */
export function lineLabelHardwareKey(seriesId: string): string {
  const index = seriesId.indexOf(LINE_LABEL_SERIES_DELIMITER);
  return index === -1 ? seriesId : seriesId.slice(0, index);
}

/** Whether `metric` plots watts per chip, so a flat boundary's label can state its value. */
export function metricPlotsWatts(metric: string): boolean {
  const config = getMeasuredMetricConfig(metric);
  return config?.family === 'power' && config.display === 'watts';
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

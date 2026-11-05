import type { Locale } from '@/lib/i18n/i18n';
import {
  POWER_BASES,
  POWER_BASIS_FIELDS,
  POWER_QUANTITIES,
  powerBasisLabel,
  type PowerBasis,
  type PowerBasisField,
  type PowerBasisLabelStyle,
  type PowerQuantity,
} from '@/lib/power/power-basis';

import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { InferenceData, PowerCompare, PowerRole, PowerVariant } from '../types';

export const POWER_COMPARE_MODES = [
  'none',
  'boundaries',
  'all',
  'roles',
] as const satisfies readonly PowerCompare[];

export function parsePowerCompare(value: string | null | undefined): PowerCompare {
  return value === 'boundaries' ||
    value === 'provisioned' ||
    value === 'all' ||
    value === 'roles' ||
    value === 'breakdown'
    ? value
    : 'none';
}

export type PowerSeriesField = keyof Pick<
  InferenceData,
  | PowerBasisField
  | 'measuredPrefillAvgPower'
  | 'measuredDecodeAvgPower'
  | 'measuredDecodeJPerOutputToken'
  | 'reconstructedPrefillJPerOutputToken'
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

const VARIANT_DASH: Record<string, string> = {
  'gpu-measured': '',
  'gpu-provisioned': '8 4',
  'utility-provisioned': '3 3',
  'it-modeled': '6 3',
  'utility-modeled': '10 3 2 3',
  all: '',
  prefill: '7 3',
  decode: '2 3',
};

function boundaryQuantity(metric: string, basis: PowerBasis): PowerQuantity | null {
  return (
    POWER_QUANTITIES.find((quantity) => {
      const field = POWER_BASIS_FIELDS[basis][quantity];
      return field !== undefined && metric === `y_${field}`;
    }) ?? null
  );
}

export function powerCompareBase(metric: string, mode: PowerCompare): PowerVariant | null {
  const config = getMeasuredMetricConfig(metric);
  // The Where view's breakdown stacks are panels, not sibling series on the chart.
  if (!config || mode === 'none' || mode === 'breakdown') return null;
  if (mode === 'boundaries' || mode === 'provisioned' || mode === 'all') {
    return boundaryQuantity(metric, config.basis) ? { kind: 'basis', id: config.basis } : null;
  }
  if (config.basis !== 'gpu-measured') return null;
  if (config.family === 'power') {
    return config.statistic === 'average' && config.display === 'watts'
      ? { kind: 'role', id: config.scope }
      : null;
  }
  return config.denominator === 'output' && config.unit === 'joules' && config.scope !== 'prefill'
    ? { kind: 'role', id: config.scope }
    : null;
}

/**
 * The three measured boundaries the PowerX tab's "Count" control names (GPU
 * only, IT without PUE, Facility). `boundaries` draws just these; `all` (share
 * links only) adds the two rated provisioned bounds.
 */
const COUNT_COMPARE_BASES = [
  'gpu-measured',
  'it-modeled',
  'utility-modeled',
] as const satisfies readonly PowerBasis[];

/**
 * The PowerX "Rated boundaries: All-in provisioned" pair: measured GPU power
 * (solid) against the all-in provisioned bound (dashed), and nothing else, so
 * the chart stays readable.
 */
const PROVISIONED_COMPARE_BASES = [
  'gpu-measured',
  'utility-provisioned',
] as const satisfies readonly PowerBasis[];

function defaultCompareBases(mode: PowerCompare): readonly PowerBasis[] {
  if (mode === 'all') return POWER_BASES;
  return mode === 'provisioned' ? PROVISIONED_COMPARE_BASES : COUNT_COMPARE_BASES;
}

export function powerCompareVariants(metric: string, mode: PowerCompare): PowerCompareSeries[] {
  const base = powerCompareBase(metric, mode);
  const config = getMeasuredMetricConfig(metric);
  if (!base || !config) return [];
  if (base.kind === 'basis') {
    const quantity = boundaryQuantity(metric, base.id);
    if (!quantity) return [];
    const bases = defaultCompareBases(mode);
    return POWER_BASES.flatMap((basis): PowerCompareSeries[] => {
      if (basis === base.id || !bases.includes(basis)) return [];
      const field = POWER_BASIS_FIELDS[basis][quantity];
      return field ? [{ variant: { kind: 'basis', id: basis }, field }] : [];
    });
  }
  const fields = config.family === 'power' ? ROLE_WATT_FIELDS : ROLE_ENERGY_FIELDS;
  return ROLES.filter((role) => role !== base.id).map((role) => ({
    variant: { kind: 'role', id: role },
    field: fields[role],
  }));
}

export function powerCompareAvailable(metric: string, mode: PowerCompare): boolean {
  return mode === 'none' || powerCompareVariants(metric, mode).length > 0;
}

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

export function inferPowerCompare(points: readonly InferenceData[]): PowerCompare {
  for (const point of points) {
    if (point.powerVariant?.kind === 'basis') return 'boundaries';
    if (point.powerVariant?.kind === 'role') return 'roles';
  }
  return 'none';
}

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

export function powerVariantLabel(
  variant: PowerVariant,
  locale: Locale,
  style: PowerBasisLabelStyle = 'basis',
): string {
  return variant.kind === 'basis'
    ? powerBasisLabel(variant.id, locale, style)
    : ROLE_LABELS[variant.id][locale];
}

// Same names as the boundary control and legend; only the TDP boundary is abbreviated.
export function powerVariantShortLabel(
  variant: PowerVariant,
  locale: Locale,
  style: PowerBasisLabelStyle = 'basis',
): string {
  if (variant.kind === 'basis' && variant.id === 'gpu-provisioned') return 'TDP';
  return powerVariantLabel(variant, locale, style);
}

export function formatWatts(watts: number): string {
  if (Math.abs(watts) >= 1000) {
    return `${(watts / 1000).toFixed(2).replace(/\.?0+$/u, '')} kW`;
  }
  return `${Math.round(watts)} W`;
}

export function flatSeriesValue(values: readonly number[], relTolerance = 0.005): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const first = finite[0];
  const tolerance = Math.abs(first) * relTolerance;
  return finite.every((value) => Math.abs(value - first) <= tolerance) ? first : null;
}

export interface PowerLineLabelOptions {
  isBase: boolean;
  locale: Locale;
  flatWatts?: number | null;
  labelStyle?: PowerBasisLabelStyle;
}

const LINE_LABEL_SUFFIX_SEPARATOR = ' · ';

export function powerLineLabelSuffix(
  variant: PowerVariant | null | undefined,
  opts: PowerLineLabelOptions,
): string {
  if (opts.isBase || !variant) return '';
  const watts =
    typeof opts.flatWatts === 'number' && Number.isFinite(opts.flatWatts)
      ? ` ${formatWatts(opts.flatWatts)}`
      : '';
  return `${LINE_LABEL_SUFFIX_SEPARATOR}${powerVariantShortLabel(variant, opts.locale, opts.labelStyle)}${watts}`;
}

const LINE_LABEL_SERIES_DELIMITER = '::';

export function lineLabelSeriesId(
  hw: string,
  variant: PowerVariant | null | undefined,
  isBase: boolean,
): string {
  return isBase || !variant ? hw : `${hw}${LINE_LABEL_SERIES_DELIMITER}${variant.id}`;
}

export function lineLabelHardwareKey(seriesId: string): string {
  const index = seriesId.indexOf(LINE_LABEL_SERIES_DELIMITER);
  return index === -1 ? seriesId : seriesId.slice(0, index);
}

export function metricPlotsWatts(metric: string): boolean {
  const config = getMeasuredMetricConfig(metric);
  return config?.family === 'power' && config.display === 'watts';
}

export function powerSeriesLabel(
  point: Pick<InferenceData, 'powerVariant'>,
  metric: string,
  mode: PowerCompare,
  locale: Locale,
  style: PowerBasisLabelStyle = 'basis',
): string {
  const variant = point.powerVariant ?? powerCompareBase(metric, mode);
  return variant ? powerVariantLabel(variant, locale, style) : '';
}

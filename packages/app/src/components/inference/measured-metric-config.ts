import {
  POWER_BASES,
  POWER_BASIS_FIELDS,
  POWER_QUANTITIES,
  type PowerBasis,
  type PowerQuantity,
} from '@/lib/power/power-basis';
import type { MetricConfigKey } from './metric-registry';

export type MeasuredMetricFamily = 'power' | 'energy';
type MeasuredScope = 'all' | 'prefill' | 'decode';
export type MeasuredPowerDisplay = 'watts' | 'tdp' | 'timeline';

export type MeasuredMetricConfig =
  | {
      family: 'power';
      basis: PowerBasis;
      scope: MeasuredScope;
      statistic: 'average' | 'p75' | 'p90';
      display: MeasuredPowerDisplay;
    }
  | {
      family: 'energy';
      basis: PowerBasis;
      scope: MeasuredScope;
      denominator: 'input' | 'output' | 'total' | 'query';
      unit: 'joules' | 'wattHours';
    };

export type MeasuredMetricConfigChange = Partial<{
  family: MeasuredMetricFamily;
  basis: PowerBasis;
  scope: MeasuredScope;
  statistic: 'average' | 'p75' | 'p90';
  display: MeasuredPowerDisplay;
  denominator: 'input' | 'output' | 'total' | 'query';
  unit: 'joules' | 'wattHours';
}>;

export const MEASURED_METRIC_DEFAULTS = {
  power: 'y_measuredAvgPower',
  energy: 'y_measuredJPerTotalToken',
} as const satisfies Record<MeasuredMetricFamily, MetricConfigKey>;

const measured = { basis: 'gpu-measured' } as const;

const POWER_QUANTITY_CONFIGS = {
  watts: { family: 'power', scope: 'all', statistic: 'average', display: 'watts' },
  joulesPerOutputToken: { family: 'energy', scope: 'all', denominator: 'output', unit: 'joules' },
  joulesPerTotalToken: { family: 'energy', scope: 'all', denominator: 'total', unit: 'joules' },
} as const satisfies Record<PowerQuantity, MeasuredMetricConfigChange>;

const MEASURED_METRIC_CONFIGS: readonly (readonly [MetricConfigKey, MeasuredMetricConfig])[] = [
  [
    'y_measuredAvgPower',
    { family: 'power', ...measured, scope: 'all', statistic: 'average', display: 'watts' },
  ],
  [
    'y_measuredP75Power',
    { family: 'power', ...measured, scope: 'all', statistic: 'p75', display: 'watts' },
  ],
  [
    'y_measuredP90Power',
    { family: 'power', ...measured, scope: 'all', statistic: 'p90', display: 'watts' },
  ],
  [
    'y_measuredPrefillAvgPower',
    { family: 'power', ...measured, scope: 'prefill', statistic: 'average', display: 'watts' },
  ],
  [
    'y_measuredDecodeAvgPower',
    { family: 'power', ...measured, scope: 'decode', statistic: 'average', display: 'watts' },
  ],
  [
    'y_measuredPowerPercentTdp',
    { family: 'power', ...measured, scope: 'all', statistic: 'average', display: 'tdp' },
  ],
  [
    'y_measuredPowerTimeline',
    { family: 'power', ...measured, scope: 'all', statistic: 'average', display: 'timeline' },
  ],
  [
    'y_measuredJPerInputToken',
    { family: 'energy', ...measured, scope: 'all', denominator: 'input', unit: 'joules' },
  ],
  [
    'y_measuredJPerOutputToken',
    { family: 'energy', ...measured, scope: 'all', denominator: 'output', unit: 'joules' },
  ],
  [
    'y_measuredJPerTotalToken',
    { family: 'energy', ...measured, scope: 'all', denominator: 'total', unit: 'joules' },
  ],
  [
    'y_measuredPrefillJPerInputToken',
    { family: 'energy', ...measured, scope: 'prefill', denominator: 'input', unit: 'joules' },
  ],
  [
    'y_measuredDecodeJPerOutputToken',
    { family: 'energy', ...measured, scope: 'decode', denominator: 'output', unit: 'joules' },
  ],
  [
    'y_measuredJPerSuccessfulQuery',
    { family: 'energy', ...measured, scope: 'all', denominator: 'query', unit: 'joules' },
  ],
  [
    'y_measuredWhPerSuccessfulQuery',
    { family: 'energy', ...measured, scope: 'all', denominator: 'query', unit: 'wattHours' },
  ],
  ...POWER_BASES.filter((basis) => basis !== 'gpu-measured').flatMap((basis) =>
    POWER_QUANTITIES.flatMap((quantity): (readonly [MetricConfigKey, MeasuredMetricConfig])[] => {
      const field = POWER_BASIS_FIELDS[basis][quantity];
      return field ? [[`y_${field}`, { ...POWER_QUANTITY_CONFIGS[quantity], basis }]] : [];
    }),
  ),
];

export function measuredMetricBases(family: MeasuredMetricFamily): PowerBasis[] {
  return POWER_BASES.filter((basis) =>
    MEASURED_METRIC_CONFIGS.some(
      ([, config]) => config.family === family && config.basis === basis,
    ),
  );
}

export function getMeasuredMetricConfig(metric: string): MeasuredMetricConfig | undefined {
  const config = MEASURED_METRIC_CONFIGS.find(([key]) => key === metric)?.[1];
  return config ? { ...config } : undefined;
}

const OTHER_DIMENSIONS = ['scope', 'statistic', 'display', 'denominator', 'unit'] as const;

export function changeMeasuredMetricConfig(
  metric: string,
  change: MeasuredMetricConfigChange,
): MetricConfigKey {
  const current = getMeasuredMetricConfig(metric);
  const family = change.family ?? current?.family ?? 'power';
  const config =
    current?.family === family
      ? current
      : getMeasuredMetricConfig(MEASURED_METRIC_DEFAULTS[family])!;
  const basis = change.basis ?? (current ?? config).basis;
  if (basis !== 'gpu-measured') {
    const unchanged: MeasuredMetricConfigChange = config;
    const onBasis = MEASURED_METRIC_CONFIGS.filter(
      ([, candidate]) => candidate.family === family && candidate.basis === basis,
    );
    const published = onBasis.find(([, candidate]: readonly [string, MeasuredMetricConfigChange]) =>
      OTHER_DIMENSIONS.every((key) => candidate[key] === (change[key] ?? unchanged[key])),
    );
    if (published) return published[0];
    if (change.basis !== undefined) return onBasis[0]?.[0] ?? MEASURED_METRIC_DEFAULTS[family];
  }
  let scope = change.scope ?? config.scope;

  if (config.family === 'power') {
    const statistic = scope === 'all' ? (change.statistic ?? config.statistic) : 'average';
    const display =
      scope === 'all' && statistic === 'average' ? (change.display ?? config.display) : 'watts';
    return (
      MEASURED_METRIC_CONFIGS.find(
        ([, candidate]) =>
          candidate.family === 'power' &&
          candidate.basis === 'gpu-measured' &&
          candidate.scope === scope &&
          candidate.statistic === statistic &&
          candidate.display === display,
      )?.[0] ?? MEASURED_METRIC_DEFAULTS.power
    );
  }

  const denominator = change.denominator ?? config.denominator;
  if (
    (scope === 'prefill' && denominator !== 'input') ||
    (scope === 'decode' && denominator !== 'output')
  ) {
    scope = 'all';
  }
  const unit = denominator === 'query' ? (change.unit ?? config.unit) : 'joules';
  return (
    MEASURED_METRIC_CONFIGS.find(
      ([, candidate]) =>
        candidate.family === 'energy' &&
        candidate.basis === 'gpu-measured' &&
        candidate.scope === scope &&
        candidate.denominator === denominator &&
        candidate.unit === unit,
    )?.[0] ?? MEASURED_METRIC_DEFAULTS.energy
  );
}

import type { MetricConfigKey } from './metric-registry';

export type MeasuredMetricFamily = 'power' | 'energy';
type MeasuredScope = 'all' | 'prefill' | 'decode';

export type MeasuredMetricConfig =
  | {
      family: 'power';
      scope: MeasuredScope;
      statistic: 'average' | 'p75' | 'p90';
      display: 'watts' | 'tdp';
    }
  | {
      family: 'energy';
      scope: MeasuredScope;
      denominator: 'input' | 'output' | 'total' | 'query';
      unit: 'joules' | 'wattHours';
    };

export type MeasuredMetricConfigChange = Partial<{
  family: MeasuredMetricFamily;
  scope: MeasuredScope;
  statistic: 'average' | 'p75' | 'p90';
  display: 'watts' | 'tdp';
  denominator: 'input' | 'output' | 'total' | 'query';
  unit: 'joules' | 'wattHours';
}>;

export const MEASURED_METRIC_DEFAULTS = {
  power: 'y_measuredAvgPower',
  energy: 'y_measuredJPerOutputToken',
} as const satisfies Record<MeasuredMetricFamily, MetricConfigKey>;

// Presentation settings resolve to existing metrics; they do not own chart state.
const MEASURED_METRIC_CONFIGS: readonly (readonly [MetricConfigKey, MeasuredMetricConfig])[] = [
  ['y_measuredAvgPower', { family: 'power', scope: 'all', statistic: 'average', display: 'watts' }],
  ['y_measuredP75Power', { family: 'power', scope: 'all', statistic: 'p75', display: 'watts' }],
  ['y_measuredP90Power', { family: 'power', scope: 'all', statistic: 'p90', display: 'watts' }],
  [
    'y_measuredPrefillAvgPower',
    { family: 'power', scope: 'prefill', statistic: 'average', display: 'watts' },
  ],
  [
    'y_measuredDecodeAvgPower',
    { family: 'power', scope: 'decode', statistic: 'average', display: 'watts' },
  ],
  [
    'y_measuredPowerPercentTdp',
    { family: 'power', scope: 'all', statistic: 'average', display: 'tdp' },
  ],
  [
    'y_measuredJPerInputToken',
    { family: 'energy', scope: 'all', denominator: 'input', unit: 'joules' },
  ],
  [
    'y_measuredJPerOutputToken',
    { family: 'energy', scope: 'all', denominator: 'output', unit: 'joules' },
  ],
  [
    'y_measuredJPerTotalToken',
    { family: 'energy', scope: 'all', denominator: 'total', unit: 'joules' },
  ],
  [
    'y_measuredPrefillJPerInputToken',
    { family: 'energy', scope: 'prefill', denominator: 'input', unit: 'joules' },
  ],
  [
    'y_measuredDecodeJPerOutputToken',
    { family: 'energy', scope: 'decode', denominator: 'output', unit: 'joules' },
  ],
  [
    'y_measuredJPerSuccessfulQuery',
    { family: 'energy', scope: 'all', denominator: 'query', unit: 'joules' },
  ],
  [
    'y_measuredWhPerSuccessfulQuery',
    { family: 'energy', scope: 'all', denominator: 'query', unit: 'wattHours' },
  ],
];

export function getMeasuredMetricConfig(metric: string): MeasuredMetricConfig | undefined {
  const config = MEASURED_METRIC_CONFIGS.find(([key]) => key === metric)?.[1];
  return config ? { ...config } : undefined;
}

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
  let scope = change.scope ?? config.scope;

  if (config.family === 'power') {
    const statistic = scope === 'all' ? (change.statistic ?? config.statistic) : 'average';
    const display =
      scope === 'all' && statistic === 'average' ? (change.display ?? config.display) : 'watts';
    return (
      MEASURED_METRIC_CONFIGS.find(
        ([, candidate]) =>
          candidate.family === 'power' &&
          candidate.scope === scope &&
          candidate.statistic === statistic &&
          candidate.display === display,
      )?.[0] ?? MEASURED_METRIC_DEFAULTS.power
    );
  }

  const denominator = change.denominator ?? config.denominator;
  // Input/output normalization does not imply a prefill/decode attribution.
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
        candidate.scope === scope &&
        candidate.denominator === denominator &&
        candidate.unit === unit,
    )?.[0] ?? MEASURED_METRIC_DEFAULTS.energy
  );
}

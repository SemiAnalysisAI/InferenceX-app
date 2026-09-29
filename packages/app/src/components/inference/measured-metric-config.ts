import type { PowerBasis } from '@/lib/power-basis';
import type { MetricConfigKey } from './metric-registry';

export type MeasuredMetricFamily = 'power' | 'energy';
type MeasuredScope = 'all' | 'prefill' | 'decode';
/**
 * How whole-deployment average power is shown: per-chip watts, percent of
 * TDP, or the per-second telemetry trace behind the average (`timeline`, which
 * ChartDisplay renders with `PowerTimeline` instead of the scatter chart).
 */
export type MeasuredPowerDisplay = 'watts' | 'tdp' | 'timeline';

export type MeasuredMetricConfig =
  | {
      family: 'power';
      /** Power boundary the key plots; only `gpu-measured` publishes the other dimensions. */
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
  energy: 'y_measuredJPerOutputToken',
} as const satisfies Record<MeasuredMetricFamily, MetricConfigKey>;

const measured = { basis: 'gpu-measured' } as const;

// Presentation settings resolve to existing metrics; they do not own chart state.
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
  // Derived boundaries publish one canonical combination per family: whole
  // deployment, average watts, joules per output token (lib/power-basis.ts).
  ...(
    [
      ['gpu-provisioned', 'y_gpuProvisionedWatts', 'y_gpuProvisionedJPerOutputToken'],
      ['utility-provisioned', 'y_utilityProvisionedWatts', 'y_utilityProvisionedJPerOutputToken'],
      ['utility-modeled', 'y_utilityModeledWatts', 'y_utilityModeledJPerOutputToken'],
    ] as const satisfies readonly (readonly [PowerBasis, MetricConfigKey, MetricConfigKey])[]
  ).flatMap(([basis, watts, energy]): (readonly [MetricConfigKey, MeasuredMetricConfig])[] => [
    [watts, { family: 'power', basis, scope: 'all', statistic: 'average', display: 'watts' }],
    [energy, { family: 'energy', basis, scope: 'all', denominator: 'output', unit: 'joules' }],
  ]),
];

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
  // Choosing a derived boundary snaps the other dimensions to its canonical
  // combination. Changing any of those dimensions while on a derived boundary
  // returns to GPU-measured telemetry, the only basis that publishes variants,
  // so every control change lands on a real key. A family switch keeps the
  // boundary: the metric key is what carries it.
  const changesOtherDimension = OTHER_DIMENSIONS.some((key) => change[key] !== undefined);
  const basis =
    change.basis ?? (changesOtherDimension ? 'gpu-measured' : (current ?? config).basis);
  if (basis !== 'gpu-measured') {
    return (
      MEASURED_METRIC_CONFIGS.find(
        ([, candidate]) => candidate.family === family && candidate.basis === basis,
      )?.[0] ?? MEASURED_METRIC_DEFAULTS[family]
    );
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
        candidate.basis === 'gpu-measured' &&
        candidate.scope === scope &&
        candidate.denominator === denominator &&
        candidate.unit === unit,
    )?.[0] ?? MEASURED_METRIC_DEFAULTS.energy
  );
}

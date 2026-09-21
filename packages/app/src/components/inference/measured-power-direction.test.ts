import { describe, it, expect } from 'vitest';

import chartDefinitions from '@/components/inference/metric-registry';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import {
  isMeasuredPowerCurveMetric,
  isPowerCurveMetric,
  upperPowerEnvelope,
} from '@/components/inference/utils/powerCurves';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';

/**
 * Regression coverage for the Pareto direction of the measured-power axes.
 *
 * These three axes shipped without a `_roofline` entry. Consequences of the
 * missing value, all reproduced below:
 *   - InferenceTable fell through to the descending branch, so the table led
 *     with the *most* power-hungry configuration (the reported bug);
 *   - ScatterGraph's `dir ?? 'lower_right'` fallback drew the e2e-latency
 *     chart's frontier from the wrong corner, since that block plots
 *     lower-x-is-better and needs `lower_left`.
 *
 * The assertions therefore run the real chart config through the production
 * frontier and sort helpers rather than restating the JSON.
 */

const MEASURED_POWER_METRICS = [
  'y_measuredAvgPower',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredPowerPercentTdp',
  // Derived power boundaries share the watts semantics: the declared corner
  // drives the ascending table sort, while the chart itself draws the upper
  // power envelope (asserted separately below), exactly like measured watts.
  'y_gpuProvisionedWatts',
  'y_utilityProvisionedWatts',
  'y_utilityModeledWatts',
] as const;

const BASIS_WATT_METRICS = [
  'y_gpuProvisionedWatts',
  'y_utilityProvisionedWatts',
  'y_utilityModeledWatts',
] as const;

const BASIS_ENERGY_METRICS = [
  'y_gpuProvisionedJPerOutputToken',
  'y_utilityProvisionedJPerOutputToken',
  'y_utilityModeledJPerOutputToken',
] as const;

const QUERY_ENERGY_METRICS = [
  'y_measuredJPerSuccessfulQuery',
  'y_measuredWhPerSuccessfulQuery',
] as const;

const ROLE_ENERGY_METRICS = [
  'y_measuredPrefillJPerInputToken',
  'y_measuredDecodeJPerOutputToken',
] as const;

const defs = chartDefinitions as unknown as ChartDefinition[];
const interactivityDef = defs.find((d) => d.chartType === 'interactivity')!;
const e2eDef = defs.find((d) => d.chartType === 'e2e')!;

function declaredDirection(chartDef: ChartDefinition, metric: string): ParetoDirection | undefined {
  return chartDef[`${metric}_roofline` as keyof ChartDefinition] as ParetoDirection | undefined;
}

/**
 * One B200 config swept at five concurrencies. `x` is interactivity on the
 * interactivity block and e2e latency on the e2e block; `y` is chip watts.
 * Power dips at conc 32, so the two corners select disjoint pairs apart from
 * that shared minimum:
 *   lower_right (max x, min watts) → conc 1 and conc 32
 *   lower_left  (min x, min watts) → conc 256 and conc 32
 * Both corners exclude conc 8 and conc 64, which are dominated — those are the
 * rows "Optimal Only" must hide.
 */
const SWEEP: { conc: number; x: number; watts: number }[] = [
  { conc: 1, x: 50, watts: 800 },
  { conc: 8, x: 40, watts: 1400 },
  { conc: 32, x: 30, watts: 600 },
  { conc: 64, x: 20, watts: 1200 },
  { conc: 256, x: 10, watts: 1000 },
];

function sweepPoints(metricField: string): InferenceData[] {
  return SWEEP.map(
    ({ conc, x, watts }) =>
      ({
        x,
        y: watts,
        hwKey: 'b200_sglang',
        model: 'DeepSeek-V4-Pro',
        date: '2026-08-01',
        tp: 8,
        conc,
        precision: 'fp8',
        [metricField]: { y: watts, roof: false },
      }) as unknown as InferenceData,
  );
}

/** Concurrencies on the frontier, in the order the production pareto fn emits. */
function frontierConcs(chartDef: ChartDefinition, metric: string): number[] {
  const direction = declaredDirection(chartDef, metric);
  expect(
    direction,
    `${metric} must declare a Pareto direction on the ${chartDef.chartType} chart`,
  ).toBeDefined();

  const metricField = (chartDef[metric as keyof ChartDefinition] as string).replace(/\.y$/u, '');
  const points = sweepPoints(metricField).filter(isFrontierEligible);
  return paretoFrontForDirection(direction!)(points).map((p) => p.conc);
}

describe('measured-power Pareto direction', () => {
  describe.each(MEASURED_POWER_METRICS)('%s', (metric) => {
    it('picks the lower-RIGHT frontier on the interactivity chart', () => {
      // Interactivity is higher-is-better, watts lower-is-better: the optimal
      // configs are the fast ones that also draw the least power.
      expect(frontierConcs(interactivityDef, metric)).toEqual([1, 32]);
    });

    it('picks the lower-LEFT frontier on the e2e-latency chart', () => {
      // The e2e block plots latency, where lower is also better, so the corner
      // mirrors. The `?? 'lower_right'` fallback in ScatterGraph would pick
      // [1, 32] here — the exact inversion this direction exists to prevent.
      expect(frontierConcs(e2eDef, metric)).toEqual([256, 32]);
    });

    it('excludes dominated configs from the Optimal Only set', () => {
      // "Optimal Only" renders exactly the frontier members, so the dominated
      // conc 8 / conc 64 points must not appear on either chart.
      for (const chartDef of [interactivityDef, e2eDef]) {
        const concs = frontierConcs(chartDef, metric);
        expect(concs).toHaveLength(2);
        expect(concs).not.toContain(8);
        expect(concs).not.toContain(64);
      }
    });

    it('sorts the table ascending — lowest watts first', () => {
      // The reported bug: with no declared direction the table sorted
      // descending and led with the 1400 W row.
      const metricField = (interactivityDef[metric as keyof ChartDefinition] as string).replace(
        /\.y$/u,
        '',
      );
      const sorted = sortRowsByYMetric(sweepPoints(metricField), interactivityDef, metric);
      expect(sorted.map((row) => row.conc)).toEqual([32, 1, 256, 64, 8]);
    });
  });

  it('keeps the measured-power axes pointing at a lower-is-better corner', () => {
    // A direction that is not a `lower_*` corner would flip the table back to
    // descending even though the frontier assertions above still passed.
    for (const chartDef of [interactivityDef, e2eDef]) {
      for (const metric of MEASURED_POWER_METRICS) {
        expect(declaredDirection(chartDef, metric)).toMatch(/^lower_/u);
      }
    }
  });

  it.each(QUERY_ENERGY_METRICS)('%s is bilingual and lower-is-better', (metric) => {
    expect(declaredDirection(interactivityDef, metric)).toBe('lower_right');
    expect(declaredDirection(e2eDef, metric)).toBe('lower_left');
    for (const chartDef of [interactivityDef, e2eDef]) {
      expect(chartDef[metric]).toMatch(/\.y$/u);
      expect(chartDef[`${metric}_label`]).toBeTruthy();
      expect(chartDef[`${metric}_labelZh`]).toBeTruthy();
    }
  });

  it.each(ROLE_ENERGY_METRICS)('%s is bilingual and lower-is-better', (metric) => {
    expect(declaredDirection(interactivityDef, metric)).toBe('lower_right');
    expect(declaredDirection(e2eDef, metric)).toBe('lower_left');
    for (const chartDef of [interactivityDef, e2eDef]) {
      expect(chartDef[metric]).toMatch(/\.y$/u);
      expect(chartDef[`${metric}_label`]).toBeTruthy();
      expect(chartDef[`${metric}_labelZh`]).toBeTruthy();
    }
  });

  it.each(BASIS_ENERGY_METRICS)('%s is bilingual and lower-is-better', (metric) => {
    expect(declaredDirection(interactivityDef, metric)).toBe('lower_right');
    expect(declaredDirection(e2eDef, metric)).toBe('lower_left');
    for (const chartDef of [interactivityDef, e2eDef]) {
      expect(chartDef[metric]).toMatch(/\.y$/u);
      expect(chartDef[`${metric}_label`]).toBeTruthy();
      expect(chartDef[`${metric}_labelZh`]).toBeTruthy();
    }
    // Energy uses the Pareto corner, not the power envelope: the dominated
    // sweep points drop out just as they do for measured joules.
    expect(frontierConcs(interactivityDef, metric)).toEqual([1, 32]);
    expect(frontierConcs(e2eDef, metric)).toEqual([256, 32]);
  });

  describe.each(BASIS_WATT_METRICS)('%s', (metric) => {
    it('draws the upper power envelope, not the Pareto corner, like measured watts', () => {
      // ScatterGraph/GPUGraph pick the curve by `isPowerCurveMetric`; a watt
      // boundary that misses that set would hide every dominated sweep point
      // under Optimal Only and, for a flat TDP series, collapse to one marker.
      expect(isPowerCurveMetric(metric)).toBe(true);
      expect(isPowerCurveMetric('y_measuredAvgPower')).toBe(true);
      // Envelope-locked like measured watts: with Optimal Only on, a Pareto
      // corner would keep one marker and draw no curve for a flat TDP series.
      expect(isMeasuredPowerCurveMetric(metric)).toBe(true);
      expect(isMeasuredPowerCurveMetric('y_modeledChassisPowerPerGpu')).toBe(false);
      expect(isMeasuredPowerCurveMetric('y_measuredAvgPower')).toBe(true);

      const metricField = (interactivityDef[metric] as string).replace(/\.y$/u, '');
      const envelope = upperPowerEnvelope(sweepPoints(metricField), true).map((p) => p.conc);
      // The 1400 W conc 8 peak survives on the envelope; the Pareto corner drops it.
      expect(envelope).toContain(8);
      expect(frontierConcs(interactivityDef, metric)).not.toContain(8);
    });
  });

  it.each(BASIS_ENERGY_METRICS)('%s stays off the power-envelope path', (metric) => {
    expect(isPowerCurveMetric(metric)).toBe(false);
    expect(isMeasuredPowerCurveMetric(metric)).toBe(false);
  });

  it('keeps %TDP bilingual while using the same per-hardware frontier as watts', () => {
    // A fixed hardware TDP rescales watts without changing dominance within
    // that hardware series. The shared sweep tests above exercise both axes.
    for (const chartDef of [interactivityDef, e2eDef]) {
      expect(chartDef.y_measuredPowerPercentTdp).toMatch(/\.y$/u);
      expect(chartDef['y_measuredPowerPercentTdp_label']).toBeTruthy();
      expect(chartDef['y_measuredPowerPercentTdp_labelZh']).toBeTruthy();
      expect(declaredDirection(chartDef, 'y_measuredPowerPercentTdp')).toBe(
        declaredDirection(chartDef, 'y_measuredAvgPower'),
      );
    }
  });
});

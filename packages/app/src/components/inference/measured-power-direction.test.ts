import { describe, it, expect } from 'vitest';

import chartDefinitions from '@/components/inference/metric-registry';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { sortRowsByYMetric } from '@/components/inference/ui/inference-table-sort';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/charts/chart-utils';

const MEASURED_POWER_METRICS = [
  'y_measuredAvgPower',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredPowerPercentTdp',
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
      expect(frontierConcs(interactivityDef, metric)).toEqual([1, 32]);
    });

    it('picks the lower-LEFT frontier on the e2e-latency chart', () => {
      expect(frontierConcs(e2eDef, metric)).toEqual([256, 32]);
    });

    it('excludes dominated configs from the Optimal Only set', () => {
      for (const chartDef of [interactivityDef, e2eDef]) {
        const concs = frontierConcs(chartDef, metric);
        expect(concs).toHaveLength(2);
        expect(concs).not.toContain(8);
        expect(concs).not.toContain(64);
      }
    });

    it('sorts the table ascending — lowest watts first', () => {
      const metricField = (interactivityDef[metric as keyof ChartDefinition] as string).replace(
        /\.y$/u,
        '',
      );
      const sorted = sortRowsByYMetric(sweepPoints(metricField), interactivityDef, metric);
      expect(sorted.map((row) => row.conc)).toEqual([32, 1, 256, 64, 8]);
    });
  });

  it('keeps the measured-power axes pointing at a lower-is-better corner', () => {
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

  it('keeps %TDP bilingual while using the same per-hardware frontier as watts', () => {
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

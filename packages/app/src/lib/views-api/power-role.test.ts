import { describe, expect, it } from 'bun:test';

import {
  POWERX_ROLES,
  powerXRolePools,
  resolvePowerXRole,
  type PowerXRole,
} from '@/components/inference/powerx/powerx-role';
import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import { expandPowerCompareSeries } from '@/components/inference/utils/power-compare';
import type { BenchmarkRow } from '@/lib/api/api';
import { transformBenchmarkRows } from '@/lib/benchmarks/benchmark-transform';
import { Sequence } from '@/lib/catalog/data-mappings';
import { remapInferencePoint } from '@/lib/charts/chart-utils';

import { ViewsApiParamError } from './errors';
import { resolvePowerRoleParams } from './power-role';
import { buildInferenceSeries, type InferenceSeriesOptions } from './series';

let nextId = 1;

/** One disaggregated GB300 Dynamo SGLang row with role telemetry, one aggregated MI355X row. */
const power = (watts: number) => ({
  tput_per_gpu: 400,
  output_tput_per_gpu: 300,
  input_tput_per_gpu: 2400,
  median_ttft: 0.2,
  p90_ttft: 0.3,
  median_intvty: 40,
  p90_intvty: 40,
  median_e2el: 2,
  power_valid: 1,
  power_metric_schema_version: 2,
  avg_power_w: watts,
  p75_power_w: watts * 1.1,
  p90_power_w: watts * 1.2,
  joules_per_output_token: 4,
  joules_per_input_token: 0.5,
  joules_per_total_token: 0.45,
});

function fixtureRows(): BenchmarkRow[] {
  const base = {
    precision: 'fp4',
    model: 'dsr1',
    spec_method: 'none',
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    isl: 8192,
    osl: 1024,
    image: 'img',
    date: '2026-03-01',
    run_url: 'https://github.com/org/repo/actions/runs/12345',
  };
  return [
    {
      ...base,
      id: nextId++,
      hardware: 'gb300',
      framework: 'dynamo-sglang',
      disagg: true,
      is_multinode: true,
      prefill_num_workers: 1,
      decode_num_workers: 1,
      num_prefill_gpu: 4,
      num_decode_gpu: 12,
      conc: 64,
      metrics: {
        ...power(900),
        prefill_avg_power_w: 700,
        decode_avg_power_w: 960,
        prefill_joules_per_input_token: 0.2,
        // Reconstructed prefill J/output = 0.2 × (4 ÷ 0.5) = 1.6, so 1.6 + 2.4 = 4.
        decode_joules_per_output_token: 2.4,
      },
    },
    {
      ...base,
      id: nextId++,
      hardware: 'mi355x',
      framework: 'sglang',
      disagg: false,
      is_multinode: false,
      prefill_num_workers: 0,
      decode_num_workers: 0,
      num_prefill_gpu: 8,
      num_decode_gpu: 8,
      conc: 64,
      metrics: power(1100),
    },
  ] as unknown as BenchmarkRow[];
}

const OPTIONS: Omit<InferenceSeriesOptions, 'metricConfigKey'> = {
  sequence: Sequence.EightK_OneK,
  percentile: 'p90',
  precisions: ['fp4'],
  xmode: 'interactivity',
  xmetric: 'p90_ttft',
  gpus: [],
  quickFilters: { vendors: [], frameworks: [], deployment: [], spec: [], power: [] },
  optimal: false,
  best: false,
  allPoints: true,
};

interface Drawn {
  hwKey: string;
  pool: string | null;
  x: number;
  y: number;
}
const sortDrawn = (points: Drawn[]) =>
  points.toSorted((a, b) => `${a.hwKey}${a.pool}`.localeCompare(`${b.hwKey}${b.pool}`));

/** The page's path: remap, resolve the role, expand per pool, keep the role's pools. */
function pagePoints(metric: string, role: PowerXRole, xField: string): Drawn[] {
  const { chartData } = transformBenchmarkRows(fixtureRows(), 'p90');
  const selection = resolvePowerXRole({ metric, compare: 'none' }, role);
  const key = selection.metric.slice(2) as keyof InferenceData;
  const remapped = chartData[0]
    .filter((point) => key in point)
    .map((point) =>
      remapInferencePoint(
        point,
        key as Parameters<typeof remapInferencePoint>[1],
        xField as keyof AggDataEntry,
      ),
    );
  const pools = new Set<string>(powerXRolePools(role));
  return expandPowerCompareSeries(remapped, selection.metric, selection.compare)
    .filter((point) =>
      role === 'all' ? !point.powerVariant : pools.has(point.powerVariant?.id ?? ''),
    )
    .map((point) => ({
      hwKey: point.hwKey,
      pool: role === 'all' ? null : point.powerVariant!.id,
      x: point.x,
      y: point.y,
    }));
}

function apiPoints(metric: string, roleParam: PowerXRole) {
  const powerRole = resolvePowerRoleParams(metric, roleParam);
  const result = buildInferenceSeries(fixtureRows(), {
    ...OPTIONS,
    metricConfigKey: powerRole.metric as InferenceSeriesOptions['metricConfigKey'],
    powerRole,
  });
  const drawn = result.series.flatMap((entry) =>
    entry.points.map((point) => ({
      hwKey: entry.hwKey,
      pool: entry.powerRole ?? null,
      x: point.x,
      y: point.y,
    })),
  );
  return { result, drawn };
}

describe('views API GPU role parity with the page', () => {
  describe.each([
    'y_measuredJPerOutputToken',
    'y_measuredJPerTotalToken',
    'y_measuredJPerInputToken',
    'y_measuredAvgPower',
    'y_measuredP90Power',
    'y_measuredPowerPercentTdp',
  ])('%s', (metric) => {
    it.each(POWERX_ROLES)('draws the same points as the page for role=%s', (role) => {
      const { result, drawn } = apiPoints(metric, role);
      expect(sortDrawn(drawn)).toEqual(sortDrawn(pagePoints(metric, role, result.xAxis.field)));
      if (role === 'all') {
        expect(result.roleAggregated).toBeUndefined();
        return;
      }
      // The aggregated MI355X row is listed, never drawn as a 0 W / 0 J pool.
      expect(drawn.every((point) => point.hwKey.startsWith('gb300'))).toBe(true);
      expect(drawn.length).toBeGreaterThan(0);
      expect(result.roleAggregated?.map((entry) => entry.hwKey)).toEqual(['mi355x_sglang']);
      expect(result.roleAggregated?.[0].reason).toBe('aggregated');
    });
  });

  it('splits J per output token so prefill + decode = measured', () => {
    const { drawn } = apiPoints('y_measuredJPerOutputToken', 'split');
    expect(drawn.map((point) => point.pool)).toEqual(['prefill', 'decode']);
    expect(drawn[0].y + drawn[1].y).toBeCloseTo(4, 9);
  });
});

describe('resolvePowerRoleParams', () => {
  it.each([
    ['y_measuredPrefillAvgPower', null, 'y_measuredAvgPower', 'prefill'],
    ['y_measuredDecodeAvgPower', null, 'y_measuredAvgPower', 'decode'],
    ['y_measuredPrefillJPerInputToken', null, 'y_measuredJPerInputToken', 'prefill'],
    ['y_measuredDecodeJPerOutputToken', null, 'y_measuredJPerOutputToken', 'decode'],
    ['y_measuredPrefillAvgPower', 'split', 'y_measuredAvgPower', 'split'],
  ])('rewrites the old role metric %s (role=%s)', (metric, role, expectedMetric, expectedRole) => {
    expect(resolvePowerRoleParams(metric, role)).toMatchObject({
      metric: expectedMetric,
      role: expectedRole,
    });
  });

  it('pins the metric the page pins and leaves all GPUs untouched', () => {
    expect(resolvePowerRoleParams('y_utilityModeledJPerTotalToken', 'decode')).toEqual({
      metric: 'y_measuredJPerOutputToken',
      compare: 'roles',
      role: 'decode',
    });
    expect(resolvePowerRoleParams('y_tpPerGpu', null)).toEqual({
      metric: 'y_tpPerGpu',
      compare: 'none',
      role: 'all',
    });
  });

  it('rejects unknown roles and roles on metrics with no GPU pools', () => {
    expect(() => resolvePowerRoleParams('y_measuredAvgPower', 'roles')).toThrow(ViewsApiParamError);
    expect(() => resolvePowerRoleParams('y_tpPerGpu', 'prefill')).toThrow(ViewsApiParamError);
    expect(() => resolvePowerRoleParams('y_measuredPowerTimeline', 'split')).toThrow(
      ViewsApiParamError,
    );
  });
});

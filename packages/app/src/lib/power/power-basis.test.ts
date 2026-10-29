import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmarks/benchmark-transform';
import { buildDerivedChartFields, getHardwareKey } from '@/lib/charts/chart-utils';
import { POWER_BASIS_FIELDS } from '@/lib/power/power-basis';
import { SYSTEM_POWER_CATEGORIES } from '@/lib/power/system-power-model';
import { Sequence } from '@/lib/catalog/data-mappings';
import { buildInferenceSeries } from '@/lib/views-api/series';
import { rowToLightweightPoint } from '@/components/inference/hooks/interpolated-trend-core';
import { processOverlayChartDataWithClipping } from '@/components/inference/utils';

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 441192,
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-08',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 349.859,
      avg_total_gpu_power_w: 2798.868,
      total_gpu_energy_j: 120361.299,
      joules_per_output_token: 12.937902,
      joules_per_total_token: 12.937902 / 9,
      tput_per_gpu: 270,
      output_tput_per_gpu: 30,
      pp: 1,
      pcp_size: 1,
      median_intvty: 100,
    },
    ...overrides,
  };
}

function derive(source: BenchmarkRow) {
  const entry = rowToAggDataEntry(source);
  const hwKey = getHardwareKey(entry);
  return { entry, hwKey, fields: buildDerivedChartFields(entry, hwKey) };
}

describe('power boundaries through the derived-field builder', () => {
  it.each([
    ['b200', 8, 2, 1, 16, 759.752, 12156.029],
    ['h200', 16, 1, 2, 32, 167.357, 5355.413],
  ] as const)(
    'retains AgentX %s multinode estimates across chart and public view',
    (hardware, tp, pp, replicas, gpus, watts, totalWatts) => {
      const source = row({
        hardware,
        model: 'kimik3',
        precision: 'fp4',
        framework: hardware === 'b200' ? 'dynamo-vllm' : 'vllm',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        is_multinode: true,
        prefill_tp: tp,
        decode_tp: tp,
        prefill_ep: hardware === 'h200' ? 32 : 1,
        decode_ep: hardware === 'h200' ? 32 : 1,
        prefill_dp_attention: hardware === 'h200',
        decode_dp_attention: hardware === 'h200',
        prefill_num_workers: replicas,
        decode_num_workers: replicas,
        num_prefill_gpu: gpus,
        num_decode_gpu: gpus,
        metrics: {
          ...row().metrics,
          avg_power_w: watts,
          avg_total_gpu_power_w: totalWatts,
          prefill_pp: pp,
          decode_pp: pp,
          p90_itl: 0.05,
        },
      });
      const { entry, fields } = derive(source);
      expect(entry.modeledSystemPower).toMatchObject({ status: 'supported', gpuCount: gpus });
      expect(fields.utilityModeledWatts?.y).toBeGreaterThan(watts);
      expect(fields.utilityModeledJPerOutputToken?.y).toBeGreaterThan(
        source.metrics.joules_per_output_token,
      );
      const historical = rowToLightweightPoint({ ...source, date: '2026-08-01' }, [
        'utilityModeledWatts',
        'utilityModeledJPerOutputToken',
      ]);
      expect(historical?.utilityModeledWatts).toEqual(fields.utilityModeledWatts);
      expect(historical?.utilityModeledJPerOutputToken).toEqual(
        fields.utilityModeledJPerOutputToken,
      );
      const { chartData } = transformBenchmarkRows([source], 'p90', 'external');
      expect(chartData[0][0].utilityModeledWatts).toEqual(fields.utilityModeledWatts);
      const result = buildInferenceSeries([source], {
        sequence: Sequence.AgenticTraces,
        percentile: 'p90',
        precisions: ['fp4'],
        metricConfigKey: 'y_utilityModeledWatts',
        xmode: 'interactivity',
        xmetric: 'p90_ttft',
        gpus: [],
        quickFilters: { vendors: [], frameworks: [], deployment: [], spec: [], power: [] },
        optimal: false,
        best: false,
      });
      expect(result.count).toBe(1);
      expect(result.series[0].points[0].y).toBe(fields.utilityModeledWatts?.y);
    },
  );

  it('derives the IT (no PUE) boundary as the facility figure minus the PUE overhead', () => {
    const { entry, fields } = derive(row());
    expect(entry.modeledSystemPower?.status).toBe('supported');
    if (entry.modeledSystemPower?.status !== 'supported') return;
    const model = entry.modeledSystemPower;
    const itWatts = fields.itModeledWatts?.y;
    const facility = fields.utilityModeledWatts?.y;
    expect(itWatts).toBeGreaterThan(row().metrics.avg_power_w);
    expect(itWatts).toBeLessThan(facility!);
    // IT = deployment IT watts over the measured GPU count = the stacked parts minus facility.
    expect(itWatts).toBeCloseTo(model.deploymentItWatts / model.gpuCount, 9);
    const parts = model.deploymentBreakdownWatts;
    const stackedIt =
      SYSTEM_POWER_CATEGORIES.filter((key) => key !== 'facility').reduce(
        (sum, key) => sum + parts[key],
        0,
      ) / model.gpuCount;
    expect(itWatts).toBeCloseTo(stackedIt, 6);
    expect(facility).toBeCloseTo(itWatts! + parts.facility / model.gpuCount, 6);
    // Both modeled energies scale measured J/token by their watt ratio.
    expect(fields.itModeledJPerOutputToken?.y).toBeCloseTo(
      (row().metrics.joules_per_output_token * itWatts!) / row().metrics.avg_power_w,
      9,
    );
    expect(fields.itModeledJPerOutputToken?.y).toBeLessThan(
      fields.utilityModeledJPerOutputToken!.y,
    );
    expect(fields.itModeledJPerTotalToken?.y).toBeCloseTo(
      (row().metrics.joules_per_total_token * itWatts!) / row().metrics.avg_power_w,
      9,
    );
    expect(POWER_BASIS_FIELDS['it-modeled']).toEqual({
      watts: 'itModeledWatts',
      joulesPerOutputToken: 'itModeledJPerOutputToken',
      joulesPerTotalToken: 'itModeledJPerTotalToken',
    });
  });

  it.each(['single_turn', 'agentic_traces'] as const)(
    'keeps %s GPU boundaries when an NVL72 row is not whole compute trays',
    (benchmark_type) => {
      const { entry, fields } = derive(row({ hardware: 'gb200', benchmark_type }));
      expect(entry.modeledSystemPower).toMatchObject({ status: 'unsupported', reason: 'topology' });
      expect(fields.measuredAvgPower).toBeDefined();
      expect(fields.gpuProvisionedJPerOutputToken).toBeDefined();
      expect(fields.utilityProvisionedJPerOutputToken).toBeDefined();
      expect(fields.utilityModeledWatts).toBeUndefined();
      expect(fields.utilityModeledJPerOutputToken).toBeUndefined();
      expect(fields.itModeledWatts).toBeUndefined();
      expect(fields.itModeledJPerOutputToken).toBeUndefined();
    },
  );

  it.each(['single_turn', 'agentic_traces'] as const)(
    'derives %s All in Measured for an NVL72 tray with GPU-only telemetry',
    (benchmark_type) => {
      const tray = row({
        hardware: 'gb200',
        benchmark_type,
        prefill_tp: 4,
        decode_tp: 4,
        num_prefill_gpu: 4,
        num_decode_gpu: 4,
        metrics: { ...row().metrics, avg_total_gpu_power_w: 1399.436 },
      });
      const { entry, fields } = derive(tray);
      expect(entry.modeledSystemPower).toMatchObject({
        status: 'supported',
        unit: 'nvl72-tray',
        cpuBasis: 'modeled',
      });
      expect(fields.utilityModeledWatts?.y).toBeGreaterThan(tray.metrics.avg_power_w);
      expect(fields.utilityModeledJPerOutputToken?.y).toBeGreaterThan(
        tray.metrics.joules_per_output_token,
      );
    },
  );

  it.each(['power_valid', 'avg_power_w', 'avg_total_gpu_power_w'])(
    'omits AgentX All in Measured when GPU telemetry lacks %s',
    (missingMetric) => {
      const metrics = { ...row().metrics };
      delete metrics[missingMetric];
      const { entry, fields } = derive(row({ benchmark_type: 'agentic_traces', metrics }));
      expect(entry.modeledSystemPower?.status).toBe('unsupported');
      expect(fields.utilityModeledWatts).toBeUndefined();
      expect(fields.utilityModeledJPerOutputToken).toBeUndefined();
    },
  );

  it('serves the same fields to ?unofficialrun= overlays through transformBenchmarkRows', () => {
    const { chartData } = transformBenchmarkRows([row()], 'median', 'external');
    const point = chartData[0][0];
    const official = derive(row()).fields;
    for (const fields of Object.values(POWER_BASIS_FIELDS)) {
      for (const field of Object.values(fields)) {
        expect(point[field], field).toEqual(official[field]);
        expect(point[field]?.roof, field).toBe(false);
      }
    }
  });
});

function disaggRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return row({
    disagg: true,
    is_multinode: true,
    workers: [
      { role: 'prefill', worker_idx: 0, num_gpus: 8, hosts: ['prefill-node'], avg_power_w: 300 },
      { role: 'decode', worker_idx: 0, num_gpus: 8, hosts: ['decode-node'], avg_power_w: 700 },
    ],
    metrics: {
      ...row().metrics,
      avg_power_w: 500,
      avg_total_gpu_power_w: 8000,
      prefill_avg_power_w: 300,
      decode_avg_power_w: 700,
      joules_per_output_token: 9,
      joules_per_total_token: 1,
      tput_per_gpu: 270,
      output_tput_per_gpu: 60,
    },
    ...overrides,
  });
}

describe('J per total token at every power boundary', () => {
  it.each([
    ['aggregate', row()],
    ['disaggregated single_turn', disaggRow()],
  ] as const)('keeps the measured token mix on every %s boundary', (_, source) => {
    const { fields } = derive(source);
    const tokenMix = source.metrics.joules_per_output_token / source.metrics.joules_per_total_token;
    for (const [perOutput, perTotal] of [
      ['measuredJPerOutputToken', 'measuredJPerTotalToken'],
      ['gpuProvisionedJPerOutputToken', 'gpuProvisionedJPerTotalToken'],
      ['utilityProvisionedJPerOutputToken', 'utilityProvisionedJPerTotalToken'],
      ['utilityModeledJPerOutputToken', 'utilityModeledJPerTotalToken'],
    ] as const) {
      expect(fields[perTotal]?.y, perTotal).toBeGreaterThan(0);
      expect(fields[perOutput]!.y / fields[perTotal]!.y, perTotal).toBeCloseTo(tokenMix, 9);
    }
    expect(fields.utilityProvisionedJPerTotalToken?.y).toBeCloseTo(fields.jTotal!.y, 9);
  });

  it('withholds provisioned J per total token where output energy is withheld', () => {
    const { fields } = derive(disaggRow({ benchmark_type: 'agentic_traces' }));
    expect(fields.jTotal).toBeDefined();
    expect(fields.gpuProvisionedJPerOutputToken).toBeUndefined();
    expect(fields.gpuProvisionedJPerTotalToken).toBeUndefined();
    expect(fields.utilityProvisionedJPerTotalToken).toBeUndefined();
  });

  it.each(['power_valid', 'avg_power_w'])(
    'withholds All in Measured J per total token when GPU telemetry lacks %s',
    (missingMetric) => {
      const metrics = { ...row().metrics };
      delete metrics[missingMetric];
      const { fields } = derive(row({ metrics }));
      expect(fields.utilityModeledJPerOutputToken).toBeUndefined();
      expect(fields.utilityModeledJPerTotalToken).toBeUndefined();
    },
  );

  it('draws J per total token boundary siblings for ?unofficialrun= overlay points', () => {
    const { chartData } = transformBenchmarkRows([row()], 'median', 'external');
    const official = derive(row()).fields;
    const { data } = processOverlayChartDataWithClipping(
      chartData[0],
      'interactivity',
      'y_measuredJPerTotalToken',
      null,
      { powerCompare: 'all' },
    );
    expect(data.map((point) => [point.powerVariant?.id ?? 'base', point.y])).toEqual([
      ['base', official.measuredJPerTotalToken?.y],
      ['gpu-provisioned', official.gpuProvisionedJPerTotalToken?.y],
      ['utility-provisioned', official.utilityProvisionedJPerTotalToken?.y],
      ['it-modeled', official.itModeledJPerTotalToken?.y],
      ['utility-modeled', official.utilityModeledJPerTotalToken?.y],
    ]);
  });
});

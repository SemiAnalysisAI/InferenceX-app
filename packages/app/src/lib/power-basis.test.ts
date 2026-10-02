import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { buildDerivedChartFields, getHardwareKey } from '@/lib/chart-utils';
import { POWER_BASIS_FIELDS } from '@/lib/power-basis';
import { Sequence } from '@/lib/data-mappings';
import { buildInferenceSeries } from '@/lib/views-api/series';
import { rowToLightweightPoint } from '@/components/inference/hooks/interpolated-trend-core';

// Qwen3.5 B200 c1, run 34175132645: actual rounded telemetry, eight GPUs
// (same fixture as modeled-system-power.test.ts) plus an output rate.
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
      tput_per_gpu: 270,
      output_tput_per_gpu: 30,
      pp: 1,
      pcp_size: 1,
      median_intvty: 100,
    },
    ...overrides,
  };
}

/** Full official-path derivation for one row with real HW_REGISTRY specs. */
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
      // Topologies from Kimi K3 rows 441678 / 441866; aggregate role counts share devices.
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
      expect(fields.modeledChassisPowerPerGpu).toBeUndefined();
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

  it.each(['single_turn', 'agentic_traces'] as const)(
    'keeps %s GPU boundaries when NVL72 CPU telemetry is unavailable',
    (benchmark_type) => {
      const { entry, fields } = derive(row({ hardware: 'gb200', benchmark_type }));
      expect(entry.modeledSystemPower).toMatchObject({
        status: 'unsupported',
        reason: 'cpu-telemetry',
      });
      expect(fields.measuredAvgPower).toBeDefined();
      expect(fields.gpuProvisionedWatts).toBeDefined();
      expect(fields.utilityProvisionedWatts).toBeDefined();
      expect(fields.utilityModeledWatts).toBeUndefined();
      expect(fields.utilityModeledJPerOutputToken).toBeUndefined();
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

  it('retains the standalone 8K/1K chassis AC metric', () => {
    expect(derive(row()).fields.modeledChassisPowerPerGpu?.y).toBeGreaterThan(0);
  });

  it('serves the same fields to ?unofficialrun= overlays through transformBenchmarkRows', () => {
    const { chartData } = transformBenchmarkRows([row()], 'median', 'external');
    const point = chartData[0][0];
    const official = derive(row()).fields;
    for (const basis of Object.values(POWER_BASIS_FIELDS)) {
      expect(point[basis.watts]).toEqual(official[basis.watts]);
      expect(point[basis.energy]).toEqual(official[basis.energy]);
      expect(point[basis.watts]?.roof).toBe(false);
    }
  });
});

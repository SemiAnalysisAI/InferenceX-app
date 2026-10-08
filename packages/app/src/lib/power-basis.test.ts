import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry, transformBenchmarkRows } from '@/lib/benchmark-transform';
import { buildDerivedChartFields, getHardwareKey } from '@/lib/chart-utils';
import { POWER_BASIS_FIELDS } from '@/lib/power-basis';

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

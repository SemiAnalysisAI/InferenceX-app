import { describe, expect, it } from 'vitest';
import type { InferenceData } from '@/components/inference/types';
import { powerValue } from './powerx-data';

const specs = { tdp: 700, power: 1.37 };
const row: Partial<InferenceData> = {
  avg_power_w: 350,
  joules_per_output_token: 7,
  output_tput_per_gpu: 50,
  power_valid: 1,
  power_metric_schema_version: 2,
};
describe('PowerX boundaries', () => {
  it('keeps GPU TDP and facility allocation separate from measured inputs', () => {
    expect(powerValue(row, 'gpu-provisioned', 'energy', specs)).toEqual({ value: 14 });
    expect(powerValue(row, 'utility-provisioned', 'energy', specs)).toEqual({ value: 27.4 });
    expect(powerValue(row, 'utility-provisioned', 'watts', specs)).toEqual({ value: 1370 });
  });
  it('normalizes fixed-sequence decode throughput to all GPUs, without double-counting AgentX or aggregate serving', () => {
    const disagg = {
      ...row,
      disagg: true,
      benchmark_type: 'single_turn',
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    };
    expect(powerValue(disagg, 'gpu-provisioned', 'energy', specs)).toEqual({ value: 28 });
    expect(powerValue(disagg, 'utility-provisioned', 'energy', specs)).toEqual({ value: 54.8 });
    expect(
      powerValue(
        { ...disagg, benchmark_type: 'agentic_traces' },
        'gpu-provisioned',
        'energy',
        specs,
      ),
    ).toEqual({ value: 14 });
    expect(powerValue({ ...disagg, disagg: false }, 'gpu-provisioned', 'energy', specs)).toEqual({
      value: 14,
    });
    expect(
      powerValue({ ...disagg, num_prefill_gpu: 0 }, 'gpu-provisioned', 'energy', specs),
    ).toEqual({ value: null, reason: 'missing' });
  });
  it('uses the modeled deployment share and same-window energy denominator', () => {
    const modeled: Partial<InferenceData> = {
      ...row,
      modeledSystemPower: {
        status: 'supported',
        hardware: 'h200',
        modelRevision: 'test',
        modelPath: 'test',
        gpuCount: 4,
        chassisCount: 1,
        modeledGpuCount: 8,
        measuredGpuWattsPerGpu: 350,
        chassisAcWatts: 4000,
        chassisAcWattsPerGpu: 500,
        facilityWatts: 5200,
        deploymentAcWatts: 2000,
        deploymentFacilityWatts: 2600,
        pue: 1.3,
        telemetryBasis: 'validated-v2',
        topologyBasis: 'single-node',
        chassisBasis: 'extrapolated',
      },
    };
    expect(powerValue(modeled, 'utility-modeled', 'watts', specs)).toEqual({ value: 650 });
    expect(powerValue(modeled, 'utility-modeled', 'energy', specs)).toEqual({ value: 13 });
  });
  it.each([undefined, 0, -1, NaN, Infinity])(
    'does not turn missing/invalid values into zero (%s)',
    (value) => {
      expect(
        powerValue({ ...row, joules_per_output_token: value }, 'utility-modeled', 'energy', specs)
          .value,
      ).toBeNull();
      expect(
        powerValue({ ...row, output_tput_per_gpu: value }, 'gpu-provisioned', 'energy', specs)
          .value,
      ).toBeNull();
    },
  );
  it('rejects legacy or failed telemetry but retains independent provisioned values', () => {
    expect(powerValue({ ...row, power_valid: 0 }, 'utility-modeled', 'watts', specs)).toEqual({
      value: null,
      reason: 'invalid',
    });
    expect(
      powerValue(
        { ...row, power_metric_schema_version: undefined },
        'utility-modeled',
        'energy',
        specs,
      ),
    ).toEqual({ value: null, reason: 'unverified' });
    expect(powerValue(row, 'utility-modeled', 'energy', specs)).toEqual({
      value: null,
      reason: 'unsupported',
    });
    expect(powerValue({ ...row, power_valid: 0 }, 'gpu-provisioned', 'watts', specs).value).toBe(
      700,
    );
  });
});

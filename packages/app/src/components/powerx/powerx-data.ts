import type { AggDataEntry } from '@/components/inference/types';

export const POWER_BASES = [
  'gpu-measured',
  'gpu-provisioned',
  'utility-provisioned',
  'utility-modeled',
] as const;
export type PowerBasis = (typeof POWER_BASES)[number];
export type PowerQuantity = 'watts' | 'energy';

export const POWERX_METRICS = {
  powerxGpuProvisionedWatts: { basis: 'gpu-provisioned', quantity: 'watts' },
  powerxGpuProvisionedEnergy: { basis: 'gpu-provisioned', quantity: 'energy' },
  powerxUtilityProvisionedWatts: { basis: 'utility-provisioned', quantity: 'watts' },
  powerxUtilityProvisionedEnergy: { basis: 'utility-provisioned', quantity: 'energy' },
  powerxUtilityModeledWatts: { basis: 'utility-modeled', quantity: 'watts' },
  powerxUtilityModeledEnergy: { basis: 'utility-modeled', quantity: 'energy' },
} as const satisfies Record<string, { basis: PowerBasis; quantity: PowerQuantity }>;
export type PowerXMetricKey = keyof typeof POWERX_METRICS;
export function getPowerXMetric(
  configKey: string,
): { basis: PowerBasis; quantity: PowerQuantity } | undefined {
  const key = configKey.replace(/^y_/u, '');
  return Object.hasOwn(POWERX_METRICS, key) ? POWERX_METRICS[key as PowerXMetricKey] : undefined;
}

type PowerInput = Partial<
  Pick<
    AggDataEntry,
    | 'output_tput_per_gpu'
    | 'disagg'
    | 'benchmark_type'
    | 'num_prefill_gpu'
    | 'num_decode_gpu'
    | 'power_valid'
    | 'power_metric_schema_version'
    | 'avg_power_w'
    | 'joules_per_output_token'
    | 'modeledSystemPower'
  >
>;

export type PowerUnavailable = 'invalid' | 'unverified' | 'missing' | 'unsupported';
export type PowerValue =
  | { value: number; reason?: never }
  | { value: null; reason: PowerUnavailable };

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** All watts are per physical GPU; all energy uses successful output tokens.
 * Modeled energy scales the producer's same-window E/N by modeled/measured W.
 * This is a mean-input estimate, never integrated wall-power telemetry.
 */
export function powerValue(
  point: PowerInput,
  basis: Exclude<PowerBasis, 'gpu-measured'>,
  quantity: PowerQuantity,
  specs: { tdp: number; power: number },
): PowerValue {
  if (basis === 'gpu-provisioned' || basis === 'utility-provisioned') {
    const watts = basis === 'gpu-provisioned' ? specs.tdp : specs.power * 1000;
    if (!positive(watts)) return { value: null, reason: 'unsupported' };
    if (quantity === 'watts') return { value: watts };
    let throughput = point.output_tput_per_gpu;
    // Fixed-sequence producer throughput is per decode GPU for disaggregation;
    // provisioned power covers both pools. AgentX already divides by all GPUs.
    if (point.disagg && point.benchmark_type !== 'agentic_traces') {
      const prefill = point.num_prefill_gpu,
        decode = point.num_decode_gpu;
      if (
        point.benchmark_type !== 'single_turn' ||
        !positive(prefill) ||
        !positive(decode) ||
        !Number.isSafeInteger(prefill) ||
        !Number.isSafeInteger(decode) ||
        !positive(throughput)
      )
        return { value: null, reason: 'missing' };
      throughput = (throughput * decode) / (prefill + decode);
    }
    return positive(throughput) && positive(watts / throughput)
      ? { value: watts / throughput }
      : { value: null, reason: 'missing' };
  }
  if (point.power_valid === 0) return { value: null, reason: 'invalid' };
  const model = point.modeledSystemPower;
  // Reuse the shared model's audited historical single-node power contract.
  // That contract alone does not validate a same-window energy denominator.
  const validatedLegacyPower =
    quantity === 'watts' &&
    point.power_metric_schema_version === undefined &&
    model?.status === 'supported' &&
    model.telemetryBasis === 'validated-unversioned-single-node';
  if (point.power_valid !== 1 || (point.power_metric_schema_version !== 2 && !validatedLegacyPower))
    return { value: null, reason: 'unverified' };
  const measured = quantity === 'watts' ? point.avg_power_w : point.joules_per_output_token;
  if (!positive(measured)) return { value: null, reason: 'missing' };
  if (model?.status !== 'supported') return { value: null, reason: 'unsupported' };
  if (
    !positive(model.deploymentFacilityWatts) ||
    !positive(model.gpuCount) ||
    !positive(point.avg_power_w)
  )
    return { value: null, reason: 'missing' };
  const watts = model.deploymentFacilityWatts / model.gpuCount;
  const value = quantity === 'watts' ? watts : (measured * watts) / point.avg_power_w;
  return positive(value) ? { value } : { value: null, reason: 'missing' };
}

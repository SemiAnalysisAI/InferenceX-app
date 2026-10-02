/**
 * Power boundaries for one benchmark point, from the GPU board out to the
 * utility meter. Pure numbers only — no React, DOM, or registry imports — so
 * the derived-field builder, overlays, and tests share one formula set.
 *
 * | Basis                  | W / GPU                                          | J / output token                          |
 * | ---------------------- | ------------------------------------------------ | ----------------------------------------- |
 * | B1 gpu-measured        | `avg_power_w` (existing `measuredAvgPower`)      | `joules_per_output_token` (existing)      |
 * | B2 gpu-provisioned     | `HW_REGISTRY.tdp`                                | W × N_alloc ÷ total output tok/s          |
 * | B3 utility-provisioned | `HW_REGISTRY.power` × 1000                       | W × N_alloc ÷ total output tok/s          |
 * | B4 utility-modeled     | modeled `deploymentFacilityWatts` ÷ `gpuCount`   | B1 J/out × (B4 W ÷ B1 W)                  |
 *
 * N_alloc counts every allocated GPU (prefill + decode for disaggregation);
 * total output tok/s is the whole deployment's. B4 reuses the estimate that
 * `modelSystemPower` already attached to the entry — PUE is applied exactly
 * once inside that model, never here — and is withheld wherever B1 is.
 * Unavailable values are `null`; callers omit the field rather than plotting 0.
 */
import type { AggDataEntry, InferenceData, PowerBasisFieldKey } from '@/components/inference/types';

export const POWER_BASES = [
  'gpu-measured',
  'gpu-provisioned',
  'utility-provisioned',
  'utility-modeled',
] as const;
export type PowerBasis = (typeof POWER_BASES)[number];
export type PowerQuantity = 'watts' | 'energy';

export const POWER_BASIS_LABELS: Record<PowerBasis, { en: string; zh: string }> = {
  'gpu-measured': { en: 'GPU Level Measured', zh: 'GPU 实测功耗' },
  'gpu-provisioned': { en: 'GPU Level Provisioned (TDP)', zh: 'GPU 额定功耗（TDP）' },
  'utility-provisioned': { en: 'All in Provisioned', zh: '整体预配功耗' },
  'utility-modeled': { en: 'All in Measured', zh: '整体实测功耗' },
};

export const ALL_IN_MEASURED_NOTE = {
  en: 'GPU power is measured; unmeasured components are modeled, with PUE included.',
  zh: 'GPU 功耗来自实测；未实测的组件功耗由模型估算，并计入数据中心 PUE。',
};

export const ALL_IN_MEASURED_EMPTY = {
  en: 'No values are available for All in Measured in this selection. This boundary needs 8K / 1K, validated GPU telemetry, and hardware covered by the chassis power model (not NVL72 systems). Choose another boundary to keep the points.',
  zh: '当前选择没有可用的整体实测功耗数值。该边界需要 8K / 1K 场景、已验证的 GPU 遥测，且硬件在机箱功耗模型覆盖范围内（不含 NVL72 系统）。可切换到其他功耗边界以保留数据点。',
};

/** InferenceData keys per derived basis and quantity. B1 lives on the measured* fields. */
export const POWER_BASIS_FIELDS: Record<
  Exclude<PowerBasis, 'gpu-measured'>,
  Record<PowerQuantity, PowerBasisFieldKey>
> = {
  'gpu-provisioned': {
    watts: 'gpuProvisionedWatts',
    energy: 'gpuProvisionedJPerOutputToken',
  },
  'utility-provisioned': {
    watts: 'utilityProvisionedWatts',
    energy: 'utilityProvisionedJPerOutputToken',
  },
  'utility-modeled': {
    watts: 'utilityModeledWatts',
    energy: 'utilityModeledJPerOutputToken',
  },
};

export interface PowerBasisInput {
  /** B2 W/GPU: HW_REGISTRY tdp. 0 means the spec is not yet available. */
  tdpWatts: number | null;
  /** B3 W/GPU: HW_REGISTRY all-in power, already in watts. */
  utilityWatts: number | null;
  /** Every GPU the deployment occupies (prefill + decode for disaggregation). */
  allocatedGpus: number | null;
  /** Whole-deployment successful output tokens per second. */
  totalOutputTokPerSec: number | null;
  /** B1 W/GPU from validated telemetry. */
  measuredWatts: number | null;
  /** B1 J/output token from the same telemetry window. */
  measuredJPerOutputToken: number | null;
  /**
   * B4 W/GPU: modeled facility watts (PUE already applied) per measured GPU.
   * B4 is a scaling of B1, so it is withheld whenever `measuredWatts` is null.
   */
  modeledFacilityWattsPerGpu: number | null;
}

export type PowerBasisValues = Record<PowerBasisFieldKey, number | null>;

export const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const count = (value: unknown): value is number => isPositive(value) && Number.isSafeInteger(value);
const orNull = (value: number): number | null => (isPositive(value) ? value : null);

/**
 * Derives the B2–B4 boundary values from plain numbers. Any unavailable input
 * yields `null` for the values that depend on it and leaves the rest intact.
 */
export function computePowerBasisFields(input: PowerBasisInput): PowerBasisValues {
  const tdp = isPositive(input.tdpWatts) ? input.tdpWatts : null;
  const utility = isPositive(input.utilityWatts) ? input.utilityWatts : null;
  const measuredWatts = isPositive(input.measuredWatts) ? input.measuredWatts : null;
  const measuredJ = isPositive(input.measuredJPerOutputToken)
    ? input.measuredJPerOutputToken
    : null;
  // B4 is B1 carried out to the utility meter, so it follows B1's availability:
  // no measured watts, no modeled boundary (B3 ≥ B4 ≥ B1 needs its anchor).
  const modeled =
    measuredWatts !== null && isPositive(input.modeledFacilityWattsPerGpu)
      ? input.modeledFacilityWattsPerGpu
      : null;

  // Provisioned energy: GPU-seconds spent per output token by the whole
  // deployment (N_alloc ÷ total tok/s) × W per GPU = J per output token.
  const gpuSecondsPerOutputToken =
    isPositive(input.allocatedGpus) && isPositive(input.totalOutputTokPerSec)
      ? input.allocatedGpus / input.totalOutputTokPerSec
      : null;
  const provisionedEnergy = (watts: number | null) =>
    watts !== null && gpuSecondsPerOutputToken !== null
      ? orNull(watts * gpuSecondsPerOutputToken)
      : null;

  // Modeled energy scales the producer's same-window E/N by modeled ÷ measured W,
  // so it inherits B1's token denominator instead of re-deriving one.
  const modeledEnergy =
    modeled !== null && measuredWatts !== null && measuredJ !== null
      ? orNull((measuredJ * modeled) / measuredWatts)
      : null;

  return {
    gpuProvisionedWatts: tdp,
    gpuProvisionedJPerOutputToken: provisionedEnergy(tdp),
    utilityProvisionedWatts: utility,
    utilityProvisionedJPerOutputToken: provisionedEnergy(utility),
    utilityModeledWatts: modeled,
    utilityModeledJPerOutputToken: modeledEnergy,
  };
}

type PowerBasisEntry = Pick<
  AggDataEntry,
  | 'output_tput_per_gpu'
  | 'disagg'
  | 'benchmark_type'
  | 'num_prefill_gpu'
  | 'num_decode_gpu'
  | 'avg_power_w'
  | 'joules_per_output_token'
  | 'modeledSystemPower'
>;

/**
 * Whole-deployment normalization for the provisioned energies. Aggregate rows
 * already report output per allocated GPU, so N_alloc cancels and the ratio
 * 1 GPU : per-GPU throughput is exact without trusting display counts (legacy
 * ingest can encode TP × EP twice). Fixed-sequence disaggregated rows report
 * output per decode GPU while the deployment also powers the prefill pool, so
 * total output = per-GPU × decode GPUs and N_alloc = prefill + decode GPUs.
 * Other disaggregated benchmark types are left out: whether AgentX throughput
 * already divides by all GPUs is not verifiable in-app.
 */
export function powerBasisNormalization(
  entry: Pick<
    PowerBasisEntry,
    'output_tput_per_gpu' | 'disagg' | 'benchmark_type' | 'num_prefill_gpu' | 'num_decode_gpu'
  >,
): Pick<PowerBasisInput, 'allocatedGpus' | 'totalOutputTokPerSec'> {
  const perGpu = entry.output_tput_per_gpu;
  const unavailable = { allocatedGpus: null, totalOutputTokPerSec: null };
  if (!isPositive(perGpu)) return unavailable;
  if (!entry.disagg) return { allocatedGpus: 1, totalOutputTokPerSec: perGpu };
  if (entry.benchmark_type !== 'single_turn') return unavailable;
  const prefill = entry.num_prefill_gpu;
  const decode = entry.num_decode_gpu;
  if (!count(prefill) || !count(decode)) return unavailable;
  return { allocatedGpus: prefill + decode, totalOutputTokPerSec: perGpu * decode };
}

/**
 * B4 W/GPU from the estimate `rowToAggDataEntry` attached. The model owns
 * telemetry admission: `modelSystemPower` requires `power_valid === 1` plus
 * schema v2, or the validated unversioned single-node producer it records as
 * `telemetryBasis: 'validated-unversioned-single-node'`. That is the same
 * population the app plots as B1 (`measuredAvgPower`) and as
 * `modeledChassisPowerPerGpu`, so B4 renders exactly where they do. The public
 * API's stricter `strictV2` row filter is not re-applied here; it is not
 * applied to the chart's B1 either.
 */
export function modeledFacilityWattsPerGpu(
  entry: Pick<PowerBasisEntry, 'modeledSystemPower'>,
): number | null {
  const model = entry.modeledSystemPower;
  if (model?.status !== 'supported') return null;
  if (!isPositive(model.deploymentFacilityWatts) || !count(model.gpuCount)) return null;
  return orNull(model.deploymentFacilityWatts / model.gpuCount);
}

export type PowerBasisChartFields = Partial<Pick<InferenceData, PowerBasisFieldKey>>;

/**
 * Chart-shaped B2–B4 fields for one entry. Keys are present only for finite,
 * positive values: the metric filters drop a point by `metricKey in point`,
 * and the coordinate remap falls back to raw throughput when a key exists
 * with an unusable value.
 */
export function buildPowerBasisChartFields(
  entry: PowerBasisEntry,
  specs: { tdp?: number; power?: number },
): PowerBasisChartFields {
  const values = computePowerBasisFields({
    tdpWatts: specs.tdp ?? null,
    utilityWatts: isPositive(specs.power) ? specs.power * 1000 : null,
    ...powerBasisNormalization(entry),
    measuredWatts: entry.avg_power_w ?? null,
    measuredJPerOutputToken: entry.joules_per_output_token ?? null,
    modeledFacilityWattsPerGpu: modeledFacilityWattsPerGpu(entry),
  });
  const fields: PowerBasisChartFields = {};
  for (const key of Object.keys(values) as PowerBasisFieldKey[]) {
    const y = values[key];
    if (y !== null) fields[key] = { y, roof: false };
  }
  return fields;
}

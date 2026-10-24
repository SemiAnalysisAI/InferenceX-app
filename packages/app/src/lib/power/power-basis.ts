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

/**
 * What the PowerX Count control calls the two measured boundaries. The PowerX
 * legend, line labels, tooltips and table reuse these so one screen names a
 * boundary one way; the rated bounds keep their registry names.
 */
export const POWER_COUNT_LABELS: Record<PowerBasis, { en: string; zh: string }> = {
  ...POWER_BASIS_LABELS,
  'gpu-measured': { en: 'GPU only', zh: '仅 GPU' },
  'utility-modeled': { en: 'Whole system', zh: '整体系统' },
};

/** `basis` is the registry vocabulary; `count` is the PowerX Count vocabulary. */
export type PowerBasisLabelStyle = 'basis' | 'count';

export function powerBasisLabel(
  basis: PowerBasis,
  locale: 'en' | 'zh',
  style: PowerBasisLabelStyle = 'basis',
): string {
  return (style === 'count' ? POWER_COUNT_LABELS : POWER_BASIS_LABELS)[basis][locale];
}

export const ALL_IN_MEASURED_NOTE = {
  en: 'GPU power is measured; unmeasured components are modeled, with PUE included.',
  zh: 'GPU 功耗来自实测；未实测的组件功耗由模型估算，并计入数据中心 PUE。',
};

export const ALL_IN_MEASURED_AGENTIC_NOTE = {
  en: 'AgentX estimates use the power model’s agentic workload state; they have not been calibrated against measured AgentX system power.',
  zh: 'AgentX 估算采用功耗模型的智能体工作负载状态，尚未用 AgentX 系统实测功耗校准。',
};

export const ALL_IN_MEASURED_EMPTY = {
  en: 'No values are available for All in Measured in this selection. This boundary needs validated GPU telemetry and hardware covered by the InferenceX power model (eight-GPU HGX/OAM systems, or whole GB200/GB300 NVL72 compute trays). Choose another boundary to keep the points.',
  zh: '当前选择没有可用的整体实测功耗数值。该边界需要已验证的 GPU 遥测，且硬件在 InferenceX 功耗模型覆盖范围内（八卡 HGX/OAM 系统，或完整的 GB200/GB300 NVL72 计算 tray）。可切换到其他功耗边界以保留数据点。',
};

export const POWER_BASIS_FIELDS: Record<
  Exclude<PowerBasis, 'gpu-measured'>,
  Partial<Record<PowerQuantity, PowerBasisFieldKey>>
> = {
  'gpu-provisioned': { energy: 'gpuProvisionedJPerOutputToken' },
  'utility-provisioned': { energy: 'utilityProvisionedJPerOutputToken' },
  'utility-modeled': {
    watts: 'utilityModeledWatts',
    energy: 'utilityModeledJPerOutputToken',
  },
};

export interface PowerBasisInput {
  tdpWatts: number | null;
  utilityWatts: number | null;
  allocatedGpus: number | null;
  totalOutputTokPerSec: number | null;
  measuredWatts: number | null;
  measuredJPerOutputToken: number | null;
  modeledFacilityWattsPerGpu: number | null;
}

export type PowerBasisValues = Record<PowerBasisFieldKey, number | null>;

export const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const count = (value: unknown): value is number => isPositive(value) && Number.isSafeInteger(value);
const orNull = (value: number): number | null => (isPositive(value) ? value : null);

export function computePowerBasisFields(input: PowerBasisInput): PowerBasisValues {
  const tdp = isPositive(input.tdpWatts) ? input.tdpWatts : null;
  const utility = isPositive(input.utilityWatts) ? input.utilityWatts : null;
  const measuredWatts = isPositive(input.measuredWatts) ? input.measuredWatts : null;
  const measuredJ = isPositive(input.measuredJPerOutputToken)
    ? input.measuredJPerOutputToken
    : null;
  const modeled =
    measuredWatts !== null && isPositive(input.modeledFacilityWattsPerGpu)
      ? input.modeledFacilityWattsPerGpu
      : null;

  const gpuSecondsPerOutputToken =
    isPositive(input.allocatedGpus) && isPositive(input.totalOutputTokPerSec)
      ? input.allocatedGpus / input.totalOutputTokPerSec
      : null;
  const provisionedEnergy = (watts: number | null) =>
    watts !== null && gpuSecondsPerOutputToken !== null
      ? orNull(watts * gpuSecondsPerOutputToken)
      : null;

  const modeledEnergy =
    modeled !== null && measuredWatts !== null && measuredJ !== null
      ? orNull((measuredJ * modeled) / measuredWatts)
      : null;

  return {
    gpuProvisionedJPerOutputToken: provisionedEnergy(tdp),
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

export function modeledFacilityWattsPerGpu(
  entry: Pick<PowerBasisEntry, 'modeledSystemPower'>,
): number | null {
  const model = entry.modeledSystemPower;
  if (model?.status !== 'supported') return null;
  if (!isPositive(model.deploymentFacilityWatts) || !count(model.gpuCount)) return null;
  return orNull(model.deploymentFacilityWatts / model.gpuCount);
}

export type PowerBasisChartFields = Partial<Pick<InferenceData, PowerBasisFieldKey>>;

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

import type { AggDataEntry, InferenceData, PowerBasisFieldKey } from '@/components/inference/types';
import {
  disaggDeploymentChips,
  exactPerTotalChipRates,
  hasPoolSplit,
} from '@/lib/benchmarks/chip-basis';

export const POWER_BASES = [
  'gpu-measured',
  'gpu-provisioned',
  'utility-provisioned',
  'it-modeled',
  'utility-modeled',
] as const;
export type PowerBasis = (typeof POWER_BASES)[number];
export const POWER_QUANTITIES = ['watts', 'joulesPerOutputToken', 'joulesPerTotalToken'] as const;
export type PowerQuantity = (typeof POWER_QUANTITIES)[number];

export const POWER_BASIS_LABELS: Record<PowerBasis, { en: string; zh: string }> = {
  'gpu-measured': { en: 'GPU Level Measured', zh: 'GPU 实测功耗' },
  'gpu-provisioned': { en: 'GPU Level Provisioned (TDP)', zh: 'GPU 额定功耗（TDP）' },
  'utility-provisioned': { en: 'All in Provisioned', zh: '整体预配功耗' },
  'it-modeled': { en: 'All in Measured IT (no PUE)', zh: '整体实测 IT 功耗（不含 PUE）' },
  'utility-modeled': { en: 'All in Measured', zh: '整体实测功耗' },
};

/**
 * What the PowerX Count control calls the three measured boundaries (GPU only,
 * IT without PUE, facility). The PowerX legend, line labels, tooltips, table and
 * CSV reuse these so one screen names a boundary one way; the rated bounds keep
 * their registry names.
 */
export const POWER_COUNT_LABELS: Record<PowerBasis, { en: string; zh: string }> = {
  ...POWER_BASIS_LABELS,
  'gpu-measured': { en: 'GPU only', zh: '仅 GPU' },
  'it-modeled': { en: 'IT (no PUE)', zh: 'IT（不含 PUE）' },
  'utility-modeled': { en: 'Facility', zh: '数据中心（含 PUE）' },
};

/**
 * The basis tag every PowerX number carries: GPU board power (measured), IT
 * power (GPU plus the modeled rest of the server and the network share, no
 * PUE) or facility power (IT × PUE). Rated bounds tag the boundary they rate.
 */
const POWER_BASIS_TAGS = ['gpu', 'it', 'facility'] as const;
export type PowerBasisTag = (typeof POWER_BASIS_TAGS)[number];

export const POWER_BASIS_TAG_LABELS: Record<PowerBasisTag, { en: string; zh: string }> = {
  gpu: { en: 'GPU', zh: 'GPU' },
  it: { en: 'IT', zh: 'IT' },
  facility: { en: 'Facility', zh: '数据中心' },
};

/** The pill's tooltip: the whole meaning of a tag, in one clause. */
export const POWER_BASIS_TAG_TITLES: Record<PowerBasisTag, { en: string; zh: string }> = {
  gpu: { en: 'GPU board power, measured by DCGM', zh: 'GPU 板卡功耗，由 DCGM 实测' },
  it: { en: 'GPU + modeled server, no PUE', zh: 'GPU + 模型估算的服务器功耗，不含 PUE' },
  facility: { en: 'IT × PUE', zh: 'IT × PUE' },
};

/** GPUs one megawatt of IT power supports at this point's IT W per GPU. */
export function gpusPerMegawatt(itWattsPerGpu: number | null | undefined): number | null {
  return isPositive(itWattsPerGpu) ? 1e6 / itWattsPerGpu : null;
}

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

export type PowerBasisField =
  | 'measuredAvgPower'
  | 'measuredJPerOutputToken'
  | 'measuredJPerTotalToken'
  | PowerBasisFieldKey;

export const POWER_BASIS_FIELDS: Record<
  PowerBasis,
  Partial<Record<PowerQuantity, PowerBasisField>>
> = {
  'gpu-measured': {
    watts: 'measuredAvgPower',
    joulesPerOutputToken: 'measuredJPerOutputToken',
    joulesPerTotalToken: 'measuredJPerTotalToken',
  },
  'gpu-provisioned': {
    joulesPerOutputToken: 'gpuProvisionedJPerOutputToken',
    joulesPerTotalToken: 'gpuProvisionedJPerTotalToken',
  },
  'utility-provisioned': {
    joulesPerOutputToken: 'utilityProvisionedJPerOutputToken',
    joulesPerTotalToken: 'utilityProvisionedJPerTotalToken',
  },
  'it-modeled': {
    watts: 'itModeledWatts',
    joulesPerOutputToken: 'itModeledJPerOutputToken',
    joulesPerTotalToken: 'itModeledJPerTotalToken',
  },
  'utility-modeled': {
    watts: 'utilityModeledWatts',
    joulesPerOutputToken: 'utilityModeledJPerOutputToken',
    joulesPerTotalToken: 'utilityModeledJPerTotalToken',
  },
};

export const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const count = (value: unknown): value is number => isPositive(value) && Number.isSafeInteger(value);
const orNull = (value: number): number | null => (isPositive(value) ? value : null);
const UNAVAILABLE: PowerBasisNormalization = { allocatedGpus: null, totalOutputTokPerSec: null };

export const POWER_BASIS_FIELD_KEYS: Readonly<Record<PowerBasisFieldKey, true>> = {
  gpuProvisionedJPerOutputToken: true,
  gpuProvisionedJPerTotalToken: true,
  utilityProvisionedJPerOutputToken: true,
  utilityProvisionedJPerTotalToken: true,
  itModeledWatts: true,
  itModeledJPerOutputToken: true,
  itModeledJPerTotalToken: true,
  utilityModeledWatts: true,
  utilityModeledJPerOutputToken: true,
  utilityModeledJPerTotalToken: true,
};

type PowerBasisEntry = Pick<
  AggDataEntry,
  | 'tput_per_gpu'
  | 'output_tput_per_gpu'
  | 'disagg'
  | 'benchmark_type'
  | 'chip_basis'
  | 'num_prefill_gpu'
  | 'num_decode_gpu'
  | 'prefill_num_workers'
  | 'decode_num_workers'
  | 'isl'
  | 'osl'
  | 'avg_power_w'
  | 'joules_per_output_token'
  | 'joules_per_total_token'
  | 'modeledSystemPower'
>;

interface PowerBasisNormalization {
  allocatedGpus: number | null;
  totalOutputTokPerSec: number | null;
}

/** Fields `powerBasisNormalization` reads; every chart point and entry carries them. */
export type PowerNormalizationInput = Partial<
  Pick<
    AggDataEntry,
    | 'tput_per_gpu'
    | 'input_tput_per_gpu'
    | 'output_tput_per_gpu'
    | 'disagg'
    | 'chip_basis'
    | 'num_prefill_gpu'
    | 'num_decode_gpu'
    | 'prefill_num_workers'
    | 'decode_num_workers'
    | 'isl'
    | 'osl'
  >
>;

/**
 * Whole-deployment output tokens/s and the chips that produced them. Aggregated
 * rows normalize per chip. Disaggregated rows use every deployment chip with the
 * output rate converted to that same denominator, on either chip basis; legacy rows
 * without recorded pool sizes count their deployment once, not once per pool.
 */
export function powerBasisNormalization(entry: PowerNormalizationInput): PowerBasisNormalization {
  const perGpu = entry.output_tput_per_gpu;
  if (!isPositive(perGpu)) return UNAVAILABLE;
  if (!entry.disagg) return { allocatedGpus: 1, totalOutputTokPerSec: perGpu };
  const split = hasPoolSplit(entry);
  const chips = split
    ? entry.num_prefill_gpu! + entry.num_decode_gpu!
    : disaggDeploymentChips(entry);
  const output = split
    ? entry.chip_basis === 'total'
      ? perGpu
      : perGpu * (entry.num_decode_gpu! / chips!)
    : exactPerTotalChipRates(entry)?.output;
  if (!count(chips) || !isPositive(output)) return UNAVAILABLE;
  return { allocatedGpus: chips, totalOutputTokPerSec: output * chips };
}

export function modeledFacilityWattsPerGpu(
  entry: Pick<PowerBasisEntry, 'modeledSystemPower'>,
): number | null {
  const model = entry.modeledSystemPower;
  if (model?.status !== 'supported') return null;
  if (!isPositive(model.deploymentFacilityWatts) || !count(model.gpuCount)) return null;
  return orNull(model.deploymentFacilityWatts / model.gpuCount);
}

/**
 * Modeled IT W per GPU: the deployment's IT watts (every breakdown part but the
 * PUE facility overhead) over the same measured GPU count the facility figure
 * uses, so IT + facility overhead per GPU equals the facility W per GPU exactly.
 */
export function modeledItWattsPerGpu(
  entry: Pick<PowerBasisEntry, 'modeledSystemPower'>,
): number | null {
  const model = entry.modeledSystemPower;
  if (model?.status !== 'supported') return null;
  if (!isPositive(model.deploymentItWatts) || !count(model.gpuCount)) return null;
  return orNull(model.deploymentItWatts / model.gpuCount);
}

export type PowerBasisChartFields = Partial<Pick<InferenceData, PowerBasisFieldKey>>;

export function writePowerBasisChartFields(
  fields: PowerBasisChartFields,
  entry: PowerBasisEntry,
  specs: { tdp?: number; power?: number },
  request: Readonly<Partial<Record<PowerBasisFieldKey, true>>> | undefined,
): void {
  const all = request === undefined;
  const { allocatedGpus, totalOutputTokPerSec } = powerBasisNormalization(entry);
  if (isPositive(allocatedGpus) && isPositive(totalOutputTokPerSec)) {
    const perOutputToken = allocatedGpus / totalOutputTokPerSec;
    const perTotalToken = isPositive(entry.tput_per_gpu) ? 1 / entry.tput_per_gpu : null;
    const outputKnown = isPositive(perOutputToken);
    const totalKnown = isPositive(perTotalToken);
    const tdp = specs.tdp;
    if (isPositive(tdp)) {
      if (outputKnown) {
        const y = orNull(tdp * perOutputToken);
        if (y !== null && (all || request.gpuProvisionedJPerOutputToken))
          fields.gpuProvisionedJPerOutputToken = { y, roof: false };
      }
      if (totalKnown) {
        const y = orNull(tdp * perTotalToken);
        if (y !== null && (all || request.gpuProvisionedJPerTotalToken))
          fields.gpuProvisionedJPerTotalToken = { y, roof: false };
      }
    }
    const utility = (specs.power ?? 0) * 1000;
    if (isPositive(utility)) {
      if (outputKnown) {
        const y = orNull(utility * perOutputToken);
        if (y !== null && (all || request.utilityProvisionedJPerOutputToken))
          fields.utilityProvisionedJPerOutputToken = { y, roof: false };
      }
      if (totalKnown) {
        const y = orNull(utility * perTotalToken);
        if (y !== null && (all || request.utilityProvisionedJPerTotalToken))
          fields.utilityProvisionedJPerTotalToken = { y, roof: false };
      }
    }
  }
  const measuredWatts = entry.avg_power_w;
  if (!isPositive(measuredWatts)) return;
  const modeledIt = modeledItWattsPerGpu(entry);
  const modeled = modeledFacilityWattsPerGpu(entry);
  if (modeledIt === null && modeled === null) return;
  const perOutputJ = entry.joules_per_output_token;
  const perTotalJ = entry.joules_per_total_token;
  const outputJKnown = isPositive(perOutputJ);
  const totalJKnown = isPositive(perTotalJ);
  if (modeledIt !== null) {
    if (all || request.itModeledWatts) fields.itModeledWatts = { y: modeledIt, roof: false };
    if (outputJKnown) {
      const y = orNull((perOutputJ * modeledIt) / measuredWatts);
      if (y !== null && (all || request.itModeledJPerOutputToken))
        fields.itModeledJPerOutputToken = { y, roof: false };
    }
    if (totalJKnown) {
      const y = orNull((perTotalJ * modeledIt) / measuredWatts);
      if (y !== null && (all || request.itModeledJPerTotalToken))
        fields.itModeledJPerTotalToken = { y, roof: false };
    }
  }
  if (modeled !== null) {
    if (all || request.utilityModeledWatts)
      fields.utilityModeledWatts = { y: modeled, roof: false };
    if (outputJKnown) {
      const y = orNull((perOutputJ * modeled) / measuredWatts);
      if (y !== null && (all || request.utilityModeledJPerOutputToken))
        fields.utilityModeledJPerOutputToken = { y, roof: false };
    }
    if (totalJKnown) {
      const y = orNull((perTotalJ * modeled) / measuredWatts);
      if (y !== null && (all || request.utilityModeledJPerTotalToken))
        fields.utilityModeledJPerTotalToken = { y, roof: false };
    }
  }
}

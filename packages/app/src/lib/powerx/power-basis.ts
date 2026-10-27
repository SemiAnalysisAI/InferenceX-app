import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import manifest from '@/lib/power/power-model.manifest.json';
import { create_power_model, type PowerEstimate, ValueError } from '@/lib/power/power_model';
import type { PowerComponentBreakdown } from '@/lib/power/power_model/base';
import { CHASSIS_SYSTEMS, RACK_SYSTEMS } from '@/lib/power/system-power-model';

import { snapNumber, snapTo } from './widget-hash';

/** Pure model behind the "Power basis explorer" widget on /powerx/tutorial. */

export const BASIS_HARDWARE_GROUPS = [
  { key: 'hopper', hardware: ['h100', 'h200'] },
  { key: 'blackwell', hardware: ['b200', 'b300'] },
  { key: 'nvl72', hardware: ['gb200', 'gb300'] },
  { key: 'amd', hardware: ['mi300x', 'mi325x', 'mi355x'] },
] as const;
export type BasisHardwareGroup = (typeof BASIS_HARDWARE_GROUPS)[number]['key'];
export type BasisHardware = (typeof BASIS_HARDWARE_GROUPS)[number]['hardware'][number];
export const BASIS_HARDWARE: readonly BasisHardware[] = BASIS_HARDWARE_GROUPS.flatMap(
  (group) => group.hardware,
);

export const BASIS_WORKLOADS = ['fixed', 'agentic', 'agentic-offload'] as const;
export type BasisWorkload = (typeof BASIS_WORKLOADS)[number];
export const BASIS_DEPLOYMENTS = ['single', 'multi'] as const;
export type BasisDeployment = (typeof BASIS_DEPLOYMENTS)[number];
export const BASIS_GRACE = ['modeled', 'measured'] as const;
export type BasisGrace = (typeof BASIS_GRACE)[number];

export interface BasisSelection {
  hardware: BasisHardware;
  workload: BasisWorkload;
  deployment: BasisDeployment;
  /** Measured GPU-level watts per GPU, the model's only measured input. */
  gpuWatts: number;
  /** NVL72 only: whether the Grace socket is a measured input or modeled. */
  grace: BasisGrace;
  graceWatts: number;
}

export const BASIS_DEFAULT_TDP_FRACTION = 0.6;
export const BASIS_DEFAULT_GRACE_WATTS = 100;
export const BASIS_MAX_GRACE_WATTS = 1000;
export const BASIS_DEFAULT_HARDWARE: BasisHardware = 'b200';

const WORKLOAD_STATE = {
  fixed: 'fixed-seq-len',
  agentic: 'agentic',
  'agentic-offload': 'agentic-cpu-offloading',
} as const;

export const hardwareTdp = (hardware: BasisHardware): number => HW_REGISTRY[hardware].tdp;
/** Vendor all-in provisioned W per GPU, the number operators size racks with. */
export const hardwareAllInWatts = (hardware: BasisHardware): number =>
  HW_REGISTRY[hardware].power * 1000;
export const isRackHardware = (hardware: BasisHardware): hardware is keyof typeof RACK_SYSTEMS =>
  Object.hasOwn(RACK_SYSTEMS, hardware);

export function defaultGpuWatts(hardware: BasisHardware): number {
  return Math.round(hardwareTdp(hardware) * BASIS_DEFAULT_TDP_FRACTION);
}

export function defaultBasisSelection(
  hardware: BasisHardware = BASIS_DEFAULT_HARDWARE,
): BasisSelection {
  return {
    hardware,
    workload: 'fixed',
    deployment: 'single',
    gpuWatts: defaultGpuWatts(hardware),
    grace: 'modeled',
    graceWatts: BASIS_DEFAULT_GRACE_WATTS,
  };
}

export interface BasisComponent {
  name: string;
  quantity: number;
  watts: number;
  /** Share of IT (no PUE) power, 0..1. */
  shareOfIt: number;
  /** True for the GPUs and a measured Grace socket; everything else is modeled. */
  measured: boolean;
}

export interface BasisEstimate {
  ok: true;
  gpuCount: number;
  perGpu: { gpu: number; it: number; facility: number; allIn: number };
  gpusPerMw: number;
  percentOfTdp: number;
  pue: number;
  coolingMode: string;
  components: BasisComponent[];
  modelVersion: string;
}

export interface BasisOutOfRange {
  ok: false;
  reason: 'out-of-range';
}

export type BasisResult = BasisEstimate | BasisOutOfRange;

export const POWER_MODEL_REVISION = manifest.modelRevision;
export const POWER_MODEL_SHORT_REVISION = manifest.modelRevision.slice(0, 7);
export const POWER_MODEL_SOURCE_URL = manifest.sourceUrl;

function leaves(component: PowerComponentBreakdown): PowerComponentBreakdown[] {
  return component.children.length === 0
    ? [component]
    : component.children.flatMap((child) => leaves(child));
}

function flattenComponents(estimate: PowerEstimate): BasisComponent[] {
  return estimate.components
    .flatMap((component) => leaves(component))
    .map((leaf) => ({
      name: leaf.name,
      quantity: leaf.quantity,
      watts: leaf.power_w,
      shareOfIt: estimate.it_power_w > 0 ? leaf.power_w / estimate.it_power_w : 0,
      measured: leaf.provenance?.kind === 'input' || leaf.provenance?.kind === 'measured',
    }))
    .toSorted((a, b) => b.watts - a.watts);
}

export function computeBasis(selection: BasisSelection): BasisResult {
  const rack = isRackHardware(selection.hardware);
  const system = rack
    ? RACK_SYSTEMS[selection.hardware as keyof typeof RACK_SYSTEMS]
    : CHASSIS_SYSTEMS[selection.hardware as keyof typeof CHASSIS_SYSTEMS];
  let estimate: PowerEstimate;
  try {
    estimate = create_power_model({
      system,
      workload_state: WORKLOAD_STATE[selection.workload],
      using_scale_out: selection.deployment === 'multi',
    }).estimate_breakdown(selection.gpuWatts, {
      cpu_and_dram_measured_power_per_socket:
        rack && selection.grace === 'measured' ? selection.graceWatts : null,
    });
  } catch (error) {
    if (error instanceof ValueError) return { ok: false, reason: 'out-of-range' };
    throw error;
  }
  const itPerGpu = estimate.it_power_w / estimate.gpu_count;
  return {
    ok: true,
    gpuCount: estimate.gpu_count,
    perGpu: {
      gpu: selection.gpuWatts,
      it: itPerGpu,
      facility: estimate.facility_power_w / estimate.gpu_count,
      allIn: hardwareAllInWatts(selection.hardware),
    },
    gpusPerMw: itPerGpu > 0 ? 1e6 / itPerGpu : Number.POSITIVE_INFINITY,
    percentOfTdp: (selection.gpuWatts / hardwareTdp(selection.hardware)) * 100,
    pue: estimate.pue,
    coolingMode: estimate.cooling_mode,
    components: flattenComponents(estimate),
    modelVersion: estimate.model_version,
  };
}

/** `hardware_workload_deployment_gpuWatts[_grace_graceWatts]`, e.g. `b200_fixed_single_600`. */
export function encodeBasis(selection: BasisSelection): string {
  const base = [
    selection.hardware,
    selection.workload,
    selection.deployment,
    String(Math.round(selection.gpuWatts)),
  ];
  if (isRackHardware(selection.hardware)) {
    base.push(selection.grace, String(Math.round(selection.graceWatts)));
  }
  return base.join('_');
}

export function decodeBasis(raw: string | null): BasisSelection {
  const [hw, workload, deployment, watts, grace, graceWatts] = (raw ?? '').split('_');
  const hardware = snapTo(hw, BASIS_HARDWARE, BASIS_DEFAULT_HARDWARE);
  const defaults = defaultBasisSelection(hardware);
  return {
    hardware,
    workload: snapTo(workload, BASIS_WORKLOADS, defaults.workload),
    deployment: snapTo(deployment, BASIS_DEPLOYMENTS, defaults.deployment),
    gpuWatts: snapNumber(watts, 0, hardwareTdp(hardware), defaults.gpuWatts),
    grace: snapTo(grace, BASIS_GRACE, defaults.grace),
    graceWatts: snapNumber(graceWatts, 0, BASIS_MAX_GRACE_WATTS, defaults.graceWatts),
  };
}

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { create_power_model, type PowerEstimate, ValueError } from '@/lib/power/power_model';
import type { PowerComponentBreakdown } from '@/lib/power/power_model/base';
import { CHASSIS_SYSTEMS, RACK_SYSTEMS } from '@/lib/power/system-power-model';

export type BasisHardware = keyof typeof CHASSIS_SYSTEMS | keyof typeof RACK_SYSTEMS;

export const hardwareTdp = (hardware: BasisHardware): number => HW_REGISTRY[hardware].tdp;
/** Vendor all-in provisioned W per GPU, the number operators size racks with. */
export const hardwareAllInWatts = (hardware: BasisHardware): number =>
  HW_REGISTRY[hardware].power * 1000;

export interface BasisComponent {
  name: string;
  watts: number;
  /** True for the GPUs; everything else is modeled. */
  measured: boolean;
}

export type BasisResult =
  | {
      ok: true;
      gpuCount: number;
      itPerGpu: number;
      facilityPerGpu: number;
      gpusPerMw: number;
      percentOfTdp: number;
      pue: number;
      components: BasisComponent[];
    }
  | { ok: false; reason: 'out-of-range' };

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
      watts: leaf.power_w,
      measured: leaf.provenance?.kind === 'input' || leaf.provenance?.kind === 'measured',
    }))
    .toSorted((a, b) => b.watts - a.watts);
}

/** Runs the power model in its agentic state, single node, with the Grace socket modeled. */
export function computeBasis(hardware: BasisHardware, gpuWatts: number): BasisResult {
  const system = Object.hasOwn(RACK_SYSTEMS, hardware)
    ? RACK_SYSTEMS[hardware as keyof typeof RACK_SYSTEMS]
    : CHASSIS_SYSTEMS[hardware as keyof typeof CHASSIS_SYSTEMS];
  let estimate: PowerEstimate;
  try {
    estimate = create_power_model({
      system,
      workload_state: 'agentic',
      using_scale_out: false,
    }).estimate_breakdown(gpuWatts, { cpu_and_dram_measured_power_per_socket: null });
  } catch (error) {
    if (error instanceof ValueError) return { ok: false, reason: 'out-of-range' };
    throw error;
  }
  const itPerGpu = estimate.it_power_w / estimate.gpu_count;
  return {
    ok: true,
    gpuCount: estimate.gpu_count,
    itPerGpu,
    facilityPerGpu: estimate.facility_power_w / estimate.gpu_count,
    gpusPerMw: itPerGpu > 0 ? 1e6 / itPerGpu : Number.POSITIVE_INFINITY,
    percentOfTdp: (gpuWatts / hardwareTdp(hardware)) * 100,
    pue: estimate.pue,
    components: flattenComponents(estimate),
  };
}

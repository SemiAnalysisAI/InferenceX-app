import { create_power_model, type PowerEstimate, type PowerModel, ValueError } from './power_model';
import {
  emptySystemPowerBreakdown,
  type SystemPowerBreakdown,
  type SystemPowerCategory,
} from './system-power-categories';
import type { PowerComponentBreakdown as PowerComponent } from './power_model/base';
import { SYSTEMS } from './power_model/models/advanced/systems/catalog';
import type { RackScaleSystem } from './power_model/models/advanced/systems/rack_scale/rack_scale';

const CHASSIS_SYSTEMS = {
  h100: 'hopper',
  h200: 'hopper',
  b200: 'b200',
  b300: 'b300',
  mi300x: 'mi300',
  mi325x: 'mi325',
  mi355x: 'mi355',
} as const satisfies Record<string, keyof typeof SYSTEMS>;
const RACK_SYSTEMS = {
  gb200: 'gb200-nvl72',
  gb300: 'gb300-nvl72',
} as const satisfies Record<string, keyof typeof SYSTEMS>;
export type SystemPowerHardware = keyof typeof CHASSIS_SYSTEMS;
export type RackPowerHardware = keyof typeof RACK_SYSTEMS;

export const isSystemPowerHardware = (hardware: string): hardware is SystemPowerHardware =>
  Object.hasOwn(CHASSIS_SYSTEMS, hardware);

export const isRackPowerHardware = (hardware: string): hardware is RackPowerHardware =>
  Object.hasOwn(RACK_SYSTEMS, hardware);

export type SystemPowerWorkload = 'fixed-seq-len' | 'agentic' | 'agentic-cpu-offloading';

export interface SystemPowerOperatingState {
  workload: SystemPowerWorkload;
  scaleOut: boolean;
}

const SCALE_OUT_GROUP = 'Scale-out networking';
const MEASURED_GPU_LEAF = 'GPUs';
const MEASURED_GRACE_LEAF = 'Grace socket (measured)';

/**
 * Leaf component name → part, first match wins. The names are the pinned
 * port's class and label names (`system-power-model.test.ts` pins the full
 * table across every supported system). The NVSwitch tray's embedded EPYC is
 * tray overhead, so it counts as `nvswitch`, not as a host CPU; system-side
 * transceivers sit on the NIC side of the chassis, so they count as `nic`.
 */
const LEAF_CATEGORY_RULES: readonly (readonly [RegExp, SystemPowerCategory])[] = [
  [/NVSwitch|^EPYCEmbedded/u, 'nvswitch'],
  [/CPU/u, 'cpu'],
  [/DIMM|Memory/u, 'memory'],
  [/NICCard|Transceiver/u, 'nic'],
  [/Drive/u, 'storage'],
  [/\bfan/iu, 'fans'],
  [/loss/iu, 'psuLoss'],
];

const LEAF_CATEGORIES = new Map<string, SystemPowerCategory>();

/** The part a leaf of the pinned model's component tree counts toward. */
export function systemPowerLeafCategory(topName: string, leafName: string): SystemPowerCategory {
  if (topName === SCALE_OUT_GROUP) return 'network';
  if (leafName === MEASURED_GPU_LEAF) return 'gpu';
  if (leafName === MEASURED_GRACE_LEAF) return 'measuredCpu';
  let category = LEAF_CATEGORIES.get(leafName);
  if (!category) {
    category = LEAF_CATEGORY_RULES.find(([pattern]) => pattern.test(leafName))?.[1] ?? 'other';
    LEAF_CATEGORIES.set(leafName, category);
  }
  return category;
}

/** Sums the pinned model's leaf components into {@link SystemPowerBreakdown} categories. */
function breakdownPowerEstimate(estimate: PowerEstimate): SystemPowerBreakdown {
  const breakdown = emptySystemPowerBreakdown();
  const visit = (top: PowerComponent, component: PowerComponent) => {
    if (component.children.length === 0) {
      breakdown[systemPowerLeafCategory(top.name, component.name)] += component.power_w;
      return;
    }
    for (const child of component.children) visit(top, child);
  };
  for (const top of estimate.components) visit(top, top);
  breakdown.facility = estimate.facility_overhead_w;
  return breakdown;
}

export interface SystemUnitPower {
  itWatts: number;
  facilityWatts: number;
  pue: number;
  breakdown: SystemPowerBreakdown;
}

const POWER_MODELS = new Map<string, PowerModel>();

function powerModel(system: keyof typeof SYSTEMS, state: SystemPowerOperatingState): PowerModel {
  const key = `${system}/${state.workload}/${state.scaleOut}`;
  let model = POWER_MODELS.get(key);
  if (!model) {
    model = create_power_model({
      system,
      workload_state: state.workload,
      using_scale_out: state.scaleOut,
    });
    POWER_MODELS.set(key, model);
  }
  return model;
}

function estimateSystem(
  system: keyof typeof SYSTEMS,
  gpuWattsPerGpu: number,
  graceSocketWatts: number | null,
  state: SystemPowerOperatingState,
): SystemUnitPower | null {
  if (![gpuWattsPerGpu, graceSocketWatts ?? 0].every(Number.isFinite)) return null;
  let estimate: PowerEstimate;
  try {
    estimate = powerModel(system, state).estimate_breakdown(gpuWattsPerGpu, {
      cpu_and_dram_measured_power_per_socket: graceSocketWatts,
    });
  } catch (error) {
    if (error instanceof ValueError) return null;
    throw error;
  }
  return {
    itWatts: estimate.it_power_w,
    facilityWatts: estimate.facility_power_w,
    pue: estimate.pue,
    breakdown: breakdownPowerEstimate(estimate),
  };
}

const CHASSIS_GPU_COUNT = 8;

export function estimateChassisPower(
  hardware: SystemPowerHardware,
  chassisGpuWatts: number,
  state: SystemPowerOperatingState,
): SystemUnitPower | null {
  return estimateSystem(
    CHASSIS_SYSTEMS[hardware],
    chassisGpuWatts / CHASSIS_GPU_COUNT,
    null,
    state,
  );
}

export function estimateRackPower(
  hardware: RackPowerHardware,
  gpuWattsPerGpu: number,
  graceSocketWatts: number | null,
  state: SystemPowerOperatingState,
): SystemUnitPower | null {
  return estimateSystem(RACK_SYSTEMS[hardware], gpuWattsPerGpu, graceSocketWatts, state);
}

const RACKS: Record<RackPowerHardware, RackScaleSystem> = {
  gb200: new SYSTEMS['gb200-nvl72'](),
  gb300: new SYSTEMS['gb300-nvl72'](),
};

export const rackComputeTrayCount = (hardware: RackPowerHardware): number =>
  RACKS[hardware].compute_tray_count;

/** GPUs in one modeled unit: an 8-GPU chassis or a whole NVL72 rack. */
export const systemUnitGpuCount = (hardware: SystemPowerHardware | RackPowerHardware): number =>
  isRackPowerHardware(hardware) ? RACKS[hardware].gpu_count : CHASSIS_GPU_COUNT;

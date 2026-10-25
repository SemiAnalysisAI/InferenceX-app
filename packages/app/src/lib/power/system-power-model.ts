import manifest from './power-model.manifest.json';
import { create_power_model, type PowerEstimate, ValueError } from './power_model';
import { SYSTEMS } from './power_model/models/advanced/systems/catalog';
import type { RackScaleSystem } from './power_model/models/advanced/systems/rack_scale/rack_scale';

export const SYSTEM_POWER_MODEL_REVISION = manifest.modelRevision;
export const SYSTEM_POWER_MODEL_SOURCE_URL = manifest.sourceUrl;

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

export const AIR_COOLED_SYSTEM_PUE = SYSTEMS.hopper.default_cooling.pue;
export const LIQUID_COOLED_RACK_PUE = SYSTEMS['gb200-nvl72'].default_cooling.pue;

export const isSystemPowerHardware = (hardware: string): hardware is SystemPowerHardware =>
  Object.hasOwn(CHASSIS_SYSTEMS, hardware);

export const isRackPowerHardware = (hardware: string): hardware is RackPowerHardware =>
  Object.hasOwn(RACK_SYSTEMS, hardware);

export type SystemPowerWorkload = 'fixed-seq-len' | 'agentic' | 'agentic-cpu-offloading';

export interface SystemPowerOperatingState {
  workload: SystemPowerWorkload;
  scaleOut: boolean;
}

export interface SystemUnitPower {
  itWatts: number;
  facilityWatts: number;
  pue: number;
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
    estimate = create_power_model({
      system,
      workload_state: state.workload,
      using_scale_out: state.scaleOut,
    }).estimate_breakdown(gpuWattsPerGpu, {
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

/**
 * The dashboard's entry point to the InferenceX power model. The model itself is
 * the file-for-file TypeScript port in ./power_model (held to the pinned Python
 * revision by power-model-parity.test.ts); this module maps InferenceX hardware
 * names onto its systems and turns its out-of-domain errors into null.
 */
import { HW_REGISTRY, type HwEntry } from '@semianalysisai/inferencex-constants';

import manifest from './power-model.manifest.json';
import { create_power_model, type PowerEstimate, ValueError } from './power_model';
import { SYSTEMS } from './power_model/models/advanced/systems/catalog';
import type { RackScaleSystem } from './power_model/models/advanced/systems/rack_scale/rack_scale';

export const SYSTEM_POWER_MODEL_REVISION = manifest.modelRevision;
export const SYSTEM_POWER_MODEL_SOURCE_URL = manifest.sourceUrl;

/** InferenceX hardware → upstream eight-GPU HGX/OAM chassis. */
const CHASSIS_SYSTEMS = {
  h100: 'hopper',
  h200: 'hopper',
  b200: 'b200',
  b300: 'b300',
  mi300x: 'mi300',
  mi325x: 'mi325',
  mi355x: 'mi355',
} as const satisfies Record<string, keyof typeof SYSTEMS>;
/** InferenceX hardware → upstream 72-GPU NVL72 rack. */
const RACK_SYSTEMS = {
  gb200: 'gb200-nvl72',
  gb300: 'gb300-nvl72',
} as const satisfies Record<string, keyof typeof SYSTEMS>;
export type SystemPowerHardware = keyof typeof CHASSIS_SYSTEMS;
export type RackPowerHardware = keyof typeof RACK_SYSTEMS;

/** Every supported chassis is air-cooled upstream; captions quote this PUE. */
export const AIR_COOLED_SYSTEM_PUE = SYSTEMS.hopper.default_cooling.pue;
/** Every supported NVL72 rack is liquid-cooled upstream. */
export const LIQUID_COOLED_RACK_PUE = SYSTEMS['gb200-nvl72'].default_cooling.pue;

const COOLING_PUE = {
  air: AIR_COOLED_SYSTEM_PUE,
  liquid: LIQUID_COOLED_RACK_PUE,
} as const satisfies Record<HwEntry['cooling'], number>;

/**
 * All in Provisioned W per GPU at the utility meter: the registry's all-in IT
 * allocation (chip plus its share of host and NICs) × the PUE of the
 * hardware's cooling, the same meter All in Measured reports at. Null for
 * hardware outside the registry or without an allocation.
 */
export function allInProvisionedWatts(hardware: string): number | null {
  const entry = HW_REGISTRY[hardware.toLowerCase().split(/[-_]/u)[0]!];
  return entry && entry.power > 0 ? entry.power * 1000 * COOLING_PUE[entry.cooling] : null;
}

export const isSystemPowerHardware = (hardware: string): hardware is SystemPowerHardware =>
  Object.hasOwn(CHASSIS_SYSTEMS, hardware);

export const isRackPowerHardware = (hardware: string): hardware is RackPowerHardware =>
  Object.hasOwn(RACK_SYSTEMS, hardware);

/** Upstream workload states: CPU and DRAM power for each serving pattern. */
export type SystemPowerWorkload = 'fixed-seq-len' | 'agentic' | 'agentic-cpu-offloading';

export interface SystemPowerOperatingState {
  workload: SystemPowerWorkload;
  /** Active NICs and scale-out switches instead of idle ones. */
  scaleOut: boolean;
}

/** One complete modeled system: an eight-GPU chassis or a 72-GPU NVL72 rack. */
export interface SystemUnitPower {
  /** System AC plus its share of scale-out networking, before PUE. */
  itWatts: number;
  /** IT watts × the PUE of the system's upstream cooling mode. */
  facilityWatts: number;
  pue: number;
}

/**
 * One system (systems=1) at a W/GPU input; null when the model rejects the
 * input (negative watts, PSU or power-shelf capacity, converter curves). Any
 * other error is a defect and propagates.
 */
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

/** GPUs in one supported chassis; the model's input is watts per GPU. */
const CHASSIS_GPU_COUNT = 8;

/**
 * The InferenceX power model for one complete eight-GPU HGX/OAM chassis at the
 * chassis' total GPU watts: host components for the operating state, fans, PSU
 * conversion, the chassis' scale-out network share, and PUE. Null outside the
 * model's domain (for example above the modeled PSU capacity).
 */
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

/**
 * The InferenceX power model for one GB200/GB300 NVL72 rack: every GPU at the
 * given W/GPU and every Grace socket at the measured W/socket, which replaces
 * the modeled Grace CPU and LPDDR5X; null models the sockets. Adds compute-tray
 * NICs, optics, drives, fans and 48 V conversion, switch trays, power shelves,
 * the rack's scale-out switch share, and PUE. Null outside the model's domain.
 */
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

/** Compute trays in one NVL72 rack; a tray's share of the rack is 1 / this. */
export const rackComputeTrayCount = (hardware: RackPowerHardware): number =>
  RACKS[hardware].compute_tray_count;

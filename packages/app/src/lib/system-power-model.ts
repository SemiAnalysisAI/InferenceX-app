import profileData from './system-power-model.profiles.json';

export const SYSTEM_POWER_MODEL_REVISION = profileData.modelRevision;
export const SYSTEM_POWER_MODEL_SOURCE_URL = profileData.sourceUrl;
const PROFILES = profileData.profiles;
export type SystemPowerHardware = keyof typeof PROFILES;

/** Every supported chassis is air-cooled upstream (the generator asserts it); captions quote this PUE. */
export const AIR_COOLED_SYSTEM_PUE = PROFILES.h100.pue;

export const isSystemPowerHardware = (hardware: string): hardware is SystemPowerHardware =>
  Object.hasOwn(PROFILES, hardware);

/** Upstream workload states: CPU and DRAM power for each serving pattern. */
export type SystemPowerWorkload = 'fixed-seq-len' | 'agentic' | 'agentic-cpu-offloading';

export interface SystemPowerOperatingState {
  workload: SystemPowerWorkload;
  /** Active NICs and scale-out switches instead of idle ones. */
  scaleOut: boolean;
}

export interface ChassisPowerEstimate {
  /** Chassis AC plus the chassis's share of scale-out networking, before PUE. */
  itWatts: number;
  /** IT watts × the PUE of the chassis's upstream cooling mode. */
  facilityWatts: number;
  pue: number;
}

type PsuEfficiencyCurve = (typeof PROFILES)[SystemPowerHardware]['psu']['efficiencyCurve'];

function psuEfficiency(curve: PsuEfficiencyCurve, loadFraction: number): number {
  const first = curve[0];
  const last = curve.at(-1)!;
  if (loadFraction <= first.loadFraction) return first.efficiency;
  if (loadFraction >= last.loadFraction) return last.efficiency;
  const i = curve.findIndex((point) => loadFraction <= point.loadFraction);
  const [left, right] = [curve[i - 1], curve[i]];
  const weight = (loadFraction - left.loadFraction) / (right.loadFraction - left.loadFraction);
  return left.efficiency + weight * (right.efficiency - left.efficiency);
}

/**
 * The pinned InferenceX power model for one complete eight-GPU HGX/OAM chassis,
 * as the closed form the generator verified against it: fixed host DC for the
 * operating state, a thermal fan curve, PSU efficiency, then scale-out
 * networking (outside the PSU) and PUE. Returns null outside the PSU capacity.
 */
export function estimateChassisPower(
  hardware: SystemPowerHardware,
  chassisGpuWatts: number,
  state: SystemPowerOperatingState,
): ChassisPowerEstimate | null {
  if (!Number.isFinite(chassisGpuWatts) || chassisGpuWatts < 0) return null;
  const { fixedDcWatts, fan, psu, networkWatts, pue } = PROFILES[hardware];
  const componentDc = chassisGpuWatts + fixedDcWatts[state.workload][`${state.scaleOut}`];
  const load = Math.min(1, componentDc / fan.fullCoolingLoadWatts);
  const pwm = Math.min(
    fan.maxPwm,
    Math.max(fan.minPwm, fan.minPwm + (fan.maxPwm - fan.minPwm) * load ** fan.exponent),
  );
  const dc = componentDc + fan.electricalNameplateWatts * pwm ** 3;
  if (dc > psu.modeledCapacityWatts) return null;
  const itWatts =
    dc / psuEfficiency(psu.efficiencyCurve, dc / psu.loadSharingCapacityWatts) +
    networkWatts[`${state.scaleOut}`];
  return { itWatts, facilityWatts: itWatts * pue, pue };
}

import profileData from './system-power-model.profiles.json';

export const SYSTEM_POWER_MODEL_REVISION = profileData.modelRevision;
export const SYSTEM_POWER_MODEL_SOURCE_URL = profileData.sourceUrl;
const PROFILES = profileData.profiles;
const RACK_PROFILES = profileData.rackProfiles;
export type SystemPowerHardware = keyof typeof PROFILES;
export type RackPowerHardware = keyof typeof RACK_PROFILES;

/** Every supported chassis is air-cooled upstream (the generator asserts it); captions quote this PUE. */
export const AIR_COOLED_SYSTEM_PUE = PROFILES.h100.pue;
/** Every supported NVL72 rack is liquid-cooled upstream (the generator asserts it). */
export const LIQUID_COOLED_RACK_PUE = RACK_PROFILES.gb200.pue;

export const isSystemPowerHardware = (hardware: string): hardware is SystemPowerHardware =>
  Object.hasOwn(PROFILES, hardware);

export const isRackPowerHardware = (hardware: string): hardware is RackPowerHardware =>
  Object.hasOwn(RACK_PROFILES, hardware);

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
): SystemUnitPower | null {
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

type RackProfile = (typeof RACK_PROFILES)[RackPowerHardware];
type FanAssembly = RackProfile['trayFans'];
type PowerShelves = RackProfile['powerShelves'];

function fanWatts(fans: FanAssembly, airHeatWatts: number): number {
  const speed =
    fans.minSpeed +
    (fans.maxSpeed - fans.minSpeed) * Math.min(airHeatWatts / fans.designAirHeatWatts, 1);
  return fans.count * fans.ratedWattsPerFan * speed ** 3;
}

/**
 * Upstream rack_fans.solve_cooling: fans cool the air heat plus the conversion
 * loss their own load causes. Fixed-point iteration with the upstream limits.
 */
function solveCooling(
  load: number,
  airHeat: number,
  fans: FanAssembly,
  conversionLoss: (outputWatts: number) => number | null,
): number | null {
  let fan = fanWatts(fans, airHeat);
  for (let i = 0; i < 128; i++) {
    const loss = conversionLoss(load + fan);
    if (loss === null) return null;
    const updated = fanWatts(fans, airHeat + loss);
    if (Math.abs(updated - fan) < 1e-8) return updated;
    fan = updated;
  }
  return null;
}

/** Tray 48 V converter loss; null above its continuous capacity or past the curve's last knot. */
function trayConverterLoss(converter: RackProfile['trayConverter'], output: number): number | null {
  const fraction = output / converter.capacityWatts;
  if (fraction > 1) return null;
  const curve = converter.lossCurve;
  const i = curve.findIndex((point, k) => k > 0 && fraction <= point.outputFraction);
  if (i === -1) return null;
  const [left, right] = [curve[i - 1], curve[i]];
  const weight = (fraction - left.outputFraction) / (right.outputFraction - left.outputFraction);
  return left.lossWatts + weight * (right.lossWatts - left.lossWatts);
}

/** Shelf PSU AC/DC loss; null outside the curve (below its first knot, past its last, or above capacity). */
function psuConversionLoss(shelves: PowerShelves, output: number): number | null {
  const curve = shelves.psuEfficiencyCurve;
  const load = output / shelves.psuCapacityWatts;
  if (load < curve[0].loadFraction || load > 1) return null;
  const i = curve.findIndex((point, k) => k > 0 && load <= point.loadFraction);
  if (i === -1) return null;
  const [left, right] = [curve[i - 1], curve[i]];
  const weight = (load - left.loadFraction) / (right.loadFraction - left.loadFraction);
  const efficiency = left.efficiency + weight * (right.efficiency - left.efficiency);
  return output * (1 / efficiency - 1);
}

/** One shelf's PSU loss, PSU fans, and controller for the DC it delivers. */
function shelfOverhead(shelves: PowerShelves, shelfDcWatts: number): number | null {
  const psuDc = (shelfDcWatts + shelves.controllerWatts) / shelves.psusPerShelf;
  const conversion = (output: number) => psuConversionLoss(shelves, output);
  const fan = solveCooling(psuDc, 0, shelves.psuFans, conversion);
  const loss = fan === null ? null : conversion(psuDc + fan);
  if (fan === null || loss === null) return null;
  return shelves.psusPerShelf * (loss + fan) + shelves.controllerWatts;
}

/**
 * The pinned InferenceX power model for one GB200/GB300 NVL72 rack, as the
 * evaluation the generator verified against it. Every GPU draws the measured
 * W/GPU and every Grace socket the measured W/socket; the socket reading
 * replaces the modeled Grace CPU and LPDDR5X. Each compute tray adds NICs,
 * optics and drives, fans and 48 V conversion loss (fans still cool the modeled
 * LPDDR5X heat); the rack adds switch trays and power-shelf losses, checked
 * against the surviving shelf bank; then the rack's scale-out switch share and
 * PUE. Returns null outside the converter or shelf curves.
 */
export function estimateRackPower(
  hardware: RackPowerHardware,
  gpuWattsPerGpu: number,
  graceSocketWatts: number,
  state: SystemPowerOperatingState,
): SystemUnitPower | null {
  if (![gpuWattsPerGpu, graceSocketWatts].every((w) => Number.isFinite(w) && w >= 0)) return null;
  const p = RACK_PROFILES[hardware];
  const auxiliary = p.trayAuxiliaryWatts[`${state.scaleOut}`];
  const load = p.boardsPerTray * (p.gpusPerBoard * gpuWattsPerGpu + graceSocketWatts) + auxiliary;
  const airHeat = p.boardsPerTray * p.boardAirHeatWatts[state.workload] + auxiliary;
  const conversion = (output: number) => trayConverterLoss(p.trayConverter, output);
  const fan = solveCooling(load, airHeat, p.trayFans, conversion);
  const loss = fan === null ? null : conversion(load + fan);
  if (fan === null || loss === null) return null;
  const bus = p.computeTrayCount * (load + fan + loss) + p.switchTrayCount * p.switchTrayWatts;
  const shelves = p.powerShelves;
  const surviving = shelves.survivingShelves;
  if (bus > surviving * shelves.psusPerShelf * shelves.psuCapacityWatts) return null;
  if (shelfOverhead(shelves, bus / surviving) === null) return null;
  const overhead = shelfOverhead(shelves, bus / shelves.activeShelves);
  if (overhead === null) return null;
  const itWatts = bus + shelves.activeShelves * overhead + p.networkWatts[`${state.scaleOut}`];
  return { itWatts, facilityWatts: itWatts * p.pue, pue: p.pue };
}

/** Compute trays in one NVL72 rack; a tray's share of the rack is 1 / this. */
export const rackComputeTrayCount = (hardware: RackPowerHardware): number =>
  RACK_PROFILES[hardware].computeTrayCount;

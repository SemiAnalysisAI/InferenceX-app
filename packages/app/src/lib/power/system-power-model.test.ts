import { describe, expect, it } from 'vitest';

import { create_power_model } from './power_model';
import {
  AIR_COOLED_SYSTEM_PUE,
  estimateChassisPower,
  estimateRackPower,
  isRackPowerHardware,
  isSystemPowerHardware,
  LIQUID_COOLED_RACK_PUE,
  rackComputeTrayCount,
  SYSTEM_POWER_MODEL_REVISION,
  SYSTEM_POWER_MODEL_SOURCE_URL,
} from './system-power-model';

const STATE = { workload: 'agentic', scaleOut: true } as const;

/** The port's own one-system estimate: the value the adapter must reproduce. */
function upstream(system: string, gpuWattsPerGpu: number, socketWatts: number | null = null) {
  const estimate = create_power_model({
    system,
    workload_state: STATE.workload,
    using_scale_out: STATE.scaleOut,
  }).estimate_breakdown(gpuWattsPerGpu, { cpu_and_dram_measured_power_per_socket: socketWatts });
  return {
    itWatts: estimate.it_power_w,
    facilityWatts: estimate.facility_power_w,
    pue: estimate.pue,
  };
}

describe('system power model adapter', () => {
  it('pins the ported upstream revision', () => {
    expect(SYSTEM_POWER_MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(SYSTEM_POWER_MODEL_SOURCE_URL).toContain(SYSTEM_POWER_MODEL_REVISION);
  });

  it.each([
    ['h100', 'hopper'],
    ['h200', 'hopper'],
    ['b200', 'b200'],
    ['b300', 'b300'],
    ['mi300x', 'mi300'],
    ['mi325x', 'mi325'],
    ['mi355x', 'mi355'],
  ] as const)(
    'models %s as the upstream %s chassis at chassis GPU watts / 8',
    (hardware, system) => {
      expect(isSystemPowerHardware(hardware)).toBe(true);
      expect(estimateChassisPower(hardware, 8 * 612.5, STATE)).toEqual(upstream(system, 612.5));
    },
  );

  it.each([
    ['gb200', 'gb200-nvl72'],
    ['gb300', 'gb300-nvl72'],
  ] as const)(
    'models %s as the upstream %s rack, measured or modeled Grace',
    (hardware, system) => {
      expect(isRackPowerHardware(hardware)).toBe(true);
      expect(isSystemPowerHardware(hardware)).toBe(false);
      expect(estimateRackPower(hardware, 900, 98.066, STATE)).toEqual(
        upstream(system, 900, 98.066),
      );
      expect(estimateRackPower(hardware, 900, null, STATE)).toEqual(upstream(system, 900));
      expect(rackComputeTrayCount(hardware)).toBe(18);
    },
  );

  it('quotes the upstream cooling PUEs', () => {
    expect(AIR_COOLED_SYSTEM_PUE).toBe(estimateChassisPower('b200', 5600, STATE)!.pue);
    expect(LIQUID_COOLED_RACK_PUE).toBe(estimateRackPower('gb300', 700, null, STATE)!.pue);
  });

  it('returns null where the upstream model rejects the input', () => {
    // Negative and non-finite watts.
    expect(estimateChassisPower('h100', -8, STATE)).toBeNull();
    expect(estimateChassisPower('h100', Number.NaN, STATE)).toBeNull();
    expect(estimateRackPower('gb200', 700, Number.POSITIVE_INFINITY, STATE)).toBeNull();
    // 2400 W/GPU exceeds the modeled Hopper PSU and the NVL72 power shelves.
    expect(estimateChassisPower('h100', 8 * 2400, STATE)).toBeNull();
    expect(estimateRackPower('gb300', 2400, null, STATE)).toBeNull();
  });

  it('rejects unknown hardware names at the type level only', () => {
    expect(isSystemPowerHardware('gb200')).toBe(false);
    expect(isRackPowerHardware('h100')).toBe(false);
    expect(isSystemPowerHardware('constructor')).toBe(false);
  });
});

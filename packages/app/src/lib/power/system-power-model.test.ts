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
  SYSTEM_POWER_CATEGORIES,
  SYSTEM_POWER_MODEL_SOURCE_URL,
  type SystemPowerBreakdown,
} from './system-power-model';

const STATE = { workload: 'agentic', scaleOut: true } as const;

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

const sum = (
  b: SystemPowerBreakdown,
  keys: readonly (keyof SystemPowerBreakdown)[] = SYSTEM_POWER_CATEGORIES,
) => keys.reduce((total, key) => total + b[key], 0);

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
      expect(estimateChassisPower(hardware, 8 * 612.5, STATE)).toMatchObject(
        upstream(system, 612.5),
      );
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
      expect(estimateRackPower(hardware, 900, 98.066, STATE)).toMatchObject(
        upstream(system, 900, 98.066),
      );
      expect(estimateRackPower(hardware, 900, null, STATE)).toMatchObject(upstream(system, 900));
      expect(rackComputeTrayCount(hardware)).toBe(18);
    },
  );

  const itKeys = SYSTEM_POWER_CATEGORIES.filter((key) => key !== 'facility');

  it.each(['h100', 'h200', 'b200', 'b300', 'mi300x', 'mi325x', 'mi355x'] as const)(
    'splits a %s chassis into measured GPU, server, fans/PSU, network and facility watts',
    (hardware) => {
      const model = estimateChassisPower(hardware, 8 * 612.5, STATE)!;
      const b = model.breakdown;
      expect(b.gpu).toBeCloseTo(8 * 612.5, 6);
      expect(b.measuredCpu).toBe(0);
      for (const key of ['server', 'fansPsu', 'network', 'facility'] as const) {
        expect(b[key]).toBeGreaterThan(0);
      }
      expect(sum(b, itKeys)).toBeCloseTo(model.itWatts, 6);
      expect(sum(b)).toBeCloseTo(model.facilityWatts, 6);
      expect(b.facility).toBeCloseTo(model.itWatts * (model.pue - 1), 6);
    },
  );

  it('moves fans and PSU loss with GPU load while server parts stay fixed', () => {
    const low = estimateChassisPower('h200', 8 * 226, STATE)!.breakdown;
    const high = estimateChassisPower('h200', 8 * 474, STATE)!.breakdown;
    expect(high.server).toBeCloseTo(low.server, 6);
    expect(high.network).toBeCloseTo(low.network, 6);
    expect(high.fansPsu).toBeGreaterThan(low.fansPsu);
  });

  it.each(['gb200', 'gb300'] as const)(
    'keeps measured Grace sockets apart from modeled %s server parts',
    (hardware) => {
      const measured = estimateRackPower(hardware, 900, 98.066, STATE)!;
      const modeled = estimateRackPower(hardware, 900, null, STATE)!;
      expect(measured.breakdown.gpu).toBeCloseTo(72 * 900, 6);
      expect(measured.breakdown.measuredCpu).toBeCloseTo(36 * 98.066, 6);
      expect(modeled.breakdown.measuredCpu).toBe(0);
      expect(modeled.breakdown.server).toBeGreaterThan(measured.breakdown.server);
      for (const model of [measured, modeled]) {
        expect(sum(model.breakdown, itKeys)).toBeCloseTo(model.itWatts, 6);
        expect(sum(model.breakdown)).toBeCloseTo(model.facilityWatts, 6);
      }
    },
  );

  it('quotes the upstream cooling PUEs', () => {
    expect(AIR_COOLED_SYSTEM_PUE).toBe(estimateChassisPower('b200', 5600, STATE)!.pue);
    expect(LIQUID_COOLED_RACK_PUE).toBe(estimateRackPower('gb300', 700, null, STATE)!.pue);
  });

  it('returns null where the upstream model rejects the input', () => {
    expect(estimateChassisPower('h100', -8, STATE)).toBeNull();
    expect(estimateChassisPower('h100', Number.NaN, STATE)).toBeNull();
    expect(estimateRackPower('gb200', 700, Number.POSITIVE_INFINITY, STATE)).toBeNull();
    expect(estimateChassisPower('h100', 8 * 2400, STATE)).toBeNull();
    expect(estimateRackPower('gb300', 2400, null, STATE)).toBeNull();
  });

  it('rejects unknown hardware names at the type level only', () => {
    expect(isSystemPowerHardware('gb200')).toBe(false);
    expect(isRackPowerHardware('h100')).toBe(false);
    expect(isSystemPowerHardware('constructor')).toBe(false);
  });
});

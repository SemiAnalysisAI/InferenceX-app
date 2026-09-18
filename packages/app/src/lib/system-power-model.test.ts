import { GPU_KEYS } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import {
  estimateChassisPower,
  estimateRackPower,
  type RackMeasuredInput,
  SUPPORTED_SYSTEM_POWER_HARDWARE,
  SUPPORTED_SYSTEM_POWER_RACK_HARDWARE,
  SYSTEM_POWER_MODEL_REVISION,
} from './system-power-model';
import reference from './system-power-model.reference.json';

const rackInput = (row: (typeof reference.rackCases)[number]): RackMeasuredInput =>
  row.moduleWattsPerTray === undefined
    ? {
        basis: 'gpu-plus-grace',
        gpuBoardWattsPerTray: row.gpuBoardWattsPerTray,
        graceSocketWattsPerTray: row.graceSocketWattsPerTray,
      }
    : { basis: 'module', moduleWattsPerTray: row.moduleWattsPerTray };

describe('fixed 8k1k chassis model', () => {
  it('matches the pinned Python implementation across platforms, fan/PSU boundaries, and PUE', () => {
    expect(reference.modelRevision).toBe(SYSTEM_POWER_MODEL_REVISION);
    expect(new Set(reference.cases.map((row) => row.hardware))).toEqual(
      new Set(SUPPORTED_SYSTEM_POWER_HARDWARE),
    );
    for (const row of reference.cases) {
      const actual = estimateChassisPower(row.hardware, row.measuredGpuWatts, row.pue);
      const context = `${row.hardware}: GPU=${row.measuredGpuWatts} W, PUE=${row.pue}`;
      if (row.expected === null) {
        expect(actual, context).toBeNull();
      } else {
        expect(actual, context).toMatchObject(row.expected);
      }
    }
  });

  it('rejects unavailable measurements, PUE, and unmatched chassis rather than substituting watts', () => {
    for (const watts of [0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      expect(estimateChassisPower('b200', watts)).toBeNull();
    }
    for (const pue of [0, 0.99, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      expect(estimateChassisPower('b200', 4000, pue)).toBeNull();
    }
    for (const hardware of ['gb200', 'gb300', 'h100-pcie', 'b200-dgx', '', 'toString']) {
      expect(estimateChassisPower(hardware, 4000)).toBeNull();
    }
  });

  it('keeps measured input, modeled chassis AC, and post-AC facility power separate', () => {
    const chassis = estimateChassisPower('H100', 4000, 1)!;
    const facility = estimateChassisPower('h100', 4000, 1.2)!;
    expect(chassis.measuredGpuWatts).toBe(4000);
    expect(chassis.chassisAcWatts).toBe(6228.2);
    expect(chassis.facilityWatts).toBe(chassis.chassisAcWatts);
    expect(facility.chassisAcWatts).toBe(chassis.chassisAcWatts);
    expect(facility.facilityWatts).toBe(7473.8);
    // Fixed chassis overhead and nonlinear fan/PSU behavior forbid proportional GPU scaling.
    expect(estimateChassisPower('h100', 8000)!.chassisAcWatts).not.toBe(chassis.chassisAcWatts * 2);
  });

  it('names every chassis and rack profile by its hardware registry key', () => {
    for (const hardware of [
      ...SUPPORTED_SYSTEM_POWER_HARDWARE,
      ...SUPPORTED_SYSTEM_POWER_RACK_HARDWARE,
    ]) {
      expect(GPU_KEYS.has(hardware), hardware).toBe(true);
    }
    expect(SUPPORTED_SYSTEM_POWER_RACK_HARDWARE).toEqual(['gb200', 'gb300']);
  });
});

describe('NVL72 rack model with measured compute-module input', () => {
  it('matches the pinned Python rack model across variants, bases, shelf knots, and PUE', () => {
    expect(new Set(reference.rackCases.map((row) => row.hardware))).toEqual(
      new Set(SUPPORTED_SYSTEM_POWER_RACK_HARDWARE),
    );
    expect(new Set(reference.rackCases.map((row) => row.basis))).toEqual(
      new Set(['module', 'gpu-plus-grace']),
    );
    for (const row of reference.rackCases) {
      const actual = estimateRackPower(row.hardware, rackInput(row), row.pue);
      const context = `${row.hardware}: ${JSON.stringify(rackInput(row))}, PUE=${row.pue}`;
      if (row.expected === null) {
        expect(actual, context).toBeNull();
      } else {
        expect(actual, context).toMatchObject(row.expected);
      }
    }
  });

  it('rejects unavailable measurements, PUE, chassis hardware, and shelf overflow', () => {
    for (const watts of [0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      expect(estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: watts })).toBeNull();
      expect(
        estimateRackPower('gb200', {
          basis: 'gpu-plus-grace',
          gpuBoardWattsPerTray: watts,
          graceSocketWattsPerTray: 300,
        }),
      ).toBeNull();
      // A zero Grace socket reading means the socket was not measured, never that it drew nothing.
      expect(
        estimateRackPower('gb200', {
          basis: 'gpu-plus-grace',
          gpuBoardWattsPerTray: 3000,
          graceSocketWattsPerTray: watts,
        }),
      ).toBeNull();
    }
    for (const pue of [0, 0.99, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      expect(
        estimateRackPower('gb300', { basis: 'module', moduleWattsPerTray: 4000 }, pue),
      ).toBeNull();
    }
    for (const hardware of [
      'b200',
      'b300',
      'h100',
      'gb200-nvl',
      'gb200_dynamo-trt',
      '',
      'toString',
    ]) {
      expect(estimateRackPower(hardware, { basis: 'module', moduleWattsPerTray: 4000 })).toBeNull();
    }
    expect(estimateChassisPower('gb200', 4000)).toBeNull();
  });

  it('applies PUE once to the rounded rack AC and amortises the rack over all 72 GPUs', () => {
    const input: RackMeasuredInput = { basis: 'module', moduleWattsPerTray: 5400 };
    const rack = estimateRackPower('GB200', input, 1)!;
    const facility = estimateRackPower('gb200', input, 1.1)!;
    expect(rack.hardware).toBe('gb200');
    expect(rack.facilityWatts).toBe(rack.rackAcWatts);
    expect(facility.rackAcWatts).toBe(rack.rackAcWatts);
    expect(facility.facilityWatts).toBeCloseTo(rack.rackAcWatts * 1.1, 0);
    expect(facility.perGpuAcWatts).toBeCloseTo(rack.rackAcWatts / 72, 0);
    expect(facility.perGpuFacilityWatts).toBeCloseTo(facility.facilityWatts / 72, 0);
    expect(facility.gpuCount).toBe(72);
    expect(facility.computeTrayCount).toBe(18);
    // Static trays, switch trays, and the shelf curve forbid proportional scaling.
    expect(
      estimateRackPower('gb200', { basis: 'module', moduleWattsPerTray: 2700 }, 1)!.rackAcWatts * 2,
    ).not.toBe(rack.rackAcWatts);
  });

  it('adds the sourced regulator allowance only on the GPU-board share of the split basis', () => {
    const split = estimateRackPower('gb300', {
      basis: 'gpu-plus-grace',
      gpuBoardWattsPerTray: 4800,
      graceSocketWattsPerTray: 600,
    })!;
    const module = estimateRackPower('gb300', {
      basis: 'module',
      moduleWattsPerTray: split.measuredWattsPerTray + split.regulatorAllowanceWattsPerTray,
    })!;
    expect(split.basis).toBe('gpu-plus-grace');
    expect(split.measuredWattsPerTray).toBe(5400);
    expect(split.regulatorAllowanceWattsPerTray).toBeGreaterThan(0);
    expect(module.basis).toBe('module');
    expect(module.regulatorAllowanceWattsPerTray).toBe(0);
    // The electrical equivalent module reading reproduces the split-basis rack.
    expect(module.rackAcWatts).toBeCloseTo(split.rackAcWatts, 0);
    expect(module.facilityWatts).toBeCloseTo(split.facilityWatts, 0);
  });
});

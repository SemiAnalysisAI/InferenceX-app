import { describe, expect, it } from 'vitest';

import {
  estimateChassisPower,
  SUPPORTED_SYSTEM_POWER_HARDWARE,
  SYSTEM_POWER_MODEL_REVISION,
} from './system-power-model';
import reference from './system-power-model.reference.json';

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
});

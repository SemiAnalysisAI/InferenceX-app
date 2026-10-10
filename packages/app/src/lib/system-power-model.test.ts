import { describe, expect, it } from 'vitest';

import {
  estimateChassisPower,
  estimateRackPower,
  SYSTEM_POWER_MODEL_REVISION,
  type RackPowerHardware,
  type SystemPowerHardware,
  type SystemPowerWorkload,
  type SystemUnitPower,
} from './system-power-model';
import profileData from './system-power-model.profiles.json';
import reference from './system-power-model.reference.json';

function expectReference(
  actual: SystemUnitPower | null,
  expected: { itWatts: number; facilityWatts: number } | null,
  context: string,
) {
  if (expected === null) {
    expect(actual, context).toBeNull();
    return;
  }
  expect(actual, context).not.toBeNull();
  for (const key of ['itWatts', 'facilityWatts'] as const) {
    expect(Math.abs(actual![key] / expected[key] - 1), `${context} ${key}`).toBeLessThan(1e-9);
  }
}

describe('InferenceX system power model', () => {
  it('reproduces the pinned upstream model for every chassis, operating state, and domain edge', () => {
    expect(reference.modelRevision).toBe(SYSTEM_POWER_MODEL_REVISION);
    expect(new Set(reference.cases.map((row) => row.hardware))).toEqual(
      new Set(Object.keys(profileData.profiles)),
    );
    for (const row of reference.cases) {
      expectReference(
        estimateChassisPower(row.hardware as SystemPowerHardware, 8 * row.gpuWattsPerGpu, {
          workload: row.workload as SystemPowerWorkload,
          scaleOut: row.scaleOut,
        }),
        row.expected,
        `${row.hardware} ${row.workload} scaleOut=${row.scaleOut} ${row.gpuWattsPerGpu} W/GPU`,
      );
    }
  });

  it('reproduces the pinned upstream NVL72 rack on measured GPU and Grace-socket watts', () => {
    expect(new Set(reference.rackCases.map((row) => row.hardware))).toEqual(
      new Set(Object.keys(profileData.rackProfiles)),
    );
    for (const row of reference.rackCases) {
      expectReference(
        estimateRackPower(
          row.hardware as RackPowerHardware,
          row.gpuWattsPerGpu,
          row.graceSocketWatts,
          { workload: row.workload as SystemPowerWorkload, scaleOut: row.scaleOut },
        ),
        row.expected,
        `${row.hardware} ${row.workload} scaleOut=${row.scaleOut} ${row.gpuWattsPerGpu} W/GPU ${row.graceSocketWatts} W/socket`,
      );
    }
  });
});

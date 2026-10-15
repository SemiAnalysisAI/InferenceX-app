import { describe, expect, it } from 'vitest';

import {
  estimateChassisPower,
  SYSTEM_POWER_MODEL_REVISION,
  type SystemPowerHardware,
  type SystemPowerWorkload,
} from './system-power-model';
import profileData from './system-power-model.profiles.json';
import reference from './system-power-model.reference.json';

describe('InferenceX chassis power model', () => {
  it('reproduces the pinned upstream model for every chassis, operating state, and domain edge', () => {
    expect(reference.modelRevision).toBe(SYSTEM_POWER_MODEL_REVISION);
    expect(new Set(reference.cases.map((row) => row.hardware))).toEqual(
      new Set(Object.keys(profileData.profiles)),
    );
    for (const row of reference.cases) {
      const actual = estimateChassisPower(
        row.hardware as SystemPowerHardware,
        8 * row.gpuWattsPerGpu,
        { workload: row.workload as SystemPowerWorkload, scaleOut: row.scaleOut },
      );
      const context = `${row.hardware} ${row.workload} scaleOut=${row.scaleOut} ${row.gpuWattsPerGpu} W/GPU`;
      if (row.expected === null) {
        expect(actual, context).toBeNull();
        continue;
      }
      expect(actual, context).not.toBeNull();
      for (const key of ['itWatts', 'facilityWatts'] as const) {
        expect(Math.abs(actual![key] / row.expected[key] - 1), `${context} ${key}`).toBeLessThan(
          1e-9,
        );
      }
    }
  });
});

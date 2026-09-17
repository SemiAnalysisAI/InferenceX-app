import { describe, expect, it } from 'vitest';

import { chipCounts } from '@/lib/chip-counts';
import type { SystemPowerEstimate } from '@/lib/modeled-system-power';

const supported: SystemPowerEstimate = {
  status: 'supported',
  hardware: 'h100',
  modelRevision: 'reference-revision',
  modelPath: 'chassis/H100.py',
  gpuCount: 8,
  chassisCount: 1,
  chassisAcWatts: 6000,
  chassisAcWattsPerGpu: 750,
  facilityWatts: 7200,
  pue: 1.2,
  measuredGpuWattsPerGpu: 500,
  modeledGpuCount: 8,
  deploymentAcWatts: 6000,
  deploymentFacilityWatts: 7200,
  topologyBasis: 'single-node',
  chassisBasis: 'full',
  telemetryBasis: 'validated-v2',
};

describe('chipCounts', () => {
  it('reveals the validated GPU count only on the modeled axis, keeping the legacy alias beside it', () => {
    const point = { physicalChips: 64, tp: 8, modeledSystemPower: supported };
    expect(chipCounts(point, true)).toEqual({ physical: 8, configured: 64 });
    expect(chipCounts(point, false)).toEqual({ physical: 64, configured: 64 });
  });

  it('falls back to the configured count when the estimate is unsupported or absent', () => {
    const unsupported: SystemPowerEstimate = {
      status: 'unsupported',
      reason: 'hardware',
      modelRevision: 'reference-revision',
    };
    expect(chipCounts({ physicalChips: 64, tp: 8, modeledSystemPower: unsupported }, true)).toEqual(
      { physical: 64, configured: 64 },
    );
    expect(chipCounts({ tp: 8 }, true)).toEqual({ physical: 8, configured: 8 });
  });
});

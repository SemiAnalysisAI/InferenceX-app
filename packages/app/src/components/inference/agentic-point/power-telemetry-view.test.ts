import { describe, expect, it } from 'vitest';

import { collectorLabel } from './power-telemetry-view';

describe('collectorLabel', () => {
  it('names the recorded producer for multinode power bundles', () => {
    expect(
      collectorLabel({
        vendor: 'nvidia',
        sidecars: {
          context: { producer: 'srt-slurm.dcgm-power', source_metric: 'DCGM_FI_DEV_POWER_USAGE' },
        },
      }),
    ).toBe('srt-slurm.dcgm-power');
  });

  it('falls back to the vendor CLI for single-node CSVs', () => {
    expect(
      collectorLabel({ vendor: 'nvidia', sidecars: { context: { timestamp_timezone: 'UTC' } } }),
    ).toBe('nvidia-smi');
    expect(collectorLabel({ vendor: 'amd', sidecars: {} })).toBe('amd-smi');
    expect(collectorLabel({ vendor: 'other', sidecars: { context: { producer: '  ' } } })).toBe(
      'other',
    );
  });
});

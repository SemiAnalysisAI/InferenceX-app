import { describe, expect, it } from 'vitest';

import { mapRunStats } from './run-stats-mapper';
import { createSkipTracker } from './skip-tracker';

describe('mapRunStats', () => {
  it('maps stamped and unstamped entries for known hardware', () => {
    const tracker = createSkipTracker();

    const rows = mapRunStats(
      {
        h200: { result_schema_version: 1, n_success: 7, total: 8 },
        mi355x: { n_success: 4, total: 4 },
      },
      tracker,
    );

    expect(rows).toEqual([
      { hardware: 'h200', nSuccess: 7, total: 8 },
      { hardware: 'mi355x', nSuccess: 4, total: 4 },
    ]);
    expect(tracker.skips.unsupportedVersion).toBe(0);
  });

  it('counts entries stamped with an unsupported result_schema_version', () => {
    const tracker = createSkipTracker();

    const rows = mapRunStats(
      {
        h200: { result_schema_version: 2, n_success: 7, total: 8 },
        b200: { result_schema_version: 1, n_success: 3, total: 3 },
      },
      tracker,
    );

    expect(rows).toEqual([{ hardware: 'b200', nSuccess: 3, total: 3 }]);
    expect(tracker.skips.unsupportedVersion).toBe(1);
  });

  it('drops unknown hardware and malformed counts without counting them', () => {
    const tracker = createSkipTracker();

    const rows = mapRunStats(
      {
        'h200-dgxc-slurm': { n_success: 1, total: 1 },
        h100: { n_success: '3', total: 4 },
        b300: null,
      },
      tracker,
    );

    expect(rows).toEqual([]);
    expect(tracker.skips.unsupportedVersion).toBe(0);
  });
});

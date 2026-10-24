import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { POWER_SERIES_FORMAT_VERSION } from '../queries/gpu-power-series';

// Everything whose output lands in `gpu_power_series.series_gz`.
const TRANSFORM_FILES = [
  'power-series/power-series.ts',
  'power-series/power-audit-cut.ts',
  'power-series/stored-power-series.ts',
  'etl/power-audit-validations.ts',
];

/** Update together with `POWER_SERIES_FORMAT_VERSION` when the transform changes. */
const TRANSFORM_FINGERPRINT = {
  version: 1,
  sha256: '62453be6071ed22c6f35469bacca41ce76ce421aeebf82097a8e53bd2fbfcf6c',
};

describe('POWER_SERIES_FORMAT_VERSION', () => {
  it('is bumped whenever the precomputed transform changes', () => {
    const hash = createHash('sha256');
    for (const file of TRANSFORM_FILES) {
      hash.update(file).update(fs.readFileSync(path.join(import.meta.dirname, '..', file)));
    }
    // A failure means stored rows may disagree with what this code would compute.
    // If the output can differ, bump POWER_SERIES_FORMAT_VERSION and run
    // db:backfill-power-series after deploy; then record both values here.
    expect({ version: POWER_SERIES_FORMAT_VERSION, sha256: hash.digest('hex') }).toEqual(
      TRANSFORM_FINGERPRINT,
    );
  });
});

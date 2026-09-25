import { describe, expect, it } from 'vitest';

import type { BenchmarkPersistenceInput } from './benchmark-ingest.js';
import { createBenchmarkPowerAuditRecovery } from './power-audit-recovery.js';

const resultFile = 'kimik3_recipe-a_conc48.json';
const source = `power_validation_${resultFile}`;
const validation = {
  power_valid: true,
  validation_path: 'LOGS/agentic/conc_48/power_validation.json',
  result_file: resultFile,
  selected_window: {
    concurrency: 48,
    start_time_unix: 1000,
    end_time_unix: 1100,
    result_path: 'agentic/conc_48/agentic_power_concurrency_48.json',
    window_file: 'windows/agentic_power_concurrency_48.json',
  },
};
const evidence = { resultFile, validations: { [source]: validation } };
const expectedAudit = { source, window_start_unix: 1000, window_end_unix: 1100 };

function point(overrides: Partial<BenchmarkPersistenceInput> = {}): BenchmarkPersistenceInput {
  return {
    configId: 1,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 48,
    offloadMode: 'on',
    image: 'image',
    recipeFingerprint: 'recipe-a',
    metrics: { power_valid: 1, avg_power_w: 234.5, mean_ttft: 0.2 },
    workers: [{ role: 'agg', worker_idx: 0, num_gpus: 8, avg_power_w: 234.5 }],
    ...overrides,
  };
}

describe('CI benchmark audit recovery', () => {
  it('retains exact provenance with aggregate after sibling and preserves benchmark values', () => {
    const recover = createBenchmarkPowerAuditRecovery();
    const original = point();
    let latest = original;
    for (const isPaired of [true, false]) {
      latest = recover(original, isPaired ? evidence : undefined);
      expect(latest.metrics).toBe(original.metrics);
      expect(latest.workers).toBe(original.workers);
      expect({ ...latest, powerAudit: undefined }).toEqual({ ...original, powerAudit: undefined });
    }
    expect(latest.powerAudit).toEqual(expectedAudit);
    expect(original.powerAudit).toBeUndefined();
  });

  it('does not reuse the same run/concurrency audit for a point with another offload mode', () => {
    const recover = createBenchmarkPowerAuditRecovery();
    recover(point(), evidence);
    const other = point({ offloadMode: 'off' });
    expect(recover(other)).toBe(other);
    expect(other.powerAudit).toBeUndefined();
  });
});

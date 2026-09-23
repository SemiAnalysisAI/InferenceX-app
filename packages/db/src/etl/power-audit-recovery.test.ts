import { describe, expect, it } from 'vitest';

import type { BenchmarkPersistenceInput } from './benchmark-ingest.js';
import {
  createBenchmarkPowerAuditRecovery,
  type BenchmarkPowerAuditEvidence,
} from './power-audit-recovery.js';

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
  it.each([
    ['aggregate before sibling', [false, true]],
    ['aggregate after sibling', [true, false]],
    ['repeated/no-op sibling ingest', [true, false, true, false]],
  ])('retains exact provenance with %s and preserves benchmark values', (_label, paired) => {
    const recover = createBenchmarkPowerAuditRecovery();
    const original = point();
    let latest = original;
    for (const isPaired of paired) {
      latest = recover(original, isPaired ? evidence : undefined);
      expect(latest.metrics).toBe(original.metrics);
      expect(latest.workers).toBe(original.workers);
      expect({ ...latest, powerAudit: undefined }).toEqual({ ...original, powerAudit: undefined });
    }
    expect(latest.powerAudit).toEqual(expectedAudit);
    expect(original.powerAudit).toBeUndefined();
  });

  it('preserves every explicit audit, including one without a source', () => {
    const recover = createBenchmarkPowerAuditRecovery();
    recover(point(), evidence);
    for (const powerAudit of [{ source: 'producer-original.json' }, { sample_count: 42 }, {}]) {
      const original = point({ powerAudit });
      expect(recover(original, evidence)).toBe(original);
      expect(recover(original)).toBe(original);
    }
  });

  it.each([
    { configId: 2 },
    { recipeFingerprint: 'recipe-b' },
    { offloadMode: 'off' },
    { conc: 56 },
    { isl: 8192 },
    { osl: 1024 },
    { benchmarkType: 'single_turn' as const },
  ])('does not reuse the same run/concurrency audit for another point: %j', (difference) => {
    const recover = createBenchmarkPowerAuditRecovery();
    recover(point(), evidence);
    const other = point(difference);
    expect(recover(other)).toBe(other);
    expect(other.powerAudit).toBeUndefined();
  });

  it('does not carry evidence into another run', () => {
    createBenchmarkPowerAuditRecovery()(point(), evidence);
    const nextRun = point();
    expect(createBenchmarkPowerAuditRecovery()(nextRun)).toBe(nextRun);
  });

  it('restores audit metadata without promoting an invalid power verdict', () => {
    const original = point({ metrics: { power_valid: 0, mean_ttft: 0.2 } });
    const restored = createBenchmarkPowerAuditRecovery()(original, {
      resultFile,
      validations: { [source]: { ...validation, power_valid: false } },
    });
    expect(restored.powerAudit).toEqual(expectedAudit);
    expect(restored.metrics).toBe(original.metrics);
    expect(restored.metrics).toEqual({ power_valid: 0, mean_ttft: 0.2 });
  });

  it.each<BenchmarkPowerAuditEvidence>([
    { resultFile: 'different-result.json', validations: evidence.validations },
    {
      resultFile,
      validations: {
        [source]: {
          ...validation,
          selected_window: { ...validation.selected_window, concurrency: 56 },
        },
      },
    },
    { resultFile, validations: { [source]: { ...validation, validation_path: undefined } } },
    { resultFile, validations: {} },
    { resultFile, validations: { [source]: validation, [`other/${source}`]: validation } },
  ])('leaves missing or ambiguous exact sibling evidence unknown', (candidate) => {
    const recover = createBenchmarkPowerAuditRecovery();
    const original = point();
    expect(recover(original, candidate)).toBe(original);
    expect(recover(original)).toBe(original);
  });
});

import { describe, it, expect } from 'vitest';
import { CONCLUSION_OVERRIDES, PURGED_RUNS } from './run-overrides';

describe('CONCLUSION_OVERRIDES', () => {
  it('all run IDs are positive integers', () => {
    for (const runId of CONCLUSION_OVERRIDES.keys()) {
      expect(runId).toBeGreaterThan(0);
      expect(Number.isInteger(runId)).toBe(true);
    }
  });

  it('only contains valid GitHub conclusion values', () => {
    const validConclusions = new Set(['success', 'failure', 'cancelled', 'skipped']);
    for (const conclusion of CONCLUSION_OVERRIDES.values()) {
      expect(validConclusions.has(conclusion), `unexpected: '${conclusion}'`).toBe(true);
    }
  });
});

describe('PURGED_RUNS', () => {
  it('all run IDs are positive integers', () => {
    for (const runId of PURGED_RUNS) {
      expect(runId).toBeGreaterThan(0);
      expect(Number.isInteger(runId)).toBe(true);
    }
  });

  it('does not overlap with CONCLUSION_OVERRIDES', () => {
    for (const runId of PURGED_RUNS) {
      expect(
        CONCLUSION_OVERRIDES.has(runId),
        `run ${runId} is in both PURGED_RUNS and CONCLUSION_OVERRIDES`,
      ).toBe(false);
    }
  });
});

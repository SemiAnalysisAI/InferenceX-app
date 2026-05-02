import { describe, it, expect } from 'vitest';
import {
  CONCLUSION_OVERRIDES,
  PURGED_RUN_ATTEMPTS,
  PURGED_RUNS,
  isRunAttemptPurged,
} from './run-overrides';

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

describe('PURGED_RUN_ATTEMPTS', () => {
  it('all run IDs and attempt numbers are positive integers', () => {
    for (const [runId, attempts] of PURGED_RUN_ATTEMPTS) {
      expect(runId).toBeGreaterThan(0);
      expect(Number.isInteger(runId)).toBe(true);
      expect(attempts.size).toBeGreaterThan(0);
      for (const attempt of attempts) {
        expect(attempt).toBeGreaterThan(0);
        expect(Number.isInteger(attempt)).toBe(true);
      }
    }
  });

  it('does not overlap with PURGED_RUNS (use one or the other)', () => {
    for (const runId of PURGED_RUN_ATTEMPTS.keys()) {
      expect(
        PURGED_RUNS.has(runId),
        `run ${runId} appears in both PURGED_RUNS and PURGED_RUN_ATTEMPTS`,
      ).toBe(false);
    }
  });

  it('does not overlap with CONCLUSION_OVERRIDES', () => {
    for (const runId of PURGED_RUN_ATTEMPTS.keys()) {
      expect(
        CONCLUSION_OVERRIDES.has(runId),
        `run ${runId} is in both PURGED_RUN_ATTEMPTS and CONCLUSION_OVERRIDES`,
      ).toBe(false);
    }
  });
});

describe('isRunAttemptPurged', () => {
  it('returns true for runs in PURGED_RUNS regardless of attempt', () => {
    const [first] = PURGED_RUNS;
    if (first === undefined) return;
    expect(isRunAttemptPurged(first)).toBe(true);
    expect(isRunAttemptPurged(first, 1)).toBe(true);
    expect(isRunAttemptPurged(first, 99)).toBe(true);
  });

  it('returns true only for the specific attempts listed in PURGED_RUN_ATTEMPTS', () => {
    for (const [runId, attempts] of PURGED_RUN_ATTEMPTS) {
      for (const attempt of attempts) {
        expect(isRunAttemptPurged(runId, attempt)).toBe(true);
      }
      // An attempt not in the set should not be purged (assuming the run isn't in PURGED_RUNS)
      const unlistedAttempt = Math.max(...attempts) + 1;
      if (!attempts.has(unlistedAttempt)) {
        expect(isRunAttemptPurged(runId, unlistedAttempt)).toBe(false);
      }
      // Without an attempt, only whole-run purges count → false here
      expect(isRunAttemptPurged(runId)).toBe(false);
    }
  });

  it('returns false for runs that are not purged', () => {
    expect(isRunAttemptPurged(1, 1)).toBe(false);
    expect(isRunAttemptPurged(1)).toBe(false);
  });
});

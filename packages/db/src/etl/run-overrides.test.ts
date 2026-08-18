import { describe, it, expect } from 'vitest';
import {
  type BenchmarkPointBackfill,
  type ChangelogBackfill,
  type PurgedBenchmarkPoint,
  applyBenchmarkPointBackfill,
  applyChangelogBackfills,
  BENCHMARK_POINT_BACKFILLS,
  CHANGELOG_BACKFILLS,
  CONCLUSION_OVERRIDES,
  PURGED_BENCHMARK_POINTS,
  PURGED_RUN_ATTEMPTS,
  PURGED_RUNS,
  isBenchmarkPointPurged,
  isRunAttemptPurged,
  recordBackfilledPointIdentity,
  validateRunBackfills,
} from './run-overrides';

function examplePointBackfill(
  overrides: Partial<BenchmarkPointBackfill> = {},
): BenchmarkPointBackfill {
  return {
    id: 'run-123-point-offload',
    reason: 'Artifact omitted the offload metadata.',
    githubRunId: 123,
    runAttempt: 1,
    configId: 456,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 64,
    offloadMode: 'off',
    recipeFingerprint: null,
    set: {
      offloadMode: 'on',
      metricsMerge: { kv_offloading: 'dram', kv_offload_backend: 'lmcache' },
      metricsRemove: ['stale_offload_field'],
    },
    ...overrides,
  };
}

describe('audited run backfills', () => {
  it('validates the checked-in registries', () => {
    expect(() => validateRunBackfills()).not.toThrow();
  });

  it('requires a stable ID, reason, exact selector, and non-empty patch', () => {
    expect(() => validateRunBackfills([], [examplePointBackfill({ id: 'Not Valid' })])).toThrow(
      /kebab-case/u,
    );
    expect(() => validateRunBackfills([], [examplePointBackfill({ reason: ' ' })])).toThrow(
      /reason/u,
    );
    expect(() => validateRunBackfills([], [examplePointBackfill({ set: {} })])).toThrow(
      /at least one field/u,
    );
  });

  it('rejects source-to-destination point identity collisions', () => {
    const first = examplePointBackfill();
    const second = examplePointBackfill({
      id: 'run-123-existing-offload-point',
      offloadMode: 'on',
      set: { metricsMerge: { note: 'already on' } },
    });
    expect(() => validateRunBackfills([], [first, second])).toThrow(/collides/u);
  });

  it('applies point corrections during ingest and synchronizes offload metadata', () => {
    const backfill = examplePointBackfill();
    const registry = BENCHMARK_POINT_BACKFILLS as BenchmarkPointBackfill[];
    registry.push(backfill);
    const point = {
      configId: 456,
      benchmarkType: 'agentic_traces',
      isl: null,
      osl: null,
      conc: 64,
      offloadMode: 'off',
      recipeFingerprint: null,
      metrics: { median_itl: 0.1, stale_offload_field: true },
    };

    try {
      const applied = applyBenchmarkPointBackfill(123, 1, point);
      expect(applied.backfillId).toBe(backfill.id);
      expect(applied.point.offloadMode).toBe('on');
      expect(applied.point.metrics).toEqual({
        median_itl: 0.1,
        offload_mode: 'on',
        kv_offloading: 'dram',
        kv_offload_backend: 'lmcache',
      });
      expect(applied.desiredIdentity).not.toBe(applied.sourceIdentity);

      const otherAttempt = applyBenchmarkPointBackfill(123, 2, point);
      expect(otherAttempt.backfillId).toBeNull();
      // GCS fallback has no attempt metadata and intentionally matches by run + point.
      expect(applyBenchmarkPointBackfill(123, undefined, point).backfillId).toBe(backfill.id);
    } finally {
      registry.splice(registry.indexOf(backfill), 1);
    }
  });

  it('applies changelog corrections to the row that ingest persists', () => {
    const backfill: ChangelogBackfill = {
      id: 'run-123-changelog-configs',
      reason: 'The artifact listed the wrong config key.',
      githubRunId: 123,
      runAttempt: 1,
      baseRef: 'master',
      headRef: 'feature-sha',
      set: {
        configKeys: ['dsv4-fp4-b300-vllm-mtp'],
        description: 'Corrected description',
        prLink: null,
        appendOnly: true,
      },
    };
    const registry = CHANGELOG_BACKFILLS as ChangelogBackfill[];
    registry.push(backfill);

    try {
      const applied = applyChangelogBackfills(123, 1, [
        {
          baseRef: 'master',
          headRef: 'feature-sha',
          entries: [
            {
              configKeys: ['old-first'],
              description: 'First entry is overwritten by ingest',
              prLink: 'https://example.com/first',
              evalsOnly: false,
              appendOnly: false,
            },
            {
              configKeys: ['old-final'],
              description: 'Final stored entry',
              prLink: 'https://example.com/final',
              evalsOnly: false,
              appendOnly: false,
            },
          ],
        },
      ]);

      expect(applied.backfillIds).toEqual([backfill.id]);
      expect(applied.changelogs[0].entries[0].configKeys).toEqual(['old-first']);
      expect(applied.changelogs[0].entries[0].appendOnly).toBe(true);
      expect(applied.changelogs[0].entries[1]).toMatchObject({
        configKeys: ['dsv4-fp4-b300-vllm-mtp'],
        description: 'Corrected description',
        prLink: null,
        appendOnly: true,
        evalsOnly: false,
      });
    } finally {
      registry.splice(registry.indexOf(backfill), 1);
    }
  });

  it('detects two artifact rows collapsing onto one corrected identity', () => {
    const seen = new Map<string, string>();
    recordBackfilledPointIdentity(seen, 'source-off', 'desired-on');
    expect(() => recordBackfilledPointIdentity(seen, 'source-on', 'desired-on')).toThrow(
      /collision/u,
    );
  });
});

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

describe('PURGED_BENCHMARK_POINTS', () => {
  it('uses complete, valid point identities and no run-level purge overlaps', () => {
    const unique = new Set<string>();
    for (const point of PURGED_BENCHMARK_POINTS) {
      expect(point.githubRunId).toBeGreaterThan(0);
      expect(Number.isInteger(point.githubRunId)).toBe(true);
      expect(point.runAttempt).toBeGreaterThan(0);
      expect(Number.isInteger(point.runAttempt)).toBe(true);
      expect(PURGED_RUNS.has(point.githubRunId)).toBe(false);
      expect(CONCLUSION_OVERRIDES.has(point.githubRunId)).toBe(false);
      expect(PURGED_RUN_ATTEMPTS.get(point.githubRunId)?.has(point.runAttempt) ?? false).toBe(
        false,
      );
      expect(point.configId).toBeGreaterThan(0);
      expect(Number.isInteger(point.configId)).toBe(true);
      expect(point.benchmarkType).not.toBe('');
      expect(point.isl === null || point.isl > 0).toBe(true);
      expect(point.osl === null || point.osl > 0).toBe(true);
      expect(point.conc).toBeGreaterThan(0);
      expect(point.offloadMode).not.toBe('');
      expect(
        point.recipeFingerprint === undefined ||
          point.recipeFingerprint === null ||
          point.recipeFingerprint !== '',
      ).toBe(true);
      const identity = [
        point.githubRunId,
        point.runAttempt,
        point.configId,
        point.benchmarkType,
        point.isl,
        point.osl,
        point.conc,
        point.offloadMode,
        point.recipeFingerprint ?? null,
      ].join('|');
      expect(unique.has(identity), `duplicate point override: ${identity}`).toBe(false);
      unique.add(identity);
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

describe('isBenchmarkPointPurged', () => {
  it('matches the full point identity within the selected run attempt', () => {
    const point: PurgedBenchmarkPoint = {
      githubRunId: 1,
      runAttempt: 1,
      configId: 1,
      benchmarkType: 'single_turn',
      isl: 1024,
      osl: 1024,
      conc: 1,
      offloadMode: 'none',
      recipeFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
    const registry = PURGED_BENCHMARK_POINTS as PurgedBenchmarkPoint[];
    registry.push(point);

    try {
      expect(isBenchmarkPointPurged(point.githubRunId, point.runAttempt, point)).toBe(true);
      expect(isBenchmarkPointPurged(point.githubRunId, undefined, point)).toBe(true);
      expect(isBenchmarkPointPurged(point.githubRunId, null, point)).toBe(true);
      expect(isBenchmarkPointPurged(point.githubRunId, 2, point)).toBe(false);
      expect(isBenchmarkPointPurged(2, point.runAttempt, point)).toBe(false);
      expect(
        isBenchmarkPointPurged(point.githubRunId, point.runAttempt, { ...point, conc: 2 }),
      ).toBe(false);
      expect(
        isBenchmarkPointPurged(point.githubRunId, point.runAttempt, {
          ...point,
          offloadMode: 'cpu',
        }),
      ).toBe(false);
      expect(
        isBenchmarkPointPurged(point.githubRunId, point.runAttempt, {
          ...point,
          recipeFingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        }),
      ).toBe(false);
      expect(
        isBenchmarkPointPurged(point.githubRunId, point.runAttempt, {
          ...point,
          recipeFingerprint: null,
        }),
      ).toBe(false);
    } finally {
      registry.splice(registry.indexOf(point), 1);
    }
  });

  it('treats omitted and null fingerprints as the same legacy identity', () => {
    const point: PurgedBenchmarkPoint = {
      githubRunId: 1,
      runAttempt: 1,
      configId: 1,
      benchmarkType: 'single_turn',
      isl: 1024,
      osl: 1024,
      conc: 1,
      offloadMode: 'none',
    };
    const registry = PURGED_BENCHMARK_POINTS as PurgedBenchmarkPoint[];
    registry.push(point);

    try {
      expect(
        isBenchmarkPointPurged(point.githubRunId, point.runAttempt, {
          ...point,
          recipeFingerprint: null,
        }),
      ).toBe(true);
      expect(
        isBenchmarkPointPurged(point.githubRunId, point.runAttempt, {
          ...point,
          recipeFingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      ).toBe(false);
    } finally {
      registry.splice(registry.indexOf(point), 1);
    }
  });
});

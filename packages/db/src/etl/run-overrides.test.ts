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

const EXAMPLE_CONFIG = {
  hardware: 'gb300',
  framework: 'dynamo-vllm',
  model: 'dsv4',
  precision: 'fp4',
  specMethod: 'mtp',
  disagg: true,
  isMultinode: true,
  prefillTp: 8,
  prefillEp: 8,
  prefillDpAttn: true,
  prefillNumWorkers: 1,
  decodeTp: 8,
  decodeEp: 8,
  decodeDpAttn: true,
  decodeNumWorkers: 1,
  numPrefillGpu: 8,
  numDecodeGpu: 8,
} as const;

function examplePointBackfill(
  overrides: Partial<BenchmarkPointBackfill> = {},
): BenchmarkPointBackfill {
  return {
    id: 'run-123-point-offload',
    reason: 'Artifact omitted the offload metadata.',
    githubRunId: 123,
    runAttempt: 1,
    productionConfigId: 456,
    config: EXAMPLE_CONFIG,
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

  it('corrects only the six Qwen metrics-refresh recipes without changing measurements', () => {
    const backfills = BENCHMARK_POINT_BACKFILLS.filter((b) => b.githubRunId === 33219708211);
    expect(backfills.map((b) => [b.productionConfigId, b.conc, b.recipeFingerprint])).toEqual([
      [2360, 7, '18f2c2292689243d0b87de83c376830284db0d86fb04a729376a8e310e01856d'],
      [2361, 96, '097590578e9c8f65a51537c359a0bc0d0b4fcc5dbb557ee77a0939dbe0baeb3f'],
      [2362, 704, 'c798a4b016d861f821f34fbc9cffdfdcd74e1b608304f01f4fa944388ddd5ed0'],
      [2363, 52, '8b163e70d15e09358a90ea0e109a7d60bb822b71155285479822854747fa51bc'],
      [2364, 565, '3f73af0d7e9b46406415309565b5c912a78e3a7f0661e497a028af7323845fc4'],
      [2365, 44, '22c7807daf12e816829cdb3d8c8fe08f28d5a8e20b3eb7d33f0090e92dafe866'],
    ]);
    for (const backfill of backfills) {
      const point = {
        configId: backfill.productionConfigId,
        config: backfill.config,
        benchmarkType: 'agentic_traces',
        isl: null,
        osl: null,
        conc: backfill.conc,
        offloadMode: 'off',
        recipeFingerprint: backfill.recipeFingerprint,
        metrics: {
          median_itl: 0.1,
          output_tput_per_gpu: 123,
          server_gpu_cache_hit_rate: 0.5284,
          kv_p2p_transfer: 'nixl',
          allocated_cpu_dram_gb: 0,
          kv_offloading: 'none',
        },
      };
      const applied = applyBenchmarkPointBackfill(33219708211, 1, point);
      expect(applied.point).toEqual({
        ...point,
        offloadMode: 'on',
        metrics: {
          median_itl: 0.1,
          output_tput_per_gpu: 123,
          server_gpu_cache_hit_rate: 0.5284,
          kv_p2p_transfer: 'nixl',
          offload_mode: 'on',
          kv_offloading: 'dram',
          kv_offload_backend: 'native',
          kv_offload_backend_version: '1.3.0rc24',
        },
      });
      expect(applyBenchmarkPointBackfill(33219708211, 2, point).backfillId).toBeNull();
      expect(applyBenchmarkPointBackfill(31927376673, 1, point).backfillId).toBeNull();
      expect(
        applyBenchmarkPointBackfill(33219708211, 1, { ...point, recipeFingerprint: null })
          .backfillId,
      ).toBeNull();
      expect(applyBenchmarkPointBackfill(33219708211, 1, applied.point).point).toEqual(
        applied.point,
      );
    }
  });

  it.each([
    [128, 4, 'd84f06bb4a4016f9f2fe917feb4f10b960f87ac5f48bfae1b0bca1d66d7c887b'],
    [256, 4, '1472857d464c0780b5eeb41184ff70290c5f6b9ad6a8c07b2524697e21dd0e07'],
    [512, 8, '6ab19ba8680ab38b81c0d6a251d252576caafaf660118007c508b1f62df08c39'],
  ] as const)(
    'corrects the GB300 Mooncake c%i recipe without changing performance',
    (conc, prefillSize, recipeFingerprint) => {
      const point = {
        configId: prefillSize === 4 ? 2449 : 2448,
        config: {
          ...EXAMPLE_CONFIG,
          prefillTp: prefillSize,
          prefillEp: prefillSize,
          numPrefillGpu: prefillSize,
          decodeTp: 16,
          decodeEp: 16,
          numDecodeGpu: 16,
        },
        benchmarkType: 'agentic_traces',
        isl: null,
        osl: null,
        conc,
        offloadMode: 'off',
        recipeFingerprint,
        metrics: {
          kv_offloading: 'none',
          allocated_cpu_dram_gb: 0,
          median_itl: 0.1,
          output_tput_per_gpu: 123,
        },
      };
      const applied = applyBenchmarkPointBackfill(32809502132, 1, point);
      expect(applied.point.offloadMode).toBe('on');
      expect(applied.point.metrics).toMatchObject({
        offload_mode: 'on',
        kv_offloading: 'dram',
        kv_offload_backend: 'mooncake',
        kv_offload_backend_version: '0.3.11.post1',
        median_itl: 0.1,
        output_tput_per_gpu: 123,
      });
      expect(applied.point.metrics).not.toHaveProperty('allocated_cpu_dram_gb');
      expect(applyBenchmarkPointBackfill(32809502132, 2, point).backfillId).toBeNull();
      expect(
        applyBenchmarkPointBackfill(32809502132, 1, { ...point, recipeFingerprint: null })
          .backfillId,
      ).toBeNull();
      expect(applyBenchmarkPointBackfill(32809502132, 1, applied.point).point).toEqual(
        applied.point,
      );
      expect(
        BENCHMARK_POINT_BACKFILLS.find((b) => b.githubRunId === 32809502132 && b.conc === 4)?.set
          .offloadMode,
      ).toBeUndefined();
    },
  );

  it('limits borrowed prefix-cache hit rates to GB300 dynamo-vllm DeepSeek-V4 AgentX points', () => {
    const cacheHitKeys = [
      'server_gpu_cache_hit_rate',
      'server_external_cache_hit_rate',
      'server_cpu_cache_hit_rate',
    ];
    const borrowed = BENCHMARK_POINT_BACKFILLS.filter((backfill) =>
      cacheHitKeys.some((key) => key in (backfill.set.metricsMerge ?? {})),
    );

    // Only the GB300 sweeps missed the backend worker metrics scrape; every
    // other hardware measured its own hit rate and must never inherit one.
    expect(borrowed.length).toBe(14);
    for (const backfill of borrowed) {
      expect(backfill.config.hardware).toBe('gb300');
      expect(backfill.config.framework).toBe('dynamo-vllm');
      expect(backfill.config.model).toBe('dsv4');
      expect(backfill.benchmarkType).toBe('agentic_traces');
      for (const key of cacheHitKeys) {
        const value = backfill.set.metricsMerge?.[key];
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
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

  it('rejects duplicate stable selectors even when production config IDs differ', () => {
    const first = examplePointBackfill();
    const second = examplePointBackfill({
      id: 'run-123-duplicate-stable-selector',
      productionConfigId: 999,
    });

    expect(() => validateRunBackfills([], [first, second])).toThrow(/duplicate.*selector/u);
  });

  it('applies point corrections during ingest and synchronizes offload metadata', () => {
    const backfill = examplePointBackfill();
    const registry = BENCHMARK_POINT_BACKFILLS as BenchmarkPointBackfill[];
    registry.push(backfill);
    const point = {
      configId: 456,
      config: EXAMPLE_CONFIG,
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

  it('matches point backfills by stable config dimensions across database branches', () => {
    const backfill = examplePointBackfill();
    const registry = BENCHMARK_POINT_BACKFILLS as BenchmarkPointBackfill[];
    registry.push(backfill);

    try {
      const applied = applyBenchmarkPointBackfill(123, 1, {
        configId: 999,
        config: { ...EXAMPLE_CONFIG },
        benchmarkType: 'agentic_traces',
        isl: null,
        osl: null,
        conc: 64,
        offloadMode: 'off',
        recipeFingerprint: null,
        metrics: { median_itl: 0.1 },
      });

      expect(applied.backfillId).toBe(backfill.id);
      expect(applied.point.configId).toBe(999);
      expect(applied.point.offloadMode).toBe('on');
    } finally {
      registry.splice(registry.indexOf(backfill), 1);
    }
  });

  it('does not match a different stable config that reuses the production config ID', () => {
    const backfill = examplePointBackfill();
    const registry = BENCHMARK_POINT_BACKFILLS as BenchmarkPointBackfill[];
    registry.push(backfill);

    try {
      const applied = applyBenchmarkPointBackfill(123, 1, {
        configId: 456,
        config: { ...EXAMPLE_CONFIG, decodeTp: 16, numDecodeGpu: 16 },
        benchmarkType: 'agentic_traces',
        isl: null,
        osl: null,
        conc: 64,
        offloadMode: 'off',
        recipeFingerprint: null,
        metrics: { median_itl: 0.1 },
      });

      expect(applied.backfillId).toBeNull();
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

import { describe, expect, it } from 'vitest';

import {
  categorizeArtifact,
  categorizeArtifacts,
  selectBenchmarkSources,
  extractStatsRows,
  toAvailabilityRow,
  type CategorizedArtifacts,
} from './ingest-pipeline';
import type { BenchmarkParams } from './benchmark-mapper';
import type { ConfigParams } from './config-cache';

// ── categorizeArtifact ────────────────────────────────────────────────────────

describe('categorizeArtifact', () => {
  it('classifies each known prefix (dir-name and zip-name forms)', () => {
    // The CI run passes artifact directory names, the GCS backup passes ZIP
    // filenames — both share the same prefix vocabulary.
    expect(categorizeArtifact('bmk_dsr1_h200_1k8k')).toBe('benchmark');
    expect(categorizeArtifact('bmk_dsr1_h200_1k8k_123_456.zip')).toBe('benchmark');
    expect(categorizeArtifact('results_bmk')).toBe('results');
    expect(categorizeArtifact('results_20251217.zip')).toBe('results');
    expect(categorizeArtifact('run-stats_h200')).toBe('stats');
    expect(categorizeArtifact('run_stats_h200.zip')).toBe('stats');
    expect(categorizeArtifact('changelog-metadata')).toBe('changelog');
    expect(categorizeArtifact('changelog-metadata_123.zip')).toBe('changelog');
    expect(categorizeArtifact('server_logs_dsr1_h200')).toBe('serverLog');
    expect(categorizeArtifact('server_logs_dsr1_h200_1_2.zip')).toBe('serverLog');
  });

  it('classifies eval_results_all_* as evalAgg, not eval', () => {
    // Order matters: the aggregate prefix must win over the generic eval_ prefix.
    expect(categorizeArtifact('eval_results_all')).toBe('evalAgg');
    expect(categorizeArtifact('eval_results_all_123.zip')).toBe('evalAgg');
  });

  it('classifies a per-config eval dir/zip as eval', () => {
    expect(categorizeArtifact('eval_dsr1_h200_1k8k')).toBe('eval');
    expect(categorizeArtifact('eval_dsr1_h200_1k8k_123_456.zip')).toBe('eval');
  });

  it('returns null for unrecognized names', () => {
    expect(categorizeArtifact('artifacts_metadata.json')).toBeNull();
    expect(categorizeArtifact('reuse_source_run.json')).toBeNull();
    expect(categorizeArtifact('random-thing')).toBeNull();
    expect(categorizeArtifact('')).toBeNull();
  });

  it('does not treat a bare "results" (no underscore) as results', () => {
    // The prefix is `results_`, so `resultsX` without an underscore is unknown.
    expect(categorizeArtifact('resultsomething')).toBeNull();
    expect(categorizeArtifact('results_')).toBe('results');
  });
});

// ── categorizeArtifacts ───────────────────────────────────────────────────────

describe('categorizeArtifacts', () => {
  it('splits a mixed artifact set into the shared buckets', () => {
    const cats = categorizeArtifacts([
      'bmk_a',
      'bmk_b',
      'results_compiled',
      'run-stats_h200',
      'run_stats_b200',
      'eval_results_all_1',
      'eval_percfg_1',
      'eval_percfg_2',
      'changelog-metadata_1',
      'server_logs_a',
      'artifacts_metadata.json',
    ]);

    expect(cats.benchmark).toEqual(['bmk_a', 'bmk_b']);
    expect(cats.results).toEqual(['results_compiled']);
    expect(cats.stats).toEqual(['run-stats_h200', 'run_stats_b200']);
    expect(cats.evalAgg).toEqual(['eval_results_all_1']);
    expect(cats.eval).toEqual(['eval_percfg_1', 'eval_percfg_2']);
    expect(cats.changelog).toEqual(['changelog-metadata_1']);
    expect(cats.serverLog).toEqual(['server_logs_a']);
  });

  it('preserves input order within each bucket', () => {
    const cats = categorizeArtifacts(['bmk_z', 'bmk_a', 'bmk_m']);
    expect(cats.benchmark).toEqual(['bmk_z', 'bmk_a', 'bmk_m']);
  });

  it('drops unknown names silently', () => {
    const cats = categorizeArtifacts(['nope', 'also-nope', 'bmk_ok']);
    expect(cats.benchmark).toEqual(['bmk_ok']);
    const total =
      cats.benchmark.length +
      cats.results.length +
      cats.stats.length +
      cats.evalAgg.length +
      cats.eval.length +
      cats.changelog.length +
      cats.serverLog.length;
    expect(total).toBe(1);
  });

  it('returns all-empty buckets for an empty input', () => {
    const cats = categorizeArtifacts([]);
    expect(cats).toEqual({
      benchmark: [],
      results: [],
      stats: [],
      evalAgg: [],
      eval: [],
      changelog: [],
      serverLog: [],
    });
  });
});

// ── selectBenchmarkSources ────────────────────────────────────────────────────

function makeCats(partial: Partial<CategorizedArtifacts>): CategorizedArtifacts {
  return {
    benchmark: [],
    results: [],
    stats: [],
    evalAgg: [],
    eval: [],
    changelog: [],
    serverLog: [],
    ...partial,
  };
}

describe('selectBenchmarkSources', () => {
  it('prefers bmk_ artifacts when any exist', () => {
    expect(
      selectBenchmarkSources(makeCats({ benchmark: ['bmk_a', 'bmk_b'], results: ['results_x'] })),
    ).toEqual(['bmk_a', 'bmk_b']);
  });

  it('falls back to results_ artifacts when no bmk_ artifacts exist', () => {
    expect(selectBenchmarkSources(makeCats({ benchmark: [], results: ['results_x'] }))).toEqual([
      'results_x',
    ]);
  });

  it('returns an empty list when neither exists', () => {
    expect(selectBenchmarkSources(makeCats({}))).toEqual([]);
  });
});

// ── extractStatsRows ──────────────────────────────────────────────────────────

describe('extractStatsRows', () => {
  it('extracts rows for hardware keys in GPU_KEYS with numeric counts', () => {
    const rows = extractStatsRows({
      h200: { n_success: 10, total: 12 },
      b200: { n_success: 5, total: 5 },
    });
    expect(rows).toEqual([
      { hardware: 'h200', nSuccess: 10, total: 12 },
      { hardware: 'b200', nSuccess: 5, total: 5 },
    ]);
  });

  it('ignores hardware keys not in GPU_KEYS', () => {
    const rows = extractStatsRows({
      h200: { n_success: 1, total: 2 },
      not_a_gpu: { n_success: 9, total: 9 },
    });
    expect(rows).toEqual([{ hardware: 'h200', nSuccess: 1, total: 2 }]);
  });

  it('ignores entries with non-numeric n_success/total', () => {
    const rows = extractStatsRows({
      h200: { n_success: '10', total: 12 },
      b200: { n_success: 3, total: null },
      mi300x: { total: 4 },
      mi325x: { n_success: 7, total: 8 },
    });
    expect(rows).toEqual([{ hardware: 'mi325x', nSuccess: 7, total: 8 }]);
  });

  it('returns an empty array for non-object, array, or nullish input', () => {
    expect(extractStatsRows(null)).toEqual([]);
    expect(extractStatsRows(undefined)).toEqual([]);
    expect(extractStatsRows([{ h200: { n_success: 1, total: 1 } }])).toEqual([]);
    expect(extractStatsRows('nope')).toEqual([]);
    expect(extractStatsRows(42)).toEqual([]);
  });
});

// ── toAvailabilityRow ─────────────────────────────────────────────────────────

function config(overrides: Partial<ConfigParams> = {}): ConfigParams {
  return {
    hardware: 'h200',
    framework: 'sglang',
    model: 'dsr1',
    precision: 'fp8',
    specMethod: 'none',
    disagg: false,
    isMultinode: false,
    prefillTp: 1,
    prefillEp: 1,
    prefillDpAttn: false,
    prefillNumWorkers: 0,
    decodeTp: 1,
    decodeEp: 1,
    decodeDpAttn: false,
    decodeNumWorkers: 0,
    numPrefillGpu: 1,
    numDecodeGpu: 1,
    ...overrides,
  };
}

function bmk(overrides: Partial<BenchmarkParams> = {}): BenchmarkParams {
  return {
    config: config(),
    isl: 1000,
    osl: 8000,
    conc: 32,
    image: null,
    metrics: {},
    ...overrides,
  };
}

describe('toAvailabilityRow', () => {
  it('projects the availability-relevant fields from a mapped benchmark row', () => {
    const row = bmk({
      isl: 1024,
      osl: 8192,
      config: config({
        model: 'kimi-k2',
        hardware: 'b200',
        precision: 'fp4',
        framework: 'vllm',
        specMethod: 'eagle',
        disagg: true,
      }),
    });

    expect(toAvailabilityRow(row)).toEqual({
      model: 'kimi-k2',
      isl: 1024,
      osl: 8192,
      precision: 'fp4',
      hardware: 'b200',
      framework: 'vllm',
      specMethod: 'eagle',
      disagg: true,
    });
  });

  it('reads isl/osl from the row, not the config', () => {
    const row = bmk({ isl: 2048, osl: 128 });
    const avail = toAvailabilityRow(row);
    expect(avail.isl).toBe(2048);
    expect(avail.osl).toBe(128);
  });
});

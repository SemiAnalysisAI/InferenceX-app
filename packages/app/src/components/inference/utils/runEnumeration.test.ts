import { describe, expect, it } from 'vitest';

import type { RunConfigRow } from '@/lib/api';

import { dataRunsForDate, scenarioRunIdsForDate } from './runEnumeration';

function rc(over: Partial<RunConfigRow>): RunConfigRow {
  return {
    github_run_id: 1,
    run_started_at: '2026-06-14T00:00:00Z',
    html_url: null,
    head_sha: null,
    model: 'minimaxm3',
    precision: 'fp8',
    hardware: 'mi300x',
    framework: 'vllm',
    spec_method: 'none',
    disagg: false,
    // Defaults to a single_turn 8k/1k row; agentic tests override these.
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    ...over,
  };
}

/** A single_turn (fixed-seq) run config for the given isl/osl. */
function single(over: Partial<RunConfigRow>): RunConfigRow {
  return rc({ benchmark_type: 'single_turn', isl: 8192, osl: 1024, ...over });
}

/** An agentic_traces run config (null isl/osl, as ingested for agentic rows). */
function agentic(over: Partial<RunConfigRow>): RunConfigRow {
  return rc({ benchmark_type: 'agentic_traces', isl: null, osl: null, ...over });
}

const SCOPE = {
  modelDbKeys: ['minimaxm3'],
  selectedGPUs: ['mi300x_vllm'],
  selectedPrecisions: ['fp8'],
};

describe('dataRunsForDate', () => {
  it('enumerates distinct runs for the selected config, earliest first', () => {
    const rows = [
      rc({ github_run_id: 27489075807, run_started_at: '2026-06-14T06:43:25Z' }),
      rc({ github_run_id: 27485974465, run_started_at: '2026-06-14T04:08:16Z' }),
      rc({ github_run_id: 27510667862, run_started_at: '2026-06-14T23:22:40Z' }),
    ];
    const runs = dataRunsForDate(rows, SCOPE);
    expect(runs.map((r) => r.runId)).toEqual(['27485974465', '27489075807', '27510667862']);
  });

  it('dedupes a run that appears in multiple matching rows into one entry', () => {
    const rows = [
      rc({ github_run_id: 100 }),
      // same run id appearing again (e.g. another covered row) — still one run
      rc({ github_run_id: 100 }),
    ];
    const runs = dataRunsForDate(rows, SCOPE);
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('100');
  });

  it('excludes MTP runs when a non-MTP GPU key is selected', () => {
    const rows = [
      rc({ github_run_id: 1, spec_method: 'none' }),
      rc({ github_run_id: 2, spec_method: 'mtp' }),
    ];
    const runs = dataRunsForDate(rows, SCOPE);
    expect(runs.map((r) => r.runId)).toEqual(['1']);
  });

  it('includes only MTP runs when the MTP GPU key is selected', () => {
    const rows = [
      rc({ github_run_id: 1, spec_method: 'none' }),
      rc({ github_run_id: 2, spec_method: 'mtp' }),
    ];
    const runs = dataRunsForDate(rows, { ...SCOPE, selectedGPUs: ['mi300x_vllm_mtp'] });
    expect(runs.map((r) => r.runId)).toEqual(['2']);
  });

  it('excludes runs for other models, precisions, and GPUs', () => {
    const rows = [
      rc({ github_run_id: 1 }), // matches
      rc({ github_run_id: 2, model: 'dsr1' }), // other model
      rc({ github_run_id: 3, precision: 'fp4' }), // other precision
      rc({ github_run_id: 4, hardware: 'b200' }), // other gpu
      rc({ github_run_id: 5, framework: 'sglang' }), // other framework
    ];
    const runs = dataRunsForDate(rows, SCOPE);
    expect(runs.map((r) => r.runId)).toEqual(['1']);
  });

  it('includes a run for any selected GPU (union across GPUs)', () => {
    const rows = [
      rc({ github_run_id: 1, hardware: 'mi300x', framework: 'vllm' }),
      rc({ github_run_id: 2, hardware: 'b200', framework: 'vllm' }),
    ];
    const runs = dataRunsForDate(rows, { ...SCOPE, selectedGPUs: ['mi300x_vllm', 'b200_vllm'] });
    expect(runs.map((r) => r.runId).toSorted()).toEqual(['1', '2']);
  });

  it('carries run url and head sha through', () => {
    // The single-run changelog block links off these per-run fields (#408), so a
    // date with unrelated same-day runs cannot borrow another run's commit/run links.
    const rows = [
      rc({
        github_run_id: 7,
        html_url: 'https://github.com/x/actions/runs/7',
        head_sha: 'abc123',
      }),
    ];
    const [run] = dataRunsForDate(rows, SCOPE);
    expect(run.runUrl).toBe('https://github.com/x/actions/runs/7');
    expect(run.headSha).toBe('abc123');
  });

  it('returns nothing when no run matches the selection', () => {
    expect(dataRunsForDate([], SCOPE)).toEqual([]);
    expect(dataRunsForDate([rc({ model: 'dsr1' })], SCOPE)).toEqual([]);
  });
});

// Mirrors the repro: on one date the same model has a single_turn run and an
// agentic run; each scenario must list ONLY its own run.
const ids = (rows: RunConfigRow[], model: string[], seq: string, prec: string[] = []) =>
  [...scenarioRunIdsForDate(rows, model, seq, prec)].toSorted();

describe('scenarioRunIdsForDate', () => {
  it('agentic scenario excludes runs that only produced single_turn data', () => {
    const rows = [
      agentic({ github_run_id: 28955639528, model: 'dsv4' }), // dsv4 agentic
      single({ github_run_id: 28900000001, model: 'dsv4' }), // dsv4 single_turn (leaks today)
      single({ github_run_id: 28900000002, model: 'glm5' }), // other model
    ];
    expect(ids(rows, ['dsv4'], 'agentic-traces')).toEqual(['28955639528']);
  });

  it('single_turn scenario excludes agentic-only runs', () => {
    const rows = [
      agentic({ github_run_id: 1, model: 'dsv4' }),
      single({ github_run_id: 2, model: 'dsv4' }),
    ];
    expect(ids(rows, ['dsv4'], '8k/1k')).toEqual(['2']);
  });

  it('lists a run that produced data for both scenarios under each scenario', () => {
    const rows = [
      agentic({ github_run_id: 42, model: 'dsv4' }),
      single({ github_run_id: 42, model: 'dsv4' }), // same run, both types
    ];
    expect(ids(rows, ['dsv4'], 'agentic-traces')).toEqual(['42']);
    expect(ids(rows, ['dsv4'], '8k/1k')).toEqual(['42']);
  });

  it('scopes to the selected model DB keys', () => {
    const rows = [
      agentic({ github_run_id: 1, model: 'dsv4' }),
      agentic({ github_run_id: 2, model: 'glm5' }),
    ];
    expect(ids(rows, ['dsv4'], 'agentic-traces')).toEqual(['1']);
  });

  it('respects precision scoping when precisions are provided', () => {
    const rows = [
      agentic({ github_run_id: 1, model: 'dsv4', precision: 'fp4' }),
      agentic({ github_run_id: 2, model: 'dsv4', precision: 'fp8' }),
    ];
    expect(ids(rows, ['dsv4'], 'agentic-traces', ['fp4'])).toEqual(['1']);
    // Empty precisions = no precision constraint.
    expect(ids(rows, ['dsv4'], 'agentic-traces')).toEqual(['1', '2']);
  });

  it('dedupes a run appearing across multiple matching configs', () => {
    const rows = [
      agentic({ github_run_id: 7, model: 'dsv4', hardware: 'b200' }),
      agentic({ github_run_id: 7, model: 'dsv4', hardware: 'gb200' }),
    ];
    expect(ids(rows, ['dsv4'], 'agentic-traces')).toEqual(['7']);
  });

  it('returns an empty set when there is no coverage data', () => {
    expect(scenarioRunIdsForDate([], ['dsv4'], 'agentic-traces').size).toBe(0);
  });
});

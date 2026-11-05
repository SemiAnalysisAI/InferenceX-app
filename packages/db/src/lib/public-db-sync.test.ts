import { describe, expect, it } from 'vitest';
import {
  configKey,
  findDriftedRuns,
  naturalKey,
  parseRunSelectors,
  planRunSync,
  selectRuns,
  type RunSummary,
} from './public-db-sync';

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    github_run_id: '100',
    run_attempt: 1,
    benchmark_results: 10,
    server_log_files: 10,
    trace_replays: 0,
    trace_payloads: 0,
    server_logs: 0,
    eval_results: 2,
    eval_samples: 200,
    run_stats: 1,
    changelog_entries: 1,
    run_datasets: 0,
    ...overrides,
  };
}

describe('planRunSync', () => {
  it('plans runs absent from the target as missing', () => {
    const plans = planRunSync([makeRun()], []);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.missing).toBe(true);
  });

  it('skips runs the target already holds in full', () => {
    expect(planRunSync([makeRun()], [makeRun()])).toEqual([]);
  });

  it('distinguishes attempts of the same GitHub run', () => {
    const plans = planRunSync([makeRun({ run_attempt: 2 })], [makeRun({ run_attempt: 1 })]);
    expect(plans.map((plan) => plan.missing)).toEqual([true]);
  });

  it('lists only the child tables where the target is short', () => {
    const plans = planRunSync(
      [makeRun({ benchmark_results: 12, eval_samples: 250 })],
      [makeRun({ server_log_files: 99 })],
    );
    expect(plans).toEqual([
      expect.objectContaining({
        missing: false,
        shortTables: ['benchmark_results', 'eval_samples'],
      }),
    ]);
  });

  it('never plans target-only runs', () => {
    expect(planRunSync([], [makeRun({ github_run_id: '999' })])).toEqual([]);
  });
});

describe('natural keys', () => {
  it('treats null and undefined as the same value', () => {
    expect(naturalKey(['a', null])).toBe(naturalKey(['a', undefined]));
  });

  it('separates configs that differ only in topology', () => {
    const base = { hardware: 'b200', framework: 'sglang', model: 'qwen3.5', decode_tp: 8 };
    expect(configKey(base)).not.toBe(configKey({ ...base, decode_tp: 4 }));
  });
});

describe('findDriftedRuns', () => {
  it('reports runs where the target holds benchmark or eval rows public removed', () => {
    const drift = findDriftedRuns(
      [makeRun({ benchmark_results: 8 })],
      [makeRun({ benchmark_results: 10, eval_results: 3 })],
    );
    expect(drift).toEqual([
      { key: '100#1', tables: ['benchmark_results: 10>8', 'eval_results: 3>2'] },
    ]);
  });

  it('ignores private-only runs and runs the target holds fewer rows for', () => {
    const drift = findDriftedRuns(
      [makeRun({ benchmark_results: 12 })],
      [makeRun(), makeRun({ github_run_id: '999', benchmark_results: 50 })],
    );
    expect(drift).toEqual([]);
  });
});

describe('parseRunSelectors', () => {
  it('reads run ids with optional attempts', () => {
    expect(parseRunSelectors(' 101, 102#3 ')).toEqual([
      { githubRunId: '101', runAttempt: null },
      { githubRunId: '102', runAttempt: 3 },
    ]);
  });

  it.each(['', ',', 'abc', '101#0', '101#', '101 102', '-5'])('rejects %j', (value) => {
    expect(() => parseRunSelectors(value)).toThrow();
  });
});

describe('selectRuns', () => {
  const source = [
    makeRun({ github_run_id: '101', run_attempt: 1 }),
    makeRun({ github_run_id: '101', run_attempt: 2 }),
    makeRun({ github_run_id: '102', run_attempt: 1 }),
  ];

  it('selects every attempt of a run when no attempt is given', () => {
    const selection = selectRuns(source, planRunSync(source, []), parseRunSelectors('101'));
    expect(selection.plans.map((plan) => plan.summary.run_attempt)).toEqual([1, 2]);
    expect(selection.unknown).toEqual([]);
  });

  it('selects only the pinned attempt', () => {
    const selection = selectRuns(source, planRunSync(source, []), parseRunSelectors('101#2'));
    expect(selection.plans.map((plan) => plan.summary.run_attempt)).toEqual([2]);
    expect(selection.runs).toHaveLength(1);
  });

  it('reports runs or attempts the source does not have', () => {
    const selection = selectRuns(source, planRunSync(source, []), parseRunSelectors('103,102#2'));
    expect(selection.plans).toEqual([]);
    expect(selection.unknown).toEqual([
      { githubRunId: '103', runAttempt: null },
      { githubRunId: '102', runAttempt: 2 },
    ]);
  });

  it('reports selected runs the target already holds in full without planning them', () => {
    const target = [makeRun({ github_run_id: '102', run_attempt: 1 })];
    const selection = selectRuns(source, planRunSync(source, target), parseRunSelectors('102'));
    expect(selection.plans).toEqual([]);
    expect(selection.inSync).toEqual(['102#1']);
    expect(selection.runs).toHaveLength(1);
  });
});

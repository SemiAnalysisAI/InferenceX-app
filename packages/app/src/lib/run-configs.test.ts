import { describe, expect, it } from 'vitest';

import type { RunConfigRow } from './api';
import { scenarioRunIdsForDate } from './run-configs';

function row(overrides: Partial<RunConfigRow>): RunConfigRow {
  return {
    github_run_id: 1,
    run_started_at: '2026-07-10T00:00:00Z',
    html_url: null,
    head_sha: null,
    model: 'dsv4',
    precision: 'fp4',
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    ...overrides,
  };
}

const ids = (rows: RunConfigRow[], sequence: string) =>
  [...scenarioRunIdsForDate(rows, ['dsv4'], sequence, ['fp4'])].toSorted();

describe('scenarioRunIdsForDate', () => {
  it('does not expose July 4 single-turn runs under Agentic Traces', () => {
    const july4 = row({
      github_run_id: 28593351944,
      benchmark_type: 'single_turn',
      isl: 8192,
      osl: 1024,
    });
    expect(ids([july4], 'agentic-traces')).toEqual([]);
    expect(ids([july4], '8k/1k')).toEqual(['28593351944']);
  });

  it('includes a run in each scenario for which it produced data', () => {
    const rows = [
      row({ github_run_id: 42 }),
      row({ github_run_id: 42, benchmark_type: 'single_turn', isl: 8192, osl: 1024 }),
    ];
    expect(ids(rows, 'agentic-traces')).toEqual(['42']);
    expect(ids(rows, '8k/1k')).toEqual(['42']);
  });

  it('filters by model and precision and deduplicates run IDs', () => {
    const rows = [
      row({ github_run_id: 7 }),
      row({ github_run_id: 7, hardware: 'b300' }),
      row({ github_run_id: 8, model: 'glm5' }),
      row({ github_run_id: 9, precision: 'fp8' }),
    ];
    expect(ids(rows, 'agentic-traces')).toEqual(['7']);
  });
});

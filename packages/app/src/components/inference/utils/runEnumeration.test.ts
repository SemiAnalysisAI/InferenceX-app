import { describe, expect, it } from 'vitest';

import type { RunConfigRow } from '@/lib/api';

import { dataRunsForDate } from './runEnumeration';

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
    ...over,
  };
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

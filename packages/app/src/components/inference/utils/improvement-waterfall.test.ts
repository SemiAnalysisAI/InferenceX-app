import { describe, expect, it } from 'vitest';
import type { BenchmarkRow, WorkflowInfoResponse } from '@/lib/api/api';
import type { TrendDataPoint, TrendSource } from '../types';
import {
  buildImprovementWaterfall,
  matchingChanges,
  pullRequestLinks,
} from './improvement-waterfall';
import { rowToLightweightPoint } from '../hooks/interpolated-trend-core';

const point = (date: string, value: number, synthetic = false): TrendDataPoint => ({
  date,
  value,
  x: 30,
  synthetic,
});
const source: TrendSource = {
  date: '2026-09-01',
  runId: 12345678901,
  runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/12345678901/attempts/2',
  model: 'dsr1',
  precision: 'fp4',
  hwKey: 'b200_sglang',
  benchmarkType: 'single_turn',
};
const change = {
  workflow_run_id: source.runId,
  date: source.date,
  base_ref: 'a',
  head_ref: 'b',
  config_keys: ['dsr1-fp4-b200-sglang'],
  description: 'Engine update',
  pr_link: 'https://github.com/SemiAnalysisAI/InferenceX/pull/100',
};
const workflow = (changelogs: WorkflowInfoResponse['changelogs']): WorkflowInfoResponse => ({
  changelogs,
  runs: [],
  configs: [],
  runConfigs: [],
});

describe('improvement waterfall', () => {
  it('excludes legacy total-as-output fallbacks from comparable output gains', () => {
    const steps = buildImprovementWaterfall([
      { ...point('2025-09-01', 10000), waterfallEligible: false },
      { ...point('2025-10-01', 100), waterfallEligible: true },
      { ...point('2025-11-01', 120), waterfallEligible: true },
    ]);
    expect(steps.map((step) => step.to)).toEqual([100, 120, 120]);
    expect(steps[0].date).toBe('2025-10-01');
  });
  it('sorts observations, skips regressions and recoveries, and telescopes to the best', () => {
    const steps = buildImprovementWaterfall([
      point('2026-01-05', 140),
      point('2026-01-01', 100),
      point('2026-01-02', 120),
      point('2026-01-03', 90),
      point('2026-01-04', 120),
      point('2026-01-06', 140.000000001),
      point('2026-01-07', 999, true),
    ]);
    expect(steps.map(({ kind, to }) => [kind, to])).toEqual([
      ['baseline', 100],
      ['gain', 120],
      ['gain', 140],
      ['best', 140],
    ]);
    expect(steps.slice(0, -1).reduce((sum, step) => sum + step.delta, 0)).toBe(140);
    expect(steps.at(-1)?.date).toBe('2026-01-05');
  });
  it('uses falling records for lower-is-better cost and energy metrics', () => {
    const steps = buildImprovementWaterfall(
      [
        point('2026-01-01', 5),
        point('2026-01-02', 4),
        point('2026-01-03', 6),
        point('2026-01-04', 3),
      ],
      true,
    );
    expect(steps.map((step) => step.delta)).toEqual([5, -1, -1, 3]);
  });
  it('handles empty, non-finite, no-improvement and synthetic-only series', () => {
    expect(buildImprovementWaterfall([])).toEqual([]);
    expect(
      buildImprovementWaterfall([point('2026-01-01', NaN), point('2026-01-02', 1, true)]),
    ).toEqual([]);
    expect(
      buildImprovementWaterfall([point('2026-01-01', 100), point('2026-01-02', 80)]).map(
        (s) => s.kind,
      ),
    ).toEqual(['baseline', 'best']);
  });
  it('keeps producer sources on the winning observation', () => {
    const steps = buildImprovementWaterfall([{ ...point(source.date, 100), sources: [source] }]);
    expect(steps.at(-1)?.sources).toEqual([source]);
  });
  it('matches run, date, model, precision, hardware and benchmark type, including serialized bigint IDs', () => {
    const wrong = [
      { ...change, workflow_run_id: 999 },
      { ...change, date: '2026-08-01' },
      ...[
        'dsr1-fp8-b200-sglang',
        'qwen3-fp4-b200-sglang',
        'dsr1-fp4-h100-sglang',
        'dsr1-fp4-b200-sglang-agentic',
        'dsr1-fp4-b200-sglang-mtp',
      ].map((key) => ({ ...change, config_keys: [key] })),
    ];
    const correct = { ...change, workflow_run_id: String(source.runId) as unknown as number };
    expect(matchingChanges([source], [workflow([...wrong, correct])])).toEqual([correct]);
  });
  it('deduplicates PRs and rejects unsafe or non-PR URLs', () => {
    expect(
      pullRequestLinks([
        change,
        change,
        { ...change, pr_link: 'http://github.com/a/b/pull/1' },
        { ...change, pr_link: 'https://github.com/a/b/issues/1' },
      ]),
    ).toEqual([change.pr_link]);
    expect(matchingChanges([source], [workflow([])])).toEqual([]);
  });
  it('uses the producer GitHub URL, not an internal or carried-forward snapshot ID', () => {
    const row = {
      hardware: 'b200',
      framework: 'sglang',
      model: 'dsr1',
      precision: 'fp4',
      id: 1,
      is_multinode: false,
      prefill_tp: 8,
      prefill_ep: 1,
      prefill_dp_attention: false,
      prefill_num_workers: 0,
      decode_dp_attention: false,
      decode_num_workers: 0,
      offload_mode: 'off',
      image: null,
      spec_method: 'none',
      benchmark_type: 'single_turn',
      disagg: false,
      decode_tp: 8,
      decode_ep: 1,
      num_decode_gpu: 8,
      num_prefill_gpu: 8,
      isl: 8192,
      osl: 1024,
      conc: 8,
      metrics: { tput_per_gpu: 100, median_intvty: 30 },
      date: source.date,
      curve_date: '2026-09-10',
      workflow_run_id: 7,
      curve_workflow_run_id: 9,
      run_url: source.runUrl,
    } as BenchmarkRow;
    expect(rowToLightweightPoint(row, ['tpPerGpu'])?.trendSource).toEqual(source);
    expect(
      rowToLightweightPoint({ ...row, run_url: null }, ['tpPerGpu'])?.trendSource,
    ).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { BenchmarkRow } from '@/lib/api';
import { mergeRunScopedRows } from './benchmark-transform';
import { dedupeAgenticHistoryRuns, dedupeRowsToLatestPerConfig } from './benchmark-run-selection';

const old = {
  id: 440948,
  model: 'glm5.2',
  hardware: 'gb300',
  framework: 'dynamo-trt',
  precision: 'fp4',
  benchmark_type: 'agentic_traces',
  isl: null,
  osl: null,
  spec_method: 'mtp',
  disagg: false,
  offload_mode: 'off',
  prefill_tp: 8,
  decode_tp: 8,
  conc: 1,
  date: '2026-09-01',
  workflow_run_id: 2396,
  run_started_at: '2026-09-01T21:32:27Z',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33219706372/attempts/2',
  metrics: {},
} as BenchmarkRow;
const replacement = [1, 20, 30, 60, 227, 260].map((conc, i) => ({
  ...old,
  id: 441595 + i,
  conc,
  disagg: true,
  offload_mode: 'on',
  prefill_tp: 4,
  date: '2026-09-11',
  workflow_run_id: 2437,
  run_started_at: '2026-09-11T17:00:36Z',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34413290524/attempts/1',
}));

describe('PR #2939 AgentX replacement', () => {
  it('drops the carried AGG point from current selection but preserves the earlier history', () => {
    expect(dedupeRowsToLatestPerConfig([old, ...replacement])).toEqual(replacement);
    expect(dedupeAgenticHistoryRuns([old, ...replacement])).toEqual([old, ...replacement]);
  });
  it('does not resurrect the AGG point when selecting the replacement run', () => {
    expect(mergeRunScopedRows(replacement, [old, ...replacement])).toEqual(replacement);
    expect(mergeRunScopedRows([old], replacement)).toEqual([old]);
  });
  it('keeps explicit append-only ancestors by logical snapshot identity', () => {
    const ancestor = {
      ...old,
      curve_date: '2026-09-11',
      curve_workflow_run_id: 2437,
      curve_run_started_at: replacement[0].run_started_at,
    };
    expect(dedupeRowsToLatestPerConfig([ancestor, ...replacement])).toEqual([
      ancestor,
      ...replacement,
    ]);
    expect(mergeRunScopedRows([ancestor, ...replacement], [old])).toEqual([
      ancestor,
      ...replacement,
    ]);
  });
  it('preserves unrelated curves when pinning an AgentX snapshot', () => {
    const other = { ...old, framework: 'sglang' };
    expect(mergeRunScopedRows(replacement, [old, other])).toEqual([...replacement, other]);
  });
});

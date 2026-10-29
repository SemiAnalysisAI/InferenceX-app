import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';

import { stitchAppendOnlyPreview } from './append-only-preview';

const IMAGE = 'lmsysorg/sglang:v0.6.1';
const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/40895671658';
const PRODUCER_URL =
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/40000000000/attempts/1';
const SNAPSHOT = {
  runId: '40895671658',
  date: '2026-10-29',
  startedAt: '2026-10-29T14:55:00Z',
  runUrl: RUN_URL,
};

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 0,
    hardware: 'b300',
    framework: 'sglang',
    model: 'minimaxm31flash',
    precision: 'fp4',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 2,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 2,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 2,
    num_decode_gpu: 2,
    benchmark_type: 'agentic_traces',
    offload_mode: 'dram',
    isl: null,
    osl: null,
    conc: 40,
    image: IMAGE,
    recipe_fingerprint: 'spf-16',
    metrics: { tput_per_gpu: 1000 },
    date: SNAPSHOT.date,
    run_url: RUN_URL,
    ...overrides,
  };
}

function published(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return row({
    id: 7001,
    date: '2026-10-20',
    workflow_run_id: 2390,
    run_url: PRODUCER_URL,
    curve_date: '2026-10-20',
    curve_workflow_run_id: 2390,
    curve_run_started_at: '2026-10-20 10:00:00+00',
    ...overrides,
  });
}

describe('stitchAppendOnlyPreview', () => {
  it('extends the published same-image curve as one snapshot that keeps producer dates', () => {
    const added = row({ conc: 40 });
    const tp4 = published({
      prefill_tp: 4,
      decode_tp: 4,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    });
    const otherHardware = published({ hardware: 'b200' });

    const result = stitchAppendOnlyPreview([added], [tp4, otherHardware], SNAPSHOT);

    expect(result).toHaveLength(2);
    const inherited = result.find((r) => r.prefill_tp === 4)!;
    expect(inherited).toMatchObject({
      id: 7001,
      date: '2026-10-20',
      workflow_run_id: 2390,
      run_url: RUN_URL,
    });
    for (const r of result) {
      expect(r).toMatchObject({
        curve_date: SNAPSHOT.date,
        curve_workflow_run_id: -40895671658,
        curve_run_started_at: SNAPSHOT.startedAt,
      });
    }
  });

  it('lets a re-measured point replace its published value but keeps distinct recipes', () => {
    const remeasured = row({
      conc: 48,
      recipe_fingerprint: 'spf-16',
      metrics: { tput_per_gpu: 2 },
    });
    const publishedSame = published({ conc: 48, recipe_fingerprint: 'spf-16' });
    const publishedOtherRecipe = published({
      conc: 48,
      recipe_fingerprint: 'spf-32',
    });

    const result = stitchAppendOnlyPreview(
      [remeasured],
      [publishedSame, publishedOtherRecipe],
      SNAPSHOT,
    );

    expect(result.map((r) => [r.recipe_fingerprint, r.metrics.tput_per_gpu])).toEqual([
      ['spf-16', 2],
      ['spf-32', 1000],
    ]);
  });

  it('does not inherit across an image change or from a mixed-image run', () => {
    const differentImage = published({
      prefill_tp: 4,
      decode_tp: 4,
      image: 'lmsysorg/sglang:v0.6.0',
    });
    const added = row();
    expect(stitchAppendOnlyPreview([added], [differentImage], SNAPSHOT)).toEqual([added]);

    const mixed = [row(), row({ conc: 44, image: 'lmsysorg/sglang:v0.6.0' })];
    expect(stitchAppendOnlyPreview(mixed, [published({ prefill_tp: 4 })], SNAPSHOT)).toEqual(mixed);
  });
});

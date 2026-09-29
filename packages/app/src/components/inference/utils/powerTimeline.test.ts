import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  prioritizeRuns,
  summarizeTraceWindow,
  tracePools,
  type PowerTimelineTrace,
} from './powerTimeline';

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34716669498';
const NAME_B =
  'qwen3.5_8k1k_fp8_dynamo-sglang_prefill-tp4-pp1-dcp1-pcp1-ep1-dpfalse-nw1_decode-tp4-5b35252b29d80b104d11_sa-bench_isl_8192_osl_1024_conc1_gpus_8_ctx_4_gen_4';

function point(overrides: Partial<InferenceData>): InferenceData {
  return {
    x: 1,
    y: 1,
    hwKey: 'b200_sglang',
    tp: 4,
    conc: 16,
    precision: 'fp8',
    date: '2026-09-12',
    run_url: RUN_URL,
    ...overrides,
  } as InferenceData;
}

describe('summarizeTraceWindow', () => {
  // Two prefill and two decode GPUs; the window holds buckets 1–3 (t = 11..13 s).
  const pooled: PowerTimelineTrace = {
    key: `34716669498:${NAME_B}`,
    point: point({ disagg: true, conc: 4 }),
    runId: '34716669498',
    series: {
      artifact: `power_audit_${NAME_B}`,
      startMs: 1_000_000,
      bucketSeconds: 1,
      gpus: [0, 1, 2, 3],
      t: [10, 11, 12, 13, 14],
      power: [
        [900, 250, 260, 270, 900],
        [900, 250, null, 270, 900],
        [900, 400, 410, 420, 900],
        [900, 400, 410, 420, 900],
      ],
      devices: [
        { id: 'a/0', role: 'prefill' },
        { id: 'a/1', role: 'prefill' },
        { id: 'b/0', role: 'decode' },
        { id: 'b/1', role: 'decode' },
      ],
    },
    windowStartMs: 1_011_000,
    windowEndMs: 1_013_500,
  };

  it('reports window length and each pool’s peak summed bucket inside the window', () => {
    const summary = summarizeTraceWindow(pooled, tracePools(pooled.series));
    expect(summary.windowSeconds).toBe(2.5);
    expect(summary.bucketSeconds).toBe(1);
    // The 900 W buckets sit outside the window; bucket 2 lacks one prefill GPU,
    // so it is a gap, not a 260 W dip.
    expect(summary.pools).toEqual([
      { role: 'prefill', gpuCount: 2, peakWatts: 540 },
      { role: 'decode', gpuCount: 2, peakWatts: 840 },
    ]);
  });
});

describe('prioritizeRuns', () => {
  const requests = ['1', '2', '3', '4', '5'].map((runId) => ({
    runId,
    prefix: '',
    sources: [],
  }));

  it('moves overlay runs ahead of official runs and keeps both orders', () => {
    expect(prioritizeRuns(requests, new Set(['5', '3'])).map((request) => request.runId)).toEqual([
      '3',
      '5',
      '1',
      '2',
      '4',
    ]);
  });
});

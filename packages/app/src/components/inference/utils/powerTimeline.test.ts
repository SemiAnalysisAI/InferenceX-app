import { describe, expect, it } from 'vitest';

import { bucketPowerSeries, bucketTimeMs } from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

import {
  prioritizeRuns,
  summarizeTraceWindow,
  tracePools,
  windowPhase,
  type PowerTimelineTrace,
  mostCoveredConcurrency,
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
    expect(summary.pools).toEqual([
      { role: 'prefill', gpuCount: 2, peakWatts: 540 },
      { role: 'decode', gpuCount: 2, peakWatts: 840 },
    ]);
  });
});

describe('windowPhase', () => {
  it('classifies each bucket by its samples’ time, not the start of their second', () => {
    const windowStartMs = Date.UTC(2026, 9, 13, 18, 25, 28, 354);
    const rows = [-0.484, 0.516, 1.516, 2.516, 3.516].map((offset, i) => ({
      timestamp: new Date(windowStartMs + offset * 1000).toISOString(),
      index: 0,
      power: 400 + i,
      temperature: 40,
      smClock: 1,
      memClock: 1,
      gpuUtil: 0,
      memUtil: 0,
    }));
    const series = bucketPowerSeries('power_audit_edge', rows)!;
    const trace: PowerTimelineTrace = {
      key: 'edge',
      point: point({}),
      runId: '38460258140',
      series,
      windowStartMs,
      windowEndMs: windowStartMs + 2711,
    };
    expect(series.t.map((_, column) => windowPhase(trace, bucketTimeMs(series, column)))).toEqual([
      'before',
      'window',
      'window',
      'window',
      'after',
    ]);
    expect(bucketTimeMs(series, 1)).toBe(windowStartMs + 516);
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

describe('mostCoveredConcurrency', () => {
  it('picks the concurrency shared by the most hardware configs', () => {
    // conc 4 has the most rows (four b200), conc 64 the most distinct configs.
    expect(
      mostCoveredConcurrency([
        { conc: 4, hwKey: 'b200' },
        { conc: 4, hwKey: 'b200' },
        { conc: 4, hwKey: 'b200' },
        { conc: 4, hwKey: 'b200' },
        { conc: 64, hwKey: 'b200' },
        { conc: 64, hwKey: 'mi355x' },
        { conc: 64, hwKey: 'mi355x' },
      ]),
    ).toBe(64);
    // A tie breaks toward the higher load.
    expect(
      mostCoveredConcurrency([
        { conc: 8, hwKey: 'b200' },
        { conc: 32, hwKey: 'h200' },
      ]),
    ).toBe(32);
  });
});

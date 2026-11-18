import { describe, expect, it } from 'vitest';

import { bucketPowerSeries, bucketTimeMs } from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

import {
  poolSubsetSeries,
  powerTimelineStatus,
  prioritizeRuns,
  traceLanes,
  summarizeTraceWindow,
  tracePools,
  windowPhase,
  type PowerTimelineTrace,
  mostCoveredConcurrency,
} from './powerTimeline';
import { AGGREGATED_GB200_C1_SERIES, DISAGG_GB200_C16_SERIES } from './powerTimeline.fixture';

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

describe('powerTimelineStatus', () => {
  const base = {
    loadingRuns: 0,
    fetchedRuns: 2,
    failedRuns: 0,
    hasAnyArtifact: true,
    visibleTraces: 2,
    missingWindows: 0,
    drawable: true,
  };

  it('shows nothing once lines are drawn and every run has settled', () => {
    expect(powerTimelineStatus(base)).toBeNull();
  });

  it('blocks the plot while nothing is drawable yet, so no placeholder axes show', () => {
    expect(
      powerTimelineStatus({ ...base, loadingRuns: 2, visibleTraces: 0, drawable: false }),
    ).toEqual({ kind: 'loading', runs: 2, blocking: true });
  });

  it('keeps drawn lines visible while further runs are loading', () => {
    expect(powerTimelineStatus({ ...base, loadingRuns: 1 })).toEqual({
      kind: 'loading',
      runs: 1,
      blocking: false,
    });
  });

  it('reports a failure instead of the legend hint when every request failed', () => {
    expect(
      powerTimelineStatus({ ...base, failedRuns: 2, visibleTraces: 0, drawable: false }),
    ).toMatchObject({ kind: 'error', blocking: true });
    expect(
      powerTimelineStatus({ ...base, failedRuns: 1, visibleTraces: 0, drawable: false }),
    ).toMatchObject({ kind: 'empty', reason: 'noTraces' });
  });

  it('prefers the missing-artifact and missing-window explanations', () => {
    expect(
      powerTimelineStatus({ ...base, hasAnyArtifact: false, fetchedRuns: 0, drawable: false }),
    ).toMatchObject({ kind: 'empty', reason: 'noArtifacts' });
    expect(powerTimelineStatus({ ...base, missingWindows: 2, drawable: false })).toEqual({
      kind: 'empty',
      reason: 'missingWindow',
      missing: 2,
      blocking: true,
    });
  });
});

function shape(lanes: ReturnType<typeof traceLanes>): string[] {
  return lanes.map((lane) => `${lane.kind}:${lane.role}:${lane.rows.join(',')}`);
}

describe('traceLanes', () => {
  const disagg = {
    power: [
      [500, 510],
      [520, 530],
      [300, 310],
      [320, 330],
      [340, 350],
    ],
    devices: [
      { id: 'p/0', role: 'prefill' as const },
      { id: 'p/1', role: 'prefill' as const },
      { id: 'd/0', role: 'decode' as const },
      { id: 'd/1', role: 'decode' as const },
      { id: 'd/2', role: 'decode' as const },
    ],
  };
  const aggregated = { power: [[400], [410]], devices: [{ id: 'g/0' }, { id: 'g/1' }] };

  it('keeps the single all-GPU lane under All GPUs', () => {
    expect(shape(traceLanes(disagg, 'all'))).toEqual(['lane:all:0,1,2,3,4']);
  });

  it('draws only the selected pool under prefill or decode', () => {
    expect(shape(traceLanes(disagg, 'prefill'))).toEqual(['lane:prefill:0,1']);
    expect(shape(traceLanes(disagg, 'decode'))).toEqual(['lane:decode:2,3,4']);
  });

  it('draws both pools in front of a faint all-GPU line under split', () => {
    expect(shape(traceLanes(disagg, 'split'))).toEqual([
      'context:all:0,1,2,3,4',
      'lane:prefill:0,1',
      'lane:decode:2,3,4',
    ]);
  });

  it('keeps an aggregated trace as one dimmed all-GPU lane under every role', () => {
    for (const role of ['prefill', 'decode', 'split'] as const) {
      expect(shape(traceLanes(aggregated, role))).toEqual(['aggregated:all:0,1']);
    }
  });
});

describe('poolSubsetSeries', () => {
  const series = {
    artifact: 'gpu_metrics_x',
    startMs: 0,
    bucketSeconds: 1,
    gpus: [0, 1, 2],
    t: [0, 1],
    power: [
      [100, 110],
      [200, 210],
      [300, 310],
    ],
    devices: [
      { id: 'p/0', role: 'prefill' as const },
      { id: 'd/0', role: 'decode' as const },
      { id: 'd/1', role: 'decode' as const },
    ],
  };

  it('keeps only the rows of the requested pool, buckets unchanged', () => {
    const decode = poolSubsetSeries(series, 'decode')!;
    expect(decode.gpus).toEqual([1, 2]);
    expect(decode.power).toEqual([
      [200, 210],
      [300, 310],
    ]);
    expect(decode.t).toEqual(series.t);
  });

  it('returns null for a trace without that pool', () => {
    expect(poolSubsetSeries({ ...series, devices: undefined }, 'prefill')).toBeNull();
  });
});

describe('role lanes on production-shaped telemetry', () => {
  it('splits a disaggregated GB200 trace into its 16 prefill and 16 decode GPUs', () => {
    const lanes = traceLanes(DISAGG_GB200_C16_SERIES, 'split');
    expect(lanes.map((lane) => [lane.kind, lane.role, lane.rows.length])).toEqual([
      ['context', 'all', 32],
      ['lane', 'prefill', 16],
      ['lane', 'decode', 16],
    ]);
    const decode = poolSubsetSeries(DISAGG_GB200_C16_SERIES, 'decode')!;
    expect(decode.devices!.every((device) => device.role === 'decode')).toBe(true);
    expect(decode.power).toHaveLength(16);
    expect(decode.t).toEqual(DISAGG_GB200_C16_SERIES.t);
  });

  it('keeps an aggregated p1x8_d0x8 trace, whose devices carry no role, as aggregated', () => {
    expect(traceLanes(AGGREGATED_GB200_C1_SERIES, 'split')).toEqual([
      { role: 'all', kind: 'aggregated', rows: Array.from({ length: 16 }, (_, row) => row) },
    ]);
    expect(poolSubsetSeries(AGGREGATED_GB200_C1_SERIES, 'prefill')).toBeNull();
  });
});

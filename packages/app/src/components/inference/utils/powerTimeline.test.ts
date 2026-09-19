import { describe, expect, it } from 'vitest';

import type { GpuPowerSeriesResponse } from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

import {
  allGpuPool,
  consumePowerTraceFocus,
  joinPowerTimeline,
  longestCommonPrefix,
  planPowerTimelineRequests,
  prioritizeRun,
  requestPowerTraceFocus,
  runIdFromUrl,
  telemetryArtifactForPoint,
  telemetrySourceForPoint,
  traceConfigLabel,
  traceKeyForPoint,
  traceKeyRunId,
  tracePools,
  windowPhase,
} from './powerTimeline';

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34716669498';
const NAME_A =
  'qwen3.5_8k1k_fp8_sglang_tp4-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc16_b200-nscale-sl-1c68b810a44c3c71a187';
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

const runInfo: GpuPowerSeriesResponse['runInfo'] = {
  id: 34716669498,
  name: 'Run Sweep',
  branch: 'main',
  sha: 'abc',
  createdAt: '2026-09-12T20:00:00Z',
  url: RUN_URL,
  conclusion: 'success',
  status: 'completed',
};

describe('telemetryArtifactForPoint', () => {
  it('maps the power-audit source to the gpu_metrics artifact of the same RESULT_FILENAME', () => {
    expect(
      telemetryArtifactForPoint({ power_audit: { source: `power_validation_${NAME_A}.json` } }),
    ).toBe(`gpu_metrics_${NAME_A}`);
    // A bundled path still resolves to the bare artifact name.
    expect(
      telemetryArtifactForPoint({
        power_audit: { source: `artifacts/power_validation_${NAME_B}.json` },
      }),
    ).toBe(`gpu_metrics_${NAME_B}`);
  });

  it('returns null without an audit source or with a foreign file name', () => {
    expect(telemetryArtifactForPoint({})).toBeNull();
    expect(telemetryArtifactForPoint({ power_audit: {} })).toBeNull();
    expect(telemetryArtifactForPoint({ power_audit: { source: 'agg_results.json' } })).toBeNull();
  });
});

describe('planPowerTimelineRequests', () => {
  it('groups artifacts per workflow run under their common RESULT_FILENAME prefix', () => {
    const points = [
      point({ power_audit: { source: `power_validation_${NAME_A}.json` } }),
      point({ conc: 1, power_audit: { source: `power_validation_${NAME_B}.json` } }),
      point({
        run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
        power_audit: { source: 'power_validation_dsr1_1k1k_fp8_sglang_conc8_h200-x.json' },
      }),
      // No run URL: nothing to fetch.
      point({ run_url: undefined, power_audit: { source: `power_validation_${NAME_A}.json` } }),
      // No telemetry audit: nothing to fetch.
      point({ conc: 2 }),
    ];
    expect(planPowerTimelineRequests(points)).toEqual([
      {
        runId: '1',
        prefix: 'dsr1_1k1k_fp8_sglang_conc8_h200-x',
        artifacts: ['gpu_metrics_dsr1_1k1k_fp8_sglang_conc8_h200-x'],
      },
      {
        runId: '34716669498',
        prefix: 'qwen3.5_8k1k_fp8_',
        artifacts: [`gpu_metrics_${NAME_B}`, `gpu_metrics_${NAME_A}`],
      },
    ]);
  });

  it('exposes the helpers it is built from', () => {
    expect(runIdFromUrl(RUN_URL)).toBe('34716669498');
    expect(runIdFromUrl('https://example.com')).toBeNull();
    expect(runIdFromUrl(undefined)).toBeNull();
    expect(longestCommonPrefix(['abc_1', 'abc_2', 'abd'])).toBe('ab');
    expect(longestCommonPrefix([])).toBe('');
    expect(longestCommonPrefix(['solo'])).toBe('solo');
  });
});

describe('joinPowerTimeline', () => {
  const response: GpuPowerSeriesResponse = {
    runInfo,
    series: [
      {
        artifact: `gpu_metrics_${NAME_A}`,
        startMs: Date.UTC(2026, 8, 12, 20, 19, 57),
        bucketSeconds: 1,
        gpus: [0, 1],
        t: [0, 1, 2],
        power: [
          [190, 700, 710],
          [188, 690, null],
        ],
      },
    ],
  };

  it('attaches the fetched series and the audit window, and reports the rest as missing', () => {
    const matched = point({
      power_audit: {
        source: `power_validation_${NAME_A}.json`,
        window_start_unix: 1789244883.149,
        window_end_unix: 1789244982.413,
      },
    });
    const unmatched = point({
      conc: 1,
      disagg: true,
      power_audit: { source: `power_validation_${NAME_B}.json` },
    });
    const noAudit = point({ conc: 2 });
    const { traces, missing } = joinPowerTimeline(
      [matched, unmatched, noAudit],
      new Map([['34716669498', response]]),
    );
    expect(traces).toHaveLength(1);
    expect(traces[0].key).toBe(`34716669498:${NAME_A}`);
    expect(traces[0].series).toBe(response.series[0]);
    expect(traces[0].windowStartMs).toBeCloseTo(1789244883149, 0);
    expect(traces[0].windowEndMs).toBeCloseTo(1789244982413, 0);
    expect(missing).toEqual([
      { point: unmatched, reason: 'not-in-run' },
      { point: noAudit, reason: 'no-source' },
    ]);
    // A run that was never loaded is reported as such, not as a missing artifact.
    expect(joinPowerTimeline([matched], new Map()).missing).toEqual([
      { point: matched, reason: 'run-not-fetched' },
    ]);
    expect(
      joinPowerTimeline(
        [point({ run_url: undefined, power_audit: matched.power_audit })],
        new Map(),
      ).missing[0].reason,
    ).toBe('no-run');

    expect(windowPhase(traces[0], 1789244883149 - 1)).toBe('before');
    expect(windowPhase(traces[0], 1789244883149)).toBe('window');
    expect(windowPhase(traces[0], 1789244982413 + 1)).toBe('after');
    expect(traceConfigLabel(matched)).toBe('TP4 · c16');
    expect(traceConfigLabel(unmatched)).toBe('PD · TP4 · c1');
  });

  it('treats a trace without a recorded window as unknown rather than emphasised', () => {
    const noWindow = point({ power_audit: { source: `power_validation_${NAME_A}.json` } });
    const { traces } = joinPowerTimeline([noWindow], new Map([['34716669498', response]]));
    expect(traces[0].windowStartMs).toBeNull();
    expect(windowPhase(traces[0], response.series[0].startMs)).toBe('unknown');
  });
});

describe('trace identity helpers', () => {
  it('names the validation file and the run-scoped trace key of a point', () => {
    const audited = point({ power_audit: { source: `power_validation_${NAME_A}.json` } });
    expect(telemetrySourceForPoint(audited)).toBe(`power_validation_${NAME_A}.json`);
    // A path prefix is dropped: bundle-cut series carry the basename.
    expect(
      telemetrySourceForPoint({
        power_audit: { source: `nested/power_validation_${NAME_B}.json` },
      }),
    ).toBe(`power_validation_${NAME_B}.json`);
    expect(traceKeyForPoint(audited)).toBe(`34716669498:${NAME_A}`);
  });

  it('has no key without a run or an audit source', () => {
    expect(traceKeyForPoint(point({ run_url: undefined, power_audit: { source: 'x.json' } }))).toBe(
      null,
    );
    expect(traceKeyForPoint(point({ power_audit: { source: 'agg_results.json' } }))).toBeNull();
    expect(telemetrySourceForPoint({})).toBeNull();
  });
});

describe('joinPowerTimeline with bundle-cut series', () => {
  const bundleSource = `power_validation_${NAME_B}.json`;
  const artifactSeries: GpuPowerSeriesResponse['series'][number] = {
    artifact: `gpu_metrics_${NAME_B}`,
    startMs: 1,
    bucketSeconds: 1,
    gpus: [0],
    t: [0],
    power: [[1]],
  };
  const bundleSeries: GpuPowerSeriesResponse['series'][number] = {
    artifact: 'power_audit_qwen3.5_8k1k_fp8_dynamo-sglang_prefill-tp4-5b35252b29d80b104d11',
    source: bundleSource,
    startMs: 2,
    bucketSeconds: 1,
    gpus: [0, 1],
    t: [0],
    power: [[2], [3]],
    devices: [
      { id: 'watchtower-navy-cn01/GPU-aaa', role: 'prefill' },
      { id: 'watchtower-navy-cn01/GPU-bbb', role: 'decode' },
    ],
  };
  const disagg = point({ conc: 1, disagg: true, power_audit: { source: bundleSource } });

  it('matches a series by its validation-file source', () => {
    const { traces, missing } = joinPowerTimeline(
      [disagg],
      new Map([['34716669498', { runInfo, series: [bundleSeries] }]]),
    );
    expect(missing).toEqual([]);
    expect(traces[0].series).toBe(bundleSeries);
    expect(traces[0].key).toBe(`34716669498:${NAME_B}`);
  });

  it('prefers the source match over a gpu_metrics artifact of the same name', () => {
    const { traces } = joinPowerTimeline(
      [disagg],
      new Map([['34716669498', { runInfo, series: [artifactSeries, bundleSeries] }]]),
    );
    expect(traces[0].series).toBe(bundleSeries);
  });

  it('never joins a source-labelled series through its bundle artifact name', () => {
    const foreign = { ...bundleSeries, source: 'power_validation_other_conc4.json' };
    const { traces, missing } = joinPowerTimeline(
      [disagg],
      new Map([['34716669498', { runInfo, series: [foreign] }]]),
    );
    expect(traces).toEqual([]);
    expect(missing).toEqual([{ point: disagg, reason: 'not-in-run' }]);
  });
});

describe('worker-role pools', () => {
  it('groups rows by role in prefill, decode order regardless of device order', () => {
    const pools = tracePools({
      power: [[1], [2], [3], [4], [5]],
      devices: [
        { id: 'h/GPU-0', role: 'decode' },
        { id: 'h/GPU-1', role: 'prefill' },
        { id: 'h/GPU-2', role: 'decode' },
        // An unassigned device belongs to no pool.
        { id: 'h/GPU-3' },
        { id: 'h/GPU-4', role: 'prefill' },
      ],
    });
    expect(pools).toEqual([
      { role: 'prefill', rows: [1, 4] },
      { role: 'decode', rows: [0, 2] },
    ]);
  });

  it('yields only the roles present and nothing without roles', () => {
    expect(
      tracePools({
        power: [[1], [2]],
        devices: [
          { id: 'a', role: 'decode' },
          { id: 'b', role: 'decode' },
        ],
      }),
    ).toEqual([{ role: 'decode', rows: [0, 1] }]);
    expect(tracePools({ power: [[1], [2]], devices: [{ id: '0' }, { id: '1' }] })).toEqual([]);
    expect(tracePools({ power: [[1], [2]] })).toEqual([]);
    expect(tracePools({ power: [] })).toEqual([]);
  });

  it('folds every row into the all-GPU pool', () => {
    expect(allGpuPool({ power: [[1], [2], [3]] })).toEqual({ role: 'all', rows: [0, 1, 2] });
    expect(allGpuPool({ power: [] })).toEqual({ role: 'all', rows: [] });
  });
});

describe('power trace focus handoff', () => {
  it('hands the requested key to exactly one consumer', () => {
    expect(consumePowerTraceFocus()).toBeNull();
    requestPowerTraceFocus('34716669498:conc16');
    expect(consumePowerTraceFocus()).toBe('34716669498:conc16');
    expect(consumePowerTraceFocus()).toBeNull();
  });

  it('keeps only the latest request', () => {
    requestPowerTraceFocus('first');
    requestPowerTraceFocus('second');
    expect(consumePowerTraceFocus()).toBe('second');
    expect(consumePowerTraceFocus()).toBeNull();
  });
});

describe('prioritizeRun', () => {
  const requests = ['1', '2', '3', '4', '5'].map((runId) => ({
    runId,
    prefix: '',
    artifacts: [],
  }));

  it('moves the deep-linked run to the front and keeps the rest in order', () => {
    expect(prioritizeRun(requests, '5').map((request) => request.runId)).toEqual([
      '5',
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(prioritizeRun(requests, '3').map((request) => request.runId)).toEqual([
      '3',
      '1',
      '2',
      '4',
      '5',
    ]);
  });

  it('returns the same array when the run is first, unknown or absent', () => {
    expect(prioritizeRun(requests, '1')).toBe(requests);
    expect(prioritizeRun(requests, '9')).toBe(requests);
    expect(prioritizeRun(requests, null)).toBe(requests);
    expect(traceKeyRunId('34716669498:qwen_conc8')).toBe('34716669498');
    expect(traceKeyRunId(null)).toBeNull();
    expect(traceKeyRunId('')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import type { GpuPowerSeriesResponse } from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';

import {
  joinPowerTimeline,
  longestCommonPrefix,
  planPowerTimelineRequests,
  runIdFromUrl,
  telemetryArtifactForPoint,
  traceConfigLabel,
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
    expect(traces[0].key).toBe(`34716669498:gpu_metrics_${NAME_A}`);
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

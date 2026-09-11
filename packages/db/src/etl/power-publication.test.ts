import { describe, expect, it } from 'vitest';
import { mapBenchmarkRow } from './benchmark-mapper';
import { createSkipTracker } from './skip-tracker';
import {
  powerPublicationPoint,
  verifyPowerPublication,
  type PublishedPowerRow,
} from './power-publication';

const raw = {
  infmax_model_prefix: 'qwen3.5',
  hw: 'b200',
  framework: 'sglang',
  precision: 'fp8',
  isl: 8192,
  osl: 1024,
  conc: 32,
  tp: 4,
  ep: 1,
  dp_attention: false,
  avg_power_w: 642,
  power_valid: 1,
  power_metric_schema_version: 2,
  joules_per_successful_query: 1200,
  power_audit: {
    window_start_unix: 100,
    window_end_unix: 120,
    observed_gpu_count: 4,
    source: 'power_validation.json',
  },
};
function expected(overrides = {}) {
  const row = mapBenchmarkRow({ ...raw, ...overrides }, createSkipTracker());
  if (!row) throw new Error('Fixture must map');
  const point = powerPublicationPoint(
    row,
    'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123/attempts/2',
    { path: 'bmk_qwen3.5/results.json', sha256: 'abc' },
  );
  if (!point) throw new Error('Fixture must be 8K/1K');
  return point;
}
function actual(point = expected()): PublishedPowerRow {
  return {
    ...point.identity,
    metrics: { ...point.metrics, tput_per_gpu: 400 },
    workers: point.workers,
    power_invalid_reasons: point.power_invalid_reasons,
    power_audit: point.power_audit,
  };
}

describe('PowerX publication', () => {
  it('matches the exact ordinary source and attempt through mapping, while ignoring unrelated performance metrics', () => {
    const point = expected();
    expect(verifyPowerPublication([point], [actual(point)], 'API')).toEqual([]);
    expect(point.power_audit).toMatchObject({
      source: 'power_validation.json',
      observed_gpu_count: 4,
    });
  });
  it('fails missing points, stale attempts and duplicate identities', () => {
    const point = expected();
    expect(verifyPowerPublication([point], [], 'DB')[0]).toContain('found 0');
    expect(
      verifyPowerPublication(
        [point],
        [
          {
            ...actual(),
            run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123/attempts/1',
          },
        ],
        'API',
      )[0],
    ).toContain('found 0');
    expect(verifyPowerPublication([point], [actual(), actual()], 'API')[0]).toContain('found 2');
  });
  it('fails altered watts and audit provenance, including a newer performance point with older power', () => {
    const row = actual();
    row.metrics.avg_power_w = 650;
    expect(verifyPowerPublication([expected()], [row], 'API')).toContainEqual(
      expect.stringContaining('avg_power_w expected 642, got 650'),
    );
    expect(
      verifyPowerPublication([expected()], [{ ...actual(), power_audit: null }], 'API'),
    ).toContainEqual(expect.stringContaining('power_audit differs'));
    expect(
      verifyPowerPublication(
        [expected()],
        [{ ...actual(), recipe_fingerprint: 'different' }],
        'API',
      )[0],
    ).toContain('found 0');
  });
  it('preserves invalid diagnostics and rejects leaked invalid watts', () => {
    const point = expected({ power_valid: 0, power_invalid_reasons: ['sampling_gap_exceeded'] });
    expect(point.metrics).not.toHaveProperty('avg_power_w');
    expect(verifyPowerPublication([point], [actual(point)], 'API')).toEqual([]);
    const row = actual(point);
    row.metrics.avg_power_w = 642;
    expect(verifyPowerPublication([point], [row], 'API')[0]).toContain('expected absent, got 642');
  });
  it('rejects failed-client artifacts as performance points', () => {
    const tracker = createSkipTracker();
    expect(
      mapBenchmarkRow({ ...raw, benchmark_outcome: { status: 'failed' } }, tracker),
    ).toBeNull();
    expect(tracker.skips.failedRun).toBe(1);
  });
});

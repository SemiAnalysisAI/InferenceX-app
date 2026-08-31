import { describe, expect, it } from 'vitest';

import {
  hasPowerContent,
  mergeArtifactPower,
  powerFromAggRow,
  powerFromValidationSidecar,
  selectValidationEntry,
  siblingArtifactNames,
} from './power-audit-artifacts';

describe('siblingArtifactNames', () => {
  it('derives bmk, bmk_agentic, and power_audit siblings from the suffix', () => {
    expect(siblingArtifactNames('gpu_metrics_dsr1_1k8k_fp8_sglang_tp8_h200-nb_0')).toEqual({
      bmk: 'bmk_dsr1_1k8k_fp8_sglang_tp8_h200-nb_0',
      bmkAgentic: 'bmk_agentic_dsr1_1k8k_fp8_sglang_tp8_h200-nb_0',
      powerAudit: 'power_audit_dsr1_1k8k_fp8_sglang_tp8_h200-nb_0',
    });
  });

  it('returns null for names without the gpu_metrics_ prefix', () => {
    expect(siblingArtifactNames('eval_gpu_metrics_dsr1')).toBeNull();
    expect(siblingArtifactNames('bmk_dsr1')).toBeNull();
    expect(siblingArtifactNames('gpu_metricsdsr1')).toBeNull();
  });

  it('returns null for a bare prefix with empty suffix', () => {
    expect(siblingArtifactNames('gpu_metrics_')).toBeNull();
  });
});

describe('powerFromAggRow', () => {
  it('maps a legacy agg row to published values + verdict only', () => {
    const result = powerFromAggRow({
      power_valid: 1,
      power_metric_schema_version: 1,
      avg_power_w: 412.5,
      avg_total_gpu_power_w: 3300,
      other_metric: 42,
    });
    expect(result.power_valid).toBe(1);
    expect(result.published).toEqual({
      avg_power_w: 412.5,
      avg_total_gpu_power_w: 3300,
      power_metric_schema_version: 1,
      source: 'bmk_artifact',
    });
    expect(result.window).toBeUndefined();
    expect(result.producer_sha).toBeUndefined();
  });

  it('coerces power_valid variants', () => {
    expect(powerFromAggRow({ power_valid: '1' }).power_valid).toBe(1);
    expect(powerFromAggRow({ power_valid: 0 }).power_valid).toBe(0);
    expect(powerFromAggRow({ power_valid: false }).power_valid).toBe(0);
    expect(powerFromAggRow({}).power_valid).toBeUndefined();
    expect(powerFromAggRow({ power_valid: null }).power_valid).toBeUndefined();
  });

  it('maps power_invalid_reasons when present', () => {
    expect(
      powerFromAggRow({ power_valid: 0, power_invalid_reasons: ['sampling_gap_exceeded'] }).reasons,
    ).toEqual(['sampling_gap_exceeded']);
    expect(powerFromAggRow({ power_valid: 1 }).reasons).toBeUndefined();
  });

  it('maps an embedded power_audit object through to window and provenance', () => {
    const result = powerFromAggRow(
      {
        power_valid: 1,
        avg_power_w: 400,
        power_audit: {
          window_start_unix: 1_755_000_020,
          window_end_unix: 1_755_000_080,
          expected_gpu_count: 8,
          observed_gpu_count: 8,
          sample_count: 480,
          max_sample_gap_s: 1.2,
          producer_sha: 'abc123def456',
          exporter_image_sha256: 'sha256:deadbeef',
        },
      },
      'power_audit_agg',
    );
    expect(result.window).toEqual({ start_unix: 1_755_000_020, end_unix: 1_755_000_080 });
    expect(result.expected_gpu_count).toBe(8);
    expect(result.observed_gpu_count).toBe(8);
    expect(result.producer_sha).toBe('abc123def456');
    expect(result.exporter_image_sha256).toBe('sha256:deadbeef');
    expect(result.published?.source).toBe('power_audit_agg');
  });

  it('tolerates a malformed power_audit object', () => {
    const result = powerFromAggRow({
      power_valid: 1,
      power_audit: { window_start_unix: 'not-a-number', window_end_unix: 5 },
    });
    expect(result.window).toBeUndefined();
  });

  it('returns an empty partial for a row with no power fields', () => {
    expect(powerFromAggRow({ output_toks_per_sec: 1000 })).toEqual({});
  });

  it('rejects implausible window epochs (garbage, ms-scale, non-positive)', () => {
    // 1e16 s → new Date(1e19 ms) would throw RangeError in the client render.
    expect(
      powerFromAggRow({
        power_audit: { window_start_unix: 1e16, window_end_unix: 1e16 + 60 },
      }).window,
    ).toBeUndefined();
    expect(
      powerFromAggRow({
        power_audit: { window_start_unix: 1_755_000_020_000, window_end_unix: 1_755_000_080_000 },
      }).window,
    ).toBeUndefined();
    expect(
      powerFromAggRow({
        power_audit: { window_start_unix: -5, window_end_unix: 1_755_000_080 },
      }).window,
    ).toBeUndefined();
  });
});

describe('powerFromValidationSidecar', () => {
  const singleNodeSidecar = {
    schema_version: 1,
    power_valid: true,
    reasons: [],
    benchmark_window: {
      start_time_unix: 1_755_000_020,
      end_time_unix: 1_755_000_080,
      reported_duration_s: 60,
    },
    expected_gpu_count: 8,
    observed_gpu_count: 8,
    metrics: { avg_power_w: 401.25, avg_total_gpu_power_w: 3210, total_gpu_energy_j: 192_600 },
  };

  it('maps a single-node sidecar (benchmark_window)', () => {
    const result = powerFromValidationSidecar(singleNodeSidecar);
    expect(result.power_valid).toBe(1);
    expect(result.window).toEqual({ start_unix: 1_755_000_020, end_unix: 1_755_000_080 });
    expect(result.expected_gpu_count).toBe(8);
    expect(result.observed_gpu_count).toBe(8);
    expect(result.published).toEqual({
      avg_power_w: 401.25,
      avg_total_gpu_power_w: 3210,
      // The sidecar's own schema_version is a different versioning axis than
      // the agg row's power_metric_schema_version — never mapped through.
      power_metric_schema_version: null,
      source: 'validation_metrics',
    });
  });

  it('rejects implausible window epochs in the sidecar', () => {
    expect(
      powerFromValidationSidecar({
        benchmark_window: { start_time_unix: 1_755_000_020_000, end_time_unix: 1_755_000_080_000 },
      }).window,
    ).toBeUndefined();
  });

  it('maps an invalid verdict with reasons', () => {
    const result = powerFromValidationSidecar({
      power_valid: false,
      reasons: ['benchmark_window_not_bracketed', 'sampling_gap_exceeded'],
    });
    expect(result.power_valid).toBe(0);
    expect(result.reasons).toEqual(['benchmark_window_not_bracketed', 'sampling_gap_exceeded']);
    expect(result.window).toBeUndefined();
  });

  it('maps a multinode sidecar (selected_window + producer)', () => {
    const result = powerFromValidationSidecar({
      schema_version: 1,
      power_valid: true,
      reasons: [],
      benchmark_window: null,
      selected_window: {
        window_file: 'windows/w0.json',
        start_time_unix: 1_755_000_100,
        end_time_unix: 1_755_000_400,
        duration: 300,
      },
      producer: {
        producer_git_commit: 'fedcba987654',
        exporter_image_sha256: 'sha256:cafebabe',
      },
      expected_gpu_count: 16,
      observed_gpu_count: 16,
      metrics: { avg_power_w: 512.75 },
    });
    expect(result.window).toEqual({ start_unix: 1_755_000_100, end_unix: 1_755_000_400 });
    expect(result.producer_sha).toBe('fedcba987654');
    expect(result.exporter_image_sha256).toBe('sha256:cafebabe');
  });

  it('prefers benchmark_window over selected_window when both are present', () => {
    const result = powerFromValidationSidecar({
      power_valid: true,
      benchmark_window: { start_time_unix: 10, end_time_unix: 20 },
      selected_window: { start_time_unix: 30, end_time_unix: 40 },
    });
    expect(result.window).toEqual({ start_unix: 10, end_unix: 20 });
  });
});

describe('selectValidationEntry', () => {
  const suffix = 'dsr1_1k8k_fp8_sglang_tp8_h200-nb_0';

  it('picks the single power_validation entry', () => {
    const sidecar = { power_valid: true };
    expect(
      selectValidationEntry(
        [
          { entryName: `power_validation_${suffix}.json`, json: sidecar },
          { entryName: `agg_${suffix}.json`, json: { avg_power_w: 1 } },
          { entryName: `${suffix}.json`, json: {} },
        ],
        suffix,
      ),
    ).toBe(sidecar);
  });

  it('matches agentic results/power_validation.json by basename', () => {
    const sidecar = { power_valid: true };
    expect(
      selectValidationEntry(
        [{ entryName: 'results/power_validation.json', json: sidecar }],
        suffix,
      ),
    ).toBe(sidecar);
  });

  it('resolves multinode ambiguity via the benchmark_result stem', () => {
    const match = { power_valid: true, benchmark_result: `/workspace/results/${suffix}.json` };
    const other = { power_valid: true, benchmark_result: '/workspace/results/other_config.json' };
    expect(
      selectValidationEntry(
        [
          { entryName: `power_validation_${suffix}_node0.json`, json: other },
          { entryName: `power_validation_${suffix}_node1.json`, json: match },
        ],
        suffix,
      ),
    ).toBe(match);
  });

  it('returns null when several entries exist and none matches the suffix', () => {
    expect(
      selectValidationEntry(
        [
          { entryName: 'power_validation_a.json', json: { benchmark_result: '/r/a.json' } },
          { entryName: 'power_validation_b.json', json: { benchmark_result: '/r/b.json' } },
        ],
        suffix,
      ),
    ).toBeNull();
  });

  it('returns null when no power_validation entries exist', () => {
    expect(
      selectValidationEntry([{ entryName: `agg_${suffix}.json`, json: {} }], suffix),
    ).toBeNull();
  });
});

describe('hasPowerContent', () => {
  it('distinguishes empty partials from ones carrying a power field', () => {
    expect(hasPowerContent(null)).toBe(false);
    expect(hasPowerContent({})).toBe(false);
    expect(hasPowerContent({ power_valid: 1 })).toBe(true);
    expect(hasPowerContent(powerFromAggRow({ output_toks_per_sec: 1000 }))).toBe(false);
  });
});

describe('mergeArtifactPower', () => {
  it('returns null when both inputs are null or empty', () => {
    expect(mergeArtifactPower(null, null, [])).toBeNull();
    expect(mergeArtifactPower({}, {}, ['bmk_x'])).toBeNull();
  });

  it('sidecar wins for window/reasons/counts, agg wins for published', () => {
    const merged = mergeArtifactPower(
      {
        power_valid: 1,
        published: {
          avg_power_w: 402,
          avg_total_gpu_power_w: 3216,
          power_metric_schema_version: 1,
          source: 'bmk_artifact',
        },
        window: { start_unix: 1, end_unix: 2 },
      },
      {
        power_valid: 0,
        reasons: ['sampling_gap_exceeded'],
        window: { start_unix: 10, end_unix: 20 },
        expected_gpu_count: 8,
        observed_gpu_count: 7,
        published: {
          avg_power_w: 400,
          avg_total_gpu_power_w: null,
          power_metric_schema_version: 1,
          source: 'validation_metrics',
        },
        producer_sha: 'sidecar-sha',
      },
      ['bmk_x', 'power_audit_x'],
    );
    expect(merged).toEqual({
      power_valid: 0,
      reasons: ['sampling_gap_exceeded'],
      window: { start_unix: 10, end_unix: 20 },
      expected_gpu_count: 8,
      observed_gpu_count: 7,
      published: {
        avg_power_w: 402,
        avg_total_gpu_power_w: 3216,
        power_metric_schema_version: 1,
        source: 'bmk_artifact',
      },
      producer_sha: 'sidecar-sha',
      exporter_image_sha256: null,
      sources: ['bmk_x', 'power_audit_x'],
    });
  });

  it('fills every missing field with null/[] defaults from a lone agg row', () => {
    const merged = mergeArtifactPower({ power_valid: 1 }, null, ['bmk_x']);
    expect(merged).toEqual({
      power_valid: 1,
      reasons: [],
      window: null,
      expected_gpu_count: null,
      observed_gpu_count: null,
      published: null,
      producer_sha: null,
      exporter_image_sha256: null,
      sources: ['bmk_x'],
    });
  });

  it('falls back to sidecar published when the agg row has none', () => {
    const merged = mergeArtifactPower(
      { power_valid: 1 },
      {
        published: {
          avg_power_w: 399,
          avg_total_gpu_power_w: null,
          power_metric_schema_version: 1,
          source: 'validation_metrics',
        },
      },
      ['power_audit_x'],
    );
    expect(merged?.published?.source).toBe('validation_metrics');
    expect(merged?.published?.avg_power_w).toBe(399);
  });
});

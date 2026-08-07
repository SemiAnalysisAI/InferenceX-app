import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  fullResponseItlSample,
  fullResponseMetricsFromGzip,
  fullResponseMetricsFromProfile,
  preferFullResponseMetrics,
} from './full-response-interactivity';

function profileRecord(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    metadata: {
      benchmark_phase: 'profiling',
      request_start_ns: 1_000_000_000,
      request_end_ns: 146_861_451_000,
    },
    metrics: {
      output_sequence_length: { value: 26_571, unit: 'tokens' },
      time_to_first_token: { value: 529.058811, unit: 'ms' },
      // This is the legacy mixed-domain value that must not be reused.
      inter_token_latency: { value: 0.003067398, unit: 'ms' },
    },
    ...overrides,
  });
}

describe('fullResponseItlSample', () => {
  it('reconstructs the full-response ITL instead of reusing legacy visible-content ITL', () => {
    const record = JSON.parse(profileRecord());
    const expected = (145.861451 - 0.529058811) / (26_571 - 1);

    const itl = fullResponseItlSample(record);

    expect(itl).toBeCloseTo(expected, 12);
    expect(1 / itl!).toBeCloseTo(182.827, 2);
    expect(1 / itl!).toBeLessThan(1_000);
  });

  it('prefers an explicit full-response metric and respects its unit', () => {
    const record = JSON.parse(
      profileRecord({
        metrics: {
          output_sequence_length: { value: 10, unit: 'tokens' },
          full_response_inter_token_latency: { value: 5_500, unit: 'us' },
          full_decode_duration: { value: 100, unit: 's' },
        },
      }),
    );

    expect(fullResponseItlSample(record)).toBeCloseTo(0.0055, 12);
  });
});

describe('fullResponseMetricsFromProfile', () => {
  it('skips warmup, failed, malformed, and one-token records', () => {
    const valid = profileRecord({
      metrics: {
        output_sequence_length: { value: 3, unit: 'tokens' },
        full_decode_duration: { value: 20, unit: 'ms' },
      },
    });
    const warmup = profileRecord({
      metadata: { benchmark_phase: 'warmup' },
      metrics: {
        output_sequence_length: { value: 3, unit: 'tokens' },
        full_decode_duration: { value: 2, unit: 'ms' },
      },
    });
    const failed = profileRecord({ error: 'server error' });
    const oneToken = profileRecord({
      metrics: {
        output_sequence_length: { value: 1, unit: 'tokens' },
        full_decode_duration: { value: 2, unit: 'ms' },
      },
    });

    const metrics = fullResponseMetricsFromProfile(
      [valid, warmup, failed, oneToken, '{invalid-json'].join('\n'),
    );

    expect(metrics.median_full_response_itl).toBeCloseTo(0.01, 12);
    expect(metrics.median_itl).toBeCloseTo(0.01, 12);
    expect(metrics.median_intvty).toBeCloseTo(100, 12);
  });

  it('reads compressed profile artifacts', () => {
    const metrics = fullResponseMetricsFromGzip(gzipSync(profileRecord()));
    expect(metrics.median_full_response_intvty).toBeCloseTo(182.827, 2);
  });
});

describe('preferFullResponseMetrics', () => {
  it('replaces canonical values and removes unmatched legacy percentiles', () => {
    const metrics = preferFullResponseMetrics({
      median_itl: 0.000003,
      median_intvty: 333_333,
      p99_itl: 0.2,
      p99_intvty: 5,
      median_full_response_itl: 0.005,
      median_full_response_intvty: 200,
    });

    expect(metrics.median_itl).toBe(0.005);
    expect(metrics.median_intvty).toBe(200);
    expect(metrics).not.toHaveProperty('p99_itl');
    expect(metrics).not.toHaveProperty('p99_intvty');
  });
});

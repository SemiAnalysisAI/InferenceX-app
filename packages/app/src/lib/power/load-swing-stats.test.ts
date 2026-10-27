import { describe, expect, it } from 'vitest';

import type { GpuPowerSeries } from '@/components/gpu-power/power-series';

import { computeLoadSwingStats, loadSwingStatsFromSeries, quantile } from './load-swing-stats';

// 20 one-second samples: 100 W idle for 5 s, a ramp to 500 W, serving at 500±20 W, a drop.
const samples = [
  100, 100, 100, 110, 100, 300, 500, 520, 480, 500, 520, 480, 500, 500, 520, 480, 500, 300, 150,
  100,
];
const times = samples.map((_, i) => i);
const input = {
  samples,
  times,
  intervalSeconds: 1,
  windowStartSeconds: 7,
  windowEndSeconds: 16,
};

describe('computeLoadSwingStats', () => {
  it('computes peak, min, idle floor, window mean and percentiles from a known trace', () => {
    const stats = computeLoadSwingStats(input)!;
    expect(stats.unit).toBe('W per GPU');
    expect(stats.sampleCount).toBe(20);
    expect(stats.peak).toBe(520);
    expect(stats.min).toBe(100);
    // Idle floor: P5 of the five pre-serving samples (100, 100, 100, 110, 100, 300, 500).
    expect(stats.preServingSampleCount).toBe(7);
    expect(stats.idleFloor).toBe(100);
    // Window = samples 7..16 (ten values).
    expect(stats.windowSampleCount).toBe(10);
    expect(stats.mean).toBeCloseTo(500, 9);
    expect(stats.p5).toBe(480);
    expect(stats.p95).toBe(520);
    expect(stats.volatility).toBeCloseTo(Math.sqrt(2400 / 10) / 500, 9);
    expect(stats.gapCount).toBe(0);
  });

  it('measures the largest 1 s and 5 s changes and ramp rates over the whole run', () => {
    const stats = computeLoadSwingStats(input)!;
    // 300 → 500 between samples 5 and 6 is the largest one-second step.
    expect(stats.maxDelta1s).toBe(200);
    // Samples 2 (100) → 7 (520): +420 over 5 s.
    expect(stats.maxDelta5s).toBe(420);
    expect(stats.rampUpPerSecond).toBeCloseTo(84, 9);
    // Samples 14 (520) → 19 (100): −420 over 5 s.
    expect(stats.rampDownPerSecond).toBeCloseTo(84, 9);
  });

  it('never reads a delta across a telemetry gap and counts the gap', () => {
    // Sample 6 is raised to 700 so the step across the gap (300 → 700) would be the largest.
    const gapped = {
      ...input,
      samples: samples.map((v, i) => (i === 6 ? 700 : v)),
      times: times.map((t) => (t >= 6 ? t + 3 : t)),
    };
    const stats = computeLoadSwingStats(gapped)!;
    expect(stats.gapCount).toBe(1);
    // The 300 → 700 step now spans 4 s and is skipped; the next largest step is 200 (100 → 300).
    expect(stats.maxDelta1s).toBe(200);
    // Window bounds move with the samples; stats stay defined.
    expect(
      computeLoadSwingStats({ ...gapped, windowStartSeconds: 10, windowEndSeconds: 19 })!
        .windowSampleCount,
    ).toBe(10);
  });

  it('leaves window-only figures null without a recorded window and ignores null buckets', () => {
    const stats = computeLoadSwingStats({
      ...input,
      samples: samples.map((v, i) => (i === 3 ? null : v)),
      windowStartSeconds: null,
      windowEndSeconds: null,
    })!;
    expect(stats.sampleCount).toBe(19);
    expect(stats.mean).toBeNull();
    expect(stats.p5).toBeNull();
    expect(stats.p95).toBeNull();
    expect(stats.volatility).toBeNull();
    expect(stats.idleFloor).toBeNull();
    expect(stats.peak).toBe(520);
    expect(computeLoadSwingStats({ ...input, samples: [null, null], times: [0, 1] })).toBeNull();
  });

  it('interpolates quantiles like the mock and the summary table', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.95)).toBe(5);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('loadSwingStatsFromSeries', () => {
  const series: GpuPowerSeries = {
    artifact: 'gpu_metrics_test',
    startMs: 1_700_000_000_000,
    bucketSeconds: 1,
    gpus: [0, 1],
    t: times,
    // Two GPUs: one at the trace, one 20 W lower, so the per-GPU mean is 10 W under the trace.
    power: [samples, samples.map((v) => v - 20)],
  };
  const windowStartMs = series.startMs + 7000;
  const windowEndMs = series.startMs + 16000;

  it('uses the per-GPU mean of each bucket and the recorded window', () => {
    const stats = loadSwingStatsFromSeries(series, windowStartMs, windowEndMs)!;
    expect(stats.peak).toBe(510);
    expect(stats.mean).toBeCloseTo(490, 9);
    expect(stats.idleFloor).toBe(90);
    expect(stats.maxDelta5s).toBe(420);
  });
});

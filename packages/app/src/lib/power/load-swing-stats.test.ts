import { describe, expect, it } from 'bun:test';

import type { GpuPowerSeries } from '@/components/gpu-power/power-series';

import {
  computeLoadSwingStats,
  loadSwingStatsFromSeries,
  loadSwingTraceRows,
  quantile,
} from './load-swing-stats';

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

/** Whole-run statistics of a trace without a recorded serving window. */
const trace = (values: number[], t: number[], intervalSeconds = 1) =>
  computeLoadSwingStats({
    samples: values,
    times: t,
    intervalSeconds,
    windowStartSeconds: null,
    windowEndSeconds: null,
  })!;

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

  it('uses the recorded sample interval, and one second when none is recorded', () => {
    const values = [100, 120, 140, 160];
    expect(trace(values, [0, 2, 4, 6], 2)).toMatchObject({
      sampleIntervalSeconds: 2,
      gapCount: 0,
      maxDelta1s: 20,
    });
    expect(trace(values, [0, 0.5, 1, 1.5], 0.5)).toMatchObject({
      sampleIntervalSeconds: 0.5,
      gapCount: 0,
      maxDelta1s: 20,
    });
    expect(trace(values, [0, 2, 4, 6], 0)).toMatchObject({
      sampleIntervalSeconds: 1,
      gapCount: 3,
      maxDelta1s: 0,
    });
  });

  it('treats a step of exactly 1.5 intervals as contiguous and a longer one as a gap', () => {
    expect(trace([100, 130, 170], [0, 1.5, 3.5])).toMatchObject({ gapCount: 1, maxDelta1s: 30 });
  });

  it('reads a 5 s change across at most 6.5 s, as rises and falls separately', () => {
    expect(trace([100, 230], [0, 6.5])).toMatchObject({
      maxDelta5s: 130,
      rampUpPerSecond: 20,
      rampDownPerSecond: 0,
    });
    expect(trace([300, 170], [0, 6.5])).toMatchObject({
      maxDelta5s: 130,
      rampUpPerSecond: 0,
      rampDownPerSecond: 20,
    });
    expect(trace([100, 240], [0, 7])).toMatchObject({
      maxDelta5s: 0,
      rampUpPerSecond: 0,
      rampDownPerSecond: 0,
    });
  });

  it('skips non-finite samples and times, and reads samples in time order', () => {
    const reversed = [...samples.keys()].toReversed();
    expect(
      computeLoadSwingStats({
        ...input,
        samples: reversed.map((i) => samples[i]),
        times: reversed.map((i) => times[i]),
      }),
    ).toEqual(computeLoadSwingStats(input));
    expect(
      computeLoadSwingStats({
        ...input,
        samples: [...samples, Number.NaN, Infinity, 900],
        times: [...times, 20, 21, Number.NaN],
      }),
    ).toEqual(computeLoadSwingStats(input));
  });

  it('needs a window that ends after it starts', () => {
    expect(
      computeLoadSwingStats({ ...input, windowStartSeconds: 7, windowEndSeconds: 7 }),
    ).toMatchObject({
      windowSampleCount: 0,
      preServingSampleCount: 0,
      mean: null,
      idleFloor: null,
    });
  });

  it('reads a one-sample window, and has no volatility around a zero mean', () => {
    expect(
      computeLoadSwingStats({ ...input, windowStartSeconds: 6.5, windowEndSeconds: 7.5 }),
    ).toMatchObject({ windowSampleCount: 1, mean: 520, volatility: 0 });
    const window = { intervalSeconds: 1, windowStartSeconds: 0, windowEndSeconds: 2 };
    const idle = computeLoadSwingStats({ ...window, samples: [0, 0, 0], times: [0, 1, 2] })!;
    expect(idle.mean).toBe(0);
    expect(idle.volatility).toBeNull();
    const low = computeLoadSwingStats({ ...window, samples: [0.25, 0.75], times: [0, 1] })!;
    expect(low.volatility).toBe(0.5);
  });

  it('reads the idle floor and window P5 as interpolated 5th percentiles, not minimums', () => {
    // 0 W rising 10 W per second for 41 s; the window holds t = 20..40 (200..400 W).
    const ramp = Array.from({ length: 41 }, (_, t) => t * 10);
    const stats = computeLoadSwingStats({
      samples: ramp,
      times: ramp.map((_, t) => t),
      intervalSeconds: 1,
      windowStartSeconds: 20,
      windowEndSeconds: 40,
    })!;
    // 20 pre-serving samples (0..190 W): rank 19 × 0.05 = 0.95, so 9.5 W. 21 window samples: rank 1.
    expect(stats.idleFloor).toBeCloseTo(9.5, 9);
    expect(stats.p5).toBeCloseTo(210, 9);
    expect(stats.p95).toBeCloseTo(390, 9);
    expect(stats.mean).toBeCloseTo(300, 9);
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

describe('loadSwingTraceRows', () => {
  const series: GpuPowerSeries = {
    artifact: 'gpu_metrics_test',
    startMs: 1_700_000_000_000,
    bucketSeconds: 1,
    gpus: [0, 1],
    t: [0, 1, 2],
    power: [
      [100.5, 200, 300],
      [100, 200.25, null],
    ],
  };

  it('rounds the per-GPU mean to 0.1 W and flags buckets inside the window, end included', () => {
    expect(loadSwingTraceRows(series, series.startMs + 1000, series.startMs + 2000)).toEqual([
      { t_s: 0, since_serving_s: -1, in_validated_window: 0, w_per_gpu: 100.3 },
      { t_s: 1, since_serving_s: 0, in_validated_window: 1, w_per_gpu: 200.1 },
      { t_s: 2, since_serving_s: 1, in_validated_window: 1, w_per_gpu: 300 },
    ]);
  });

  it('leaves serving time blank and no bucket in the window without both bounds', () => {
    const rows = loadSwingTraceRows(series, series.startMs + 1000, null);
    expect(rows.map((row) => [row.since_serving_s, row.in_validated_window])).toEqual([
      ['', 0],
      ['', 0],
      ['', 0],
    ]);
  });
});

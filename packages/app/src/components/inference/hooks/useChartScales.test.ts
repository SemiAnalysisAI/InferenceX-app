import { describe, it, expect } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import {
  computeXScaleConfig,
  computeYDomain,
  extentWithFallback,
  isSameScaleConfig,
  type ScaleConfigValue,
} from './useChartScales';

function makePoint(x: number, y: number): InferenceData {
  return {
    date: '2025-06-15',
    x,
    y,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
  } as InferenceData;
}

// ─── extentWithFallback ───

describe('extentWithFallback', () => {
  it('returns d3.extent of the accessor', () => {
    const pts = [makePoint(5, 1), makePoint(2, 1), makePoint(9, 1)];
    expect(extentWithFallback(pts, (d) => d.x)).toEqual([2, 9]);
  });

  it('honors the override, ignoring the points', () => {
    const pts = [makePoint(5, 1)];
    expect(extentWithFallback(pts, (d) => d.x, [0, 42])).toEqual([0, 42]);
  });

  it('falls back to [0, 100] with no points and no override', () => {
    expect(extentWithFallback([], (d) => d.x)).toEqual([0, 100]);
  });
});

// ─── computeYDomain ───

describe('computeYDomain', () => {
  it('pads the linear domain by 5% of the range at the bottom, clamped at 0', () => {
    // range = 100; min - 5% = 100 - 5 = 95; max*1.05 = 210
    expect(computeYDomain([100, 200], false)).toEqual([95, 210]);
  });

  it('never lets the linear min go below 0', () => {
    // range = 10; min - 5% = 2 - 0.5 = 1.5 → stays >= 0
    const [min] = computeYDomain([2, 12], false);
    expect(min).toBeGreaterThanOrEqual(0);
  });

  it('snaps the log min to 0.1 when data min is <= 0', () => {
    expect(computeYDomain([0, 1000], true)).toEqual([0.1, 1050]);
  });

  it('snaps the log min to a power-of-ten floor when data min < 1', () => {
    // 0.05 → 10^floor(log10(0.05)) = 10^-2 = 0.01
    expect(computeYDomain([0.05, 100], true)[0]).toBeCloseTo(0.01);
  });

  it('uses 0.95 * min for log when data min >= 1', () => {
    expect(computeYDomain([200, 1000], true)).toEqual([190, 1050]);
  });
});

// ─── computeXScaleConfig ───

describe('computeXScaleConfig', () => {
  const base = { xLabel: 'Concurrency', scaleType: 'auto', niceAxes: true };

  it('is linear pinned at 0 for non-input-tput metrics', () => {
    const cfg = computeXScaleConfig({ ext: [10, 200], isInputTputMetric: false, ...base });
    expect(cfg.type).toBe('linear');
    expect(cfg._isLog).toBe(false);
    expect(cfg.domain).toEqual([0, 210]);
  });

  it('auto-logs a TTFT input-tput metric with a wide ratio', () => {
    const cfg = computeXScaleConfig({
      ext: [1, 100],
      isInputTputMetric: true,
      xLabel: 'Time To First Token (s)',
      scaleType: 'auto',
      niceAxes: true,
    });
    // ratio 100 > 10 and min > 0 → log, min floated off zero
    expect(cfg.type).toBe('log');
    expect(cfg._isLog).toBe(true);
    expect(cfg.domain[0]).toBeCloseTo(0.9);
  });

  it('respects an explicit linear override even for a TTFT metric', () => {
    const cfg = computeXScaleConfig({
      ext: [1, 100],
      isInputTputMetric: true,
      xLabel: 'TTFT',
      scaleType: 'linear',
      niceAxes: true,
    });
    expect(cfg._isLog).toBe(false);
    expect(cfg.domain).toEqual([0, 105]);
  });

  it('respects an explicit log override when min > 0', () => {
    const cfg = computeXScaleConfig({
      ext: [2, 40],
      isInputTputMetric: true,
      xLabel: 'anything',
      scaleType: 'log',
      niceAxes: true,
    });
    expect(cfg._isLog).toBe(true);
  });

  it('does not auto-log a non-TTFT input-tput metric on auto', () => {
    const cfg = computeXScaleConfig({
      ext: [1, 1000],
      isInputTputMetric: true,
      xLabel: 'Output Throughput',
      scaleType: 'auto',
      niceAxes: true,
    });
    expect(cfg._isLog).toBe(false);
  });
});

// ─── isSameScaleConfig ───

describe('isSameScaleConfig', () => {
  const a: ScaleConfigValue = { type: 'linear', domain: [0, 100], nice: true, _isLog: false };

  it('is true for value-identical configs', () => {
    const b: ScaleConfigValue = { type: 'linear', domain: [0, 100], nice: true, _isLog: false };
    expect(isSameScaleConfig(a, b)).toBe(true);
  });

  it('is false when the domain differs', () => {
    const b: ScaleConfigValue = { type: 'linear', domain: [0, 101], nice: true, _isLog: false };
    expect(isSameScaleConfig(a, b)).toBe(false);
  });

  it('is false when the type differs', () => {
    const b: ScaleConfigValue = { type: 'log', domain: [0, 100], nice: true, _isLog: false };
    expect(isSameScaleConfig(a, b)).toBe(false);
  });
});

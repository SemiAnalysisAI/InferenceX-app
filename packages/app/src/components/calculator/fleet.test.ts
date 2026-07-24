import { describe, expect, it } from 'vitest';

import { computeFleetStats, formatCompact, HOURS_PER_MONTH } from './fleet';

describe('computeFleetStats', () => {
  const base = {
    mw: 10,
    powerKwPerGpu: 2,
    costPerGpuHour: 2.5,
    tputPerGpu: 500,
    outputTputPerGpu: 450,
    interactivity: 50,
  };

  it('sizes the fleet by facility power and scales throughput/cost', () => {
    const stats = computeFleetStats(base);
    expect(stats).not.toBeNull();
    // 10 MW = 10,000 kW / 2 kW per GPU
    expect(stats!.gpus).toBe(5000);
    expect(stats!.fleetTokPerSec).toBe(5000 * 500);
    // users stream output tokens: 5000 × 450 / 50
    expect(stats!.concurrentUsers).toBe(45_000);
    expect(stats!.costPerHour).toBe(5000 * 2.5);
    expect(stats!.costPerMonth).toBe(5000 * 2.5 * HOURS_PER_MONTH);
  });

  it('floors partial GPUs', () => {
    // 10,000 kW / 2.17 kW = 4608.29... → 4608
    const stats = computeFleetStats({ ...base, powerKwPerGpu: 2.17 });
    expect(stats!.gpus).toBe(4608);
  });

  it('returns null when the power budget or per-GPU power is missing', () => {
    expect(computeFleetStats({ ...base, mw: 0 })).toBeNull();
    expect(computeFleetStats({ ...base, mw: -5 })).toBeNull();
    expect(computeFleetStats({ ...base, powerKwPerGpu: 0 })).toBeNull();
    expect(computeFleetStats({ ...base, mw: NaN })).toBeNull();
  });

  it('returns null when the budget cannot power a single GPU', () => {
    expect(computeFleetStats({ ...base, mw: 0.001 })).toBeNull();
  });

  it('reports zero users when interactivity is zero', () => {
    const stats = computeFleetStats({ ...base, interactivity: 0 });
    expect(stats!.concurrentUsers).toBe(0);
  });
});

describe('formatCompact', () => {
  it('formats billions, millions and thousands', () => {
    expect(formatCompact(2_500_000_000)).toBe('2.5B');
    expect(formatCompact(1_240_000)).toBe('1.2M');
    expect(formatCompact(48_300)).toBe('48.3k');
  });

  it('formats small numbers without a suffix', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(12.34)).toBe('12.3');
    expect(formatCompact(5)).toBe('5');
  });

  it('returns a dash for non-finite values', () => {
    expect(formatCompact(NaN)).toBe('—');
    expect(formatCompact(Infinity)).toBe('—');
  });
});

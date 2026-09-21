import { describe, expect, it } from 'vitest';

import type { InterpolatedResult } from './types';
import {
  buildFleetSchedule,
  computeFleetStats,
  formatCompact,
  HOURS_PER_MONTH,
  sizeFleetForResult,
} from './fleet';

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

describe('sizeFleetForResult', () => {
  const specs = { tdp: 1.2, power: 2, costh: 2.5, costr: 3 };
  const result = {
    hwKey: 'b200',
    resultKey: 'b200',
    value: 500,
    outputTputValue: 300,
    inputTputValue: 900,
    inputTokenShare: 0.1,
  } as InterpolatedResult;

  it('bills total throughput and derives user streams from the output share', () => {
    const stats = sizeFleetForResult(result, {
      mw: 10,
      specs,
      costProvider: 'costh',
      costType: 'total',
      interactivity: 50,
    });
    expect(stats).toEqual(
      computeFleetStats({
        mw: 10,
        powerKwPerGpu: 2,
        costPerGpuHour: 2.5,
        tputPerGpu: 500,
        // outputTokPerChip(500, 0.1, 300) = 500 × (1 − 0.1)
        outputTputPerGpu: 450,
        interactivity: 50,
      }),
    );
  });

  it('switches billable throughput and hourly cost with the cost type and provider', () => {
    const stats = sizeFleetForResult(result, {
      mw: 10,
      specs,
      costProvider: 'costr',
      costType: 'output',
      interactivity: 50,
    });
    expect(stats!.fleetTokPerSec).toBe(5000 * 300);
    expect(stats!.costPerHour).toBe(5000 * 3);
  });

  it('lets a lifecycle step override the total throughput while keeping the token mix', () => {
    const stats = sizeFleetForResult(result, {
      mw: 10,
      specs,
      costProvider: 'costh',
      costType: 'total',
      interactivity: 50,
      totalThroughput: 1000,
    });
    expect(stats!.fleetTokPerSec).toBe(5000 * 1000);
    expect(stats!.concurrentUsers).toBe(Math.floor((5000 * 900) / 50));
  });
});

describe('buildFleetSchedule', () => {
  const result = {
    value: 500,
    outputTputValue: 300,
    inputTokenShare: 0.8,
    cacheHitRate: 0.5,
  } as InterpolatedResult;
  const progression = [
    { date: '2026-06-01', result },
    {
      date: '2026-07-01',
      result: { ...result, value: 1000, inputTokenShare: 0.5, cacheHitRate: 0.8 },
    },
  ];
  const options = {
    mw: 10.001,
    specs: { power: 2, costh: 2.5, costr: 3 },
    costProvider: 'costh' as const,
    costType: 'output' as const,
    interactivity: 50,
    anchorMs: Date.parse('2026-06-01T00:00:00Z'),
    cacheReadRatio: 0.1,
  };

  it('keeps whole-chip sizing and cost fixed while using each dated rung’s total token mix', () => {
    const schedule = buildFleetSchedule(progression, options)!;
    expect(schedule).toMatchObject({
      gpus: 5000,
      costPerHour: 12500,
      provisionedMw: 10,
      concurrentUsersNow: 50000,
    });
    expect(schedule.steps).toHaveLength(2);
    expect(schedule.steps[0]!.month).toBe(0);
    expect(schedule.steps[1]!.month).toBeCloseTo(30 / (365.25 / 12), 12);
    expect(schedule.steps[0]!.billableInputTokPerSec).toBeCloseTo(1100000, 6);
    expect(schedule.steps[0]!.outputTokPerSec).toBeCloseTo(500000, 6);
    expect(schedule.steps[1]!.billableInputTokPerSec).toBeCloseTo(700000, 6);
    expect(schedule.steps[1]!.outputTokPerSec).toBe(2500000);
  });

  it('leaves unsizeable or unanchored progressions unplottable', () => {
    expect(
      buildFleetSchedule(progression, { ...options, specs: { ...options.specs, power: 0 } }),
    ).toBeNull();
    expect(buildFleetSchedule(progression, { ...options, mw: 0.001 })).toBeNull();
    expect(buildFleetSchedule(progression, { ...options, anchorMs: NaN })).toBeNull();
    expect(buildFleetSchedule([], options)).toBeNull();
  });
});

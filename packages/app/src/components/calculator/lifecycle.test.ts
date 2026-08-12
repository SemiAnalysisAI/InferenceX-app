import { describe, expect, it } from 'vitest';

import {
  availabilityFromInterrupts,
  breakEvenPricePerMTok,
  computeLifecycle,
  type LifecycleAssumptions,
  type ThroughputStep,
} from './lifecycle';

const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 730 / 24;

/** Hand-computed revenue $/day at the fixture's price and availability. */
const rev = (tput: number) => ((tput * 86_400) / 1e6) * 10 * (24 / 24.5);

const assumptions: LifecycleAssumptions = {
  mtbiDays: 24,
  recoveryHours: 12,
  // Comfortably above the fixture's break-even, so the base case pays back.
  pricePerMTok: 10,
};

describe('availabilityFromInterrupts', () => {
  it('applies the mtbi / (mtbi + recovery) haircut', () => {
    expect(availabilityFromInterrupts(24, 12)).toBeCloseTo(24 / 24.5, 10);
  });

  it('is monotonic in both directions', () => {
    expect(availabilityFromInterrupts(48, 12)).toBeGreaterThan(availabilityFromInterrupts(24, 12));
    expect(availabilityFromInterrupts(24, 6)).toBeGreaterThan(availabilityFromInterrupts(24, 12));
  });

  it('treats a blank or nonsensical input as "no interruptions modelled"', () => {
    // A missing MTBI must not read as "always down" — it is an optional refinement.
    expect(availabilityFromInterrupts(0, 12)).toBe(1);
    expect(availabilityFromInterrupts(-1, 12)).toBe(1);
    expect(availabilityFromInterrupts(NaN, 12)).toBe(1);
    expect(availabilityFromInterrupts(24, 0)).toBe(1);
  });
});

describe('breakEvenPricePerMTok', () => {
  it('returns the price at which revenue exactly covers cost', () => {
    // 1000 tok/s = 3.6M tok/hr; $36/hr → $10 per M tok
    expect(breakEvenPricePerMTok(36, 1000)).toBeCloseTo(10, 10);
  });

  it('is the price that zeroes the margin at that throughput', () => {
    const fleetTokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const price = breakEvenPricePerMTok(costPerHour, fleetTokPerSec)!;
    const series = computeLifecycle({
      steps: [{ month: 0, fleetTokPerSec }],
      costPerHour,
      horizonMonths: 24,
      assumptions: { ...assumptions, mtbiDays: 0, pricePerMTok: price },
    })!;
    expect(series.marginPerDay).toBeCloseTo(0, 6);
  });

  it('returns null when no tokens are produced', () => {
    expect(breakEvenPricePerMTok(100, 0)).toBeNull();
    expect(breakEvenPricePerMTok(100, NaN)).toBeNull();
  });
});

describe('computeLifecycle', () => {
  const costPerHour = 10_000;
  // Three measured configs: the opening sweep, then two improvements — the
  // shape MI355X showed on DeepSeek-V4-Pro.
  const steps: ThroughputStep[] = [
    { month: 0, fleetTokPerSec: 400_000 },
    { month: 3, fleetTokPerSec: 900_000 },
    { month: 6, fleetTokPerSec: 1_600_000 },
  ];
  const base = { steps, costPerHour, horizonMonths: 24, assumptions };

  it('holds each config flat until the next one lands', () => {
    const series = computeLifecycle(base)!;
    // Two points per step: the riser and the far end of the tread.
    const risers = series.points.filter((p) => p.isStep);
    expect(risers.map((p) => p.month)).toEqual([0, 3, 6]);
    // Revenue is constant across a tread, and rises only at a riser.
    const treads = series.points.filter((p) => !p.isStep);
    expect(treads).toHaveLength(3);
    for (let i = 0; i < risers.length; i += 1) {
      expect(treads[i]!.revenue).toBeCloseTo(risers[i]!.revenue, 6);
    }
    expect(risers[1]!.revenue).toBeGreaterThan(risers[0]!.revenue);
    expect(risers[2]!.revenue).toBeGreaterThan(risers[1]!.revenue);
  });

  it('keeps cost flat — a better config does not change chips or their price', () => {
    const series = computeLifecycle(base)!;
    for (const p of series.points) {
      expect(p.cost).toBeCloseTo(costPerHour * HOURS_PER_DAY, 6);
    }
  });

  it('reports the gain the measured improvements were worth', () => {
    const series = computeLifecycle(base)!;
    expect(series.improvementFactor).toBeCloseTo(1_600_000 / 400_000, 9);
    expect(series.improvementCount).toBe(2);
    expect(series.revenuePerDay).toBeGreaterThan(series.firstRevenuePerDay);
    expect(series.marginPerDay).toBeGreaterThan(series.firstMarginPerDay);
  });

  it('scales revenue with throughput, price and availability', () => {
    const series = computeLifecycle(base)!;
    const expected = ((1_600_000 * 86_400) / 1e6) * assumptions.pricePerMTok * (24 / 24.5);
    expect(series.revenuePerDay).toBeCloseTo(expected, 6);
    expect(series.availability).toBeCloseTo(24 / 24.5, 10);
  });

  it('holds the latest config flat past the last sweep, out to the horizon', () => {
    const series = computeLifecycle(base)!;
    expect(series.endMonth).toBe(24);
    const last = series.points.at(-1)!;
    expect(last.month).toBe(24);
    expect(last.revenue).toBeCloseTo(series.revenuePerDay, 6);
  });

  it('starts at the first measured run, not at the anchor', () => {
    // A chip first measured three months after release has no line before then.
    const late = computeLifecycle({
      ...base,
      steps: [{ month: 3, fleetTokPerSec: 400_000 }],
    })!;
    expect(late.startMonth).toBe(3);
    expect(late.points[0]!.month).toBe(3);
  });

  it('integrates cumulative margin across the steps', () => {
    const series = computeLifecycle(base)!;
    // Hand-integrate: three stretches at their own margins.
    const cost = costPerHour * HOURS_PER_DAY;
    const expected =
      (rev(400_000) - cost) * 3 * DAYS_PER_MONTH +
      (rev(900_000) - cost) * 3 * DAYS_PER_MONTH +
      (rev(1_600_000) - cost) * 18 * DAYS_PER_MONTH;
    expect(series.lifetimeMargin).toBeCloseTo(expected, 4);
  });

  it('reports payback within the stretch where cumulative crosses zero', () => {
    const series = computeLifecycle(base)!;
    expect(series.paybackMonth).not.toBeNull();
    expect(series.paybackMonth!).toBeGreaterThanOrEqual(0);
    expect(series.paybackMonth!).toBeLessThanOrEqual(24);
  });

  it('reports no payback for a fleet that never covers its cost', () => {
    const series = computeLifecycle({
      ...base,
      assumptions: { ...assumptions, pricePerMTok: 0 },
    })!;
    expect(series.paybackMonth).toBeNull();
    expect(series.lifetimeMargin).toBeLessThan(0);
  });

  it('can start underwater and end profitable — the point of the chart', () => {
    // Priced so the opening config loses money and the last one makes it.
    const price = breakEvenPricePerMTok(costPerHour, 700_000)!;
    const series = computeLifecycle({
      ...base,
      assumptions: { ...assumptions, mtbiDays: 0, pricePerMTok: price },
    })!;
    const risers = series.points.filter((p) => p.isStep);
    expect(risers[0]!.margin).toBeLessThan(0);
    expect(risers.at(-1)!.margin).toBeGreaterThan(0);
  });

  it('ignores steps beyond the horizon', () => {
    const series = computeLifecycle({ ...base, horizonMonths: 4 })!;
    // Only the first two configs land inside a four-month window.
    expect(series.points.filter((p) => p.isStep).map((p) => p.month)).toEqual([0, 3]);
    expect(series.improvementCount).toBe(1);
    expect(series.endMonth).toBe(4);
  });

  it('sorts and cleans the schedule it is given', () => {
    const series = computeLifecycle({
      ...base,
      steps: [
        { month: 6, fleetTokPerSec: 1_600_000 },
        { month: 0, fleetTokPerSec: 400_000 },
        { month: 3, fleetTokPerSec: 0 }, // no throughput — dropped
        { month: NaN, fleetTokPerSec: 500_000 }, // unusable month — dropped
      ],
    })!;
    expect(series.points.filter((p) => p.isStep).map((p) => p.month)).toEqual([0, 6]);
  });

  it('returns null without steps, a cost basis or a horizon past the first run', () => {
    expect(computeLifecycle({ ...base, steps: [] })).toBeNull();
    expect(computeLifecycle({ ...base, costPerHour: NaN })).toBeNull();
    expect(computeLifecycle({ ...base, horizonMonths: 0 })).toBeNull();
    expect(
      computeLifecycle({ ...base, steps: [{ month: 30, fleetTokPerSec: 1 }], horizonMonths: 24 }),
    ).toBeNull();
  });
});

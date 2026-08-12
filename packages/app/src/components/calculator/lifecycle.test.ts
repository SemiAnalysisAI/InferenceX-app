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
  // The step behaviour is what most of these tests are about, so they start at
  // full load. The ramp has its own describe block below.
  rampMonths: 0,
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

  it('rises by the interrupt haircut, and still zeroes the margin', () => {
    // The same racks sell fewer tokens when interrupted, so break-even is higher.
    // Without the availability argument the seeded "break-even" price leaves the
    // cheapest fleet a few percent under water.
    const fleetTokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const availability = availabilityFromInterrupts(24, 12);
    const flat = breakEvenPricePerMTok(costPerHour, fleetTokPerSec)!;
    const haircut = breakEvenPricePerMTok(costPerHour, fleetTokPerSec, availability)!;
    expect(haircut).toBeCloseTo(flat / availability, 10);

    const series = computeLifecycle({
      steps: [{ month: 0, fleetTokPerSec }],
      costPerHour,
      horizonMonths: 24,
      assumptions: { ...assumptions, pricePerMTok: haircut },
    })!;
    expect(series.availability).toBeCloseTo(availability, 10);
    expect(series.marginPerDay).toBeCloseTo(0, 6);

    // The unadjusted price is the defect being pinned: it reads as break-even
    // but plots a loss.
    const naive = computeLifecycle({
      steps: [{ month: 0, fleetTokPerSec }],
      costPerHour,
      horizonMonths: 24,
      assumptions: { ...assumptions, pricePerMTok: flat },
    })!;
    expect(naive.marginPerDay).toBeLessThan(0);
  });

  it('returns null when no tokens are produced', () => {
    expect(breakEvenPricePerMTok(100, 0)).toBeNull();
    expect(breakEvenPricePerMTok(100, NaN)).toBeNull();
  });

  it('returns null for an impossible availability', () => {
    expect(breakEvenPricePerMTok(100, 1000, 0)).toBeNull();
    expect(breakEvenPricePerMTok(100, 1000, NaN)).toBeNull();
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
    // One point per step plus a closing point at the horizon: with curveStepAfter
    // a value holds until the next x, so that is the whole staircase.
    const risers = series.points.filter((p) => p.isStep);
    expect(risers.map((p) => p.month)).toEqual([0, 3, 6]);
    expect(risers[1]!.revenue).toBeGreaterThan(risers[0]!.revenue);
    expect(risers[2]!.revenue).toBeGreaterThan(risers[1]!.revenue);
    // The closing point carries the last config forward to the horizon.
    const last = series.points.at(-1)!;
    expect(last.isStep).toBe(false);
    expect(last.month).toBe(24);
    expect(last.revenue).toBeCloseTo(risers[2]!.revenue, 6);
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

  describe('ramp', () => {
    const ramped = { ...base, assumptions: { ...assumptions, rampMonths: 3 } };

    it('starts the first config at zero revenue and maxes out at its numbers', () => {
      const series = computeLifecycle(ramped)!;
      expect(series.rampEndMonth).toBe(3);
      const first = series.points[0]!;
      // Nothing is being served yet, but the racks are already billing.
      expect(first.revenue).toBeCloseTo(0, 6);
      expect(first.margin).toBeCloseTo(-costPerHour * HOURS_PER_DAY, 6);
      // At the end of its rollout the first config is serving its full rate.
      const atRampEnd = series.points.find((p) => p.month === 3)!;
      expect(atRampEnd.revenue).toBeCloseTo(rev(400_000), 6);
    });

    it('gives every config its own rollout, from the incumbent level to its own', () => {
      const series = computeLifecycle(ramped)!;
      const risers = series.points.filter((p) => p.isStep);
      expect(risers.map((p) => p.month)).toEqual([0, 3, 6]);
      // The second config starts from the first's level, not from zero.
      expect(risers[1]!.revenue).toBeCloseTo(rev(400_000), 6);
      // ...and maxes out at its own by the end of its window.
      const atSix = series.points.find((p) => p.month === 6)!;
      expect(atSix.revenue).toBeCloseTo(rev(900_000), 6);
      const atNine = series.points.find((p) => p.month === 9)!;
      expect(atNine.revenue).toBeCloseTo(rev(1_600_000), 6);
    });

    it('rises monotonically, with no jump at a rollout boundary', () => {
      const series = computeLifecycle(ramped)!;
      for (let i = 1; i < series.points.length; i += 1) {
        expect(series.points[i]!.revenue).toBeGreaterThanOrEqual(
          series.points[i - 1]!.revenue - 1e-6,
        );
      }
    });

    it('starts a rollout from where the previous one actually got to', () => {
      // A 12-month ramp cannot finish before the next config lands at month 3, so
      // the second rollout must pick up mid-climb rather than from 400k.
      const series = computeLifecycle({
        ...base,
        assumptions: { ...assumptions, rampMonths: 12 },
      })!;
      const risers = series.points.filter((p) => p.isStep);
      const second = risers[1]!;
      expect(second.month).toBe(3);
      expect(second.revenue).toBeGreaterThan(0);
      expect(second.revenue).toBeLessThan(rev(400_000));
    });

    it('keeps cost flat through every rollout — racks bill once energised', () => {
      const series = computeLifecycle(ramped)!;
      const full = costPerHour * HOURS_PER_DAY;
      expect(series.points.length).toBeGreaterThan(20);
      for (const p of series.points) expect(p.cost).toBeCloseTo(full, 6);
    });

    it('delays payback, because the first rollout is paid for while it earns its way up', () => {
      const flat = computeLifecycle(base)!;
      const series = computeLifecycle(ramped)!;
      expect(series.paybackMonth).not.toBeNull();
      expect(series.paybackMonth!).toBeGreaterThan(flat.paybackMonth!);
      expect(series.lifetimeMargin).toBeLessThan(flat.lifetimeMargin);
    });

    it('treats a zero or nonsensical ramp as "already at full load"', () => {
      for (const rampMonths of [0, -1, NaN]) {
        const series = computeLifecycle({
          ...base,
          assumptions: { ...assumptions, rampMonths },
        })!;
        expect(series.rampEndMonth).toBe(series.startMonth);
        expect(series.points[0]!.revenue).toBeCloseTo(rev(400_000), 6);
        expect(series.points.some((p) => p.isRamp)).toBe(false);
      }
    });

    it('reports the end-of-window rate, which is past every rollout', () => {
      const series = computeLifecycle(ramped)!;
      expect(series.revenuePerDay).toBeCloseTo(rev(1_600_000), 6);
    });

    it('integrates a rollout to the analytic area under the smoothstep', () => {
      // A full smoothstep is odd-symmetric about its midpoint, so its mean is
      // exactly half the end level. Pins the trapezoid path, which every other
      // integration test dodges by using rampMonths: 0.
      const series = computeLifecycle({
        steps: [{ month: 0, fleetTokPerSec: 1_600_000 }],
        costPerHour,
        horizonMonths: 6,
        assumptions: { ...assumptions, rampMonths: 6 },
      })!;
      const cost = costPerHour * HOURS_PER_DAY;
      const expected = (rev(1_600_000) * 0.5 - cost) * 6 * DAYS_PER_MONTH;
      expect(series.lifetimeMargin).toBeCloseTo(expected, 4);
    });

    it('still flags a rollout as ramping when the next config cuts it short', () => {
      // The last sample of a pre-empted rollout is mid-climb, so it must not
      // read as "at full load".
      const series = computeLifecycle({
        steps: [
          { month: 0, fleetTokPerSec: 400_000 },
          { month: 3, fleetTokPerSec: 1_600_000 },
        ],
        costPerHour,
        horizonMonths: 24,
        assumptions: { ...assumptions, rampMonths: 12 },
      })!;
      const cutShort = series.points.filter((p) => p.month === 3 && !p.isStep);
      expect(cutShort.length).toBeGreaterThan(0);
      for (const point of cutShort) {
        expect(point.revenue).toBeLessThan(rev(400_000));
        expect(point.isRamp).toBe(true);
      }
    });

    it('collapses configs landing in the same month, keeping the best', () => {
      // Same-day rungs share a month. The superseded one must not get a
      // zero-width rollout, which would spike the line to a rate never served.
      const series = computeLifecycle({
        steps: [
          { month: 0, fleetTokPerSec: 400_000 },
          { month: 6, fleetTokPerSec: 900_000 },
          { month: 6, fleetTokPerSec: 1_600_000 },
        ],
        costPerHour,
        horizonMonths: 24,
        assumptions: { ...assumptions, rampMonths: 3 },
      })!;
      // One riser per month, not two.
      expect(series.points.filter((p) => p.isStep).map((p) => p.month)).toEqual([0, 6]);
      expect(series.improvementCount).toBe(1);
      // The superseded config's full rate is never plotted, and the level only
      // ever climbs.
      for (const point of series.points) {
        expect(point.revenue).toBeLessThanOrEqual(rev(1_600_000) + 1e-6);
      }
      for (let i = 1; i < series.points.length; i += 1) {
        expect(series.points[i]!.revenue).toBeGreaterThanOrEqual(
          series.points[i - 1]!.revenue - 1e-6,
        );
      }
    });
  });

  it('interpolates payback inside the stretch that crosses zero', () => {
    // Priced so the opening config loses money for three months and the next one
    // digs the fleet out. The crossing is then closed-form, which pins the
    // interpolation rather than just bracketing it.
    const price = 3;
    const series = computeLifecycle({
      ...base,
      steps: [
        { month: 0, fleetTokPerSec: 400_000 },
        { month: 3, fleetTokPerSec: 1_600_000 },
      ],
      assumptions: { ...assumptions, mtbiDays: 0, pricePerMTok: price },
    })!;
    const cost = costPerHour * HOURS_PER_DAY;
    const perDay = (tput: number) => ((tput * 86_400) / 1e6) * price;
    const first = perDay(400_000) - cost;
    const second = perDay(1_600_000) - cost;
    expect(first).toBeLessThan(0);
    expect(second).toBeGreaterThan(0);
    // Three months of losses repaid at the second config's rate.
    expect(series.paybackMonth!).toBeCloseTo(3 + (-first * 3) / second, 6);
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

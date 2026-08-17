import { describe, expect, it } from 'vitest';

import {
  availabilityFromInterrupts,
  billableTokPerSec,
  isBreakEvenAnchored,
  metricValue,
  breakEvenPricePerMTok,
  computeLifecycle,
  valueAtMonth,
  type LifecycleAssumptions,
  type LifecyclePoint,
  type ThroughputStep,
} from './lifecycle';

const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 365.25 / 12;

/** A 10 MW fleet, so $/MW/day is the daily margin over ten. */
const PROVISIONED_MW = 10;

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
    const tokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const price = breakEvenPricePerMTok(costPerHour, tokPerSec)!;
    const series = computeLifecycle({
      steps: [{ month: 0, billableTokPerSec: tokPerSec }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 24,
      assumptions: { ...assumptions, mtbiDays: 0, pricePerMTok: price },
    })!;
    expect(series.marginPerDay).toBeCloseTo(0, 6);
  });

  it('rises by the interrupt haircut, and still zeroes the margin', () => {
    // The same racks sell fewer tokens when interrupted, so break-even is higher.
    // Without the availability argument the seeded "break-even" price leaves the
    // cheapest fleet a few percent under water.
    const tokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const availability = availabilityFromInterrupts(24, 12);
    const flat = breakEvenPricePerMTok(costPerHour, tokPerSec)!;
    const haircut = breakEvenPricePerMTok(costPerHour, tokPerSec, availability)!;
    expect(haircut).toBeCloseTo(flat / availability, 10);

    const series = computeLifecycle({
      steps: [{ month: 0, billableTokPerSec: tokPerSec }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 24,
      assumptions: { ...assumptions, pricePerMTok: haircut },
    })!;
    expect(series.availability).toBeCloseTo(availability, 10);
    expect(series.marginPerDay).toBeCloseTo(0, 6);

    // The unadjusted price is the defect being pinned: it reads as break-even
    // but plots a loss.
    const naive = computeLifecycle({
      steps: [{ month: 0, billableTokPerSec: tokPerSec }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
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
    { month: 0, billableTokPerSec: 400_000 },
    { month: 3, billableTokPerSec: 900_000 },
    { month: 6, billableTokPerSec: 1_600_000 },
  ];
  const base = {
    steps,
    costPerHour,
    provisionedMw: PROVISIONED_MW,
    horizonMonths: 24,
    assumptions,
  };

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
      steps: [{ month: 3, billableTokPerSec: 400_000 }],
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
        { month: 6, billableTokPerSec: 1_600_000 },
        { month: 0, billableTokPerSec: 400_000 },
        { month: 3, billableTokPerSec: 0 }, // no throughput — dropped
        { month: NaN, billableTokPerSec: 500_000 }, // unusable month — dropped
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
        steps: [{ month: 0, billableTokPerSec: 1_600_000 }],
        costPerHour,
        provisionedMw: PROVISIONED_MW,
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
          { month: 0, billableTokPerSec: 400_000 },
          { month: 3, billableTokPerSec: 1_600_000 },
        ],
        costPerHour,
        provisionedMw: PROVISIONED_MW,
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
          { month: 0, billableTokPerSec: 400_000 },
          { month: 6, billableTokPerSec: 900_000 },
          { month: 6, billableTokPerSec: 1_600_000 },
        ],
        costPerHour,
        provisionedMw: PROVISIONED_MW,
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
        { month: 0, billableTokPerSec: 400_000 },
        { month: 3, billableTokPerSec: 1_600_000 },
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

  describe('cumulative revenue', () => {
    it('is the running area under the revenue curve, cost never subtracted', () => {
      const series = computeLifecycle(base)!;
      const first = series.points[0]!;
      const last = series.points.at(-1)!;
      // Nothing has been earned at the first sample, and it only ever grows —
      // unlike cumulative margin, which starts underwater whenever price is low.
      expect(first.cumulativeRevenue).toBe(0);
      for (const [i, point] of series.points.entries()) {
        if (i === 0) continue;
        expect(point.cumulativeRevenue).toBeGreaterThanOrEqual(
          series.points[i - 1]!.cumulativeRevenue,
        );
      }
      expect(last.cumulativeRevenue).toBeGreaterThan(0);
    });

    it('stays exactly one flat cost above cumulative margin', () => {
      // The invariant that makes the two comparable on one chart: both are
      // trapezoided over the same intervals, so their difference is cost x elapsed
      // and nothing else. A separate accumulator that drifted would fail here.
      const series = computeLifecycle(base)!;
      const costPerDay = costPerHour * HOURS_PER_DAY;
      for (const point of series.points) {
        const elapsedDays = (point.month - series.startMonth) * DAYS_PER_MONTH;
        expect(point.cumulativeRevenue - point.cumulative).toBeCloseTo(costPerDay * elapsedDays, 4);
      }
    });

    it('is zero at every sample when the price is zero', () => {
      const series = computeLifecycle({
        ...base,
        assumptions: { ...assumptions, pricePerMTok: 0 },
      })!;
      for (const point of series.points) expect(point.cumulativeRevenue).toBe(0);
      // Cumulative margin is then pure accumulated cost, which is the check that
      // the two accumulators are not accidentally the same variable.
      expect(series.points.at(-1)!.cumulative).toBeLessThan(0);
    });
  });

  it('returns null without steps, a cost basis or a horizon past the first run', () => {
    expect(computeLifecycle({ ...base, steps: [] })).toBeNull();
    expect(computeLifecycle({ ...base, costPerHour: NaN })).toBeNull();
    expect(computeLifecycle({ ...base, horizonMonths: 0 })).toBeNull();
    expect(
      computeLifecycle({
        ...base,
        steps: [{ month: 30, billableTokPerSec: 1 }],
        horizonMonths: 24,
      }),
    ).toBeNull();
  });
});

const point = (month: number, margin: number): LifecyclePoint => ({
  month,
  revenue: margin + 100,
  cost: 100,
  margin,
  marginPerMw: margin / PROVISIONED_MW,
  cumulative: margin * 10,
  cumulativeRevenue: (margin + 100) * 10,
  isStep: false,
  isRamp: false,
});

const margin = (p: LifecyclePoint) => p.margin;

describe('valueAtMonth', () => {
  const points = [point(2, 0), point(4, 200), point(9, 200)];

  it('interpolates linearly between samples, matching what the line draws', () => {
    expect(valueAtMonth(points, 3, margin)).toBeCloseTo(100, 9);
    expect(valueAtMonth(points, 2, margin)).toBeCloseTo(0, 9);
    expect(valueAtMonth(points, 4, margin)).toBeCloseTo(200, 9);
    expect(valueAtMonth(points, 6.5, margin)).toBeCloseTo(200, 9);
  });

  it('returns null outside the series window instead of clamping to its ends', () => {
    // A chip first measured a year after release has no line before then, so it
    // has no number either — the readout and the surface both depend on this.
    expect(valueAtMonth(points, 1.9, margin)).toBeNull();
    expect(valueAtMonth(points, 9.1, margin)).toBeNull();
    expect(valueAtMonth([], 3, margin)).toBeNull();
  });

  it('reads whichever field the caller picks', () => {
    expect(valueAtMonth(points, 3, (p) => p.cumulative)).toBeCloseTo(1000, 9);
    expect(valueAtMonth(points, 3, (p) => p.cost)).toBeCloseTo(100, 9);
  });

  it('does not divide by zero on samples that share a month', () => {
    // Forced verticals emit two samples at one instant, which is how a config
    // landing with no ramp window draws as a riser. Reading exactly at the riser
    // gives the level the fleet serves *from* that instant — the top of the step,
    // matching what `isStep` means — rather than the level it just left.
    const vertical = [point(1, 0), point(3, 0), point(3, 500), point(6, 500)];
    expect(valueAtMonth(vertical, 3, margin)).toBeCloseTo(500, 9);
    expect(valueAtMonth(vertical, 4.5, margin)).toBeCloseTo(500, 9);
  });
});

describe('ramp sampling is anchored, not proportional', () => {
  // The interactivity surface reads one lifecycle per (chip, interactivity slice)
  // and then compares those slices against each other. A rung that no sweep
  // measured at a given slice is dropped from that slice's timeline, so the
  // *same* governing config can be followed by a different next rung — or by
  // none — depending on the slice. That changes where the governing rollout's
  // ramp ends.
  //
  // Nothing about the underlying curve changes: `levelWithin` is a function of
  // the rollout's own start, from, to and the user's rampMonths. Only the
  // reconstruction can move, and it must not, or two slices disagree about a
  // config they both ran and the surface rises along an axis the selection
  // guarantees it falls along.
  const ramped: LifecycleAssumptions = { ...assumptions, rampMonths: 3 };

  it('reconstructs a governing rollout identically whether or not it is cut short', () => {
    const alone = computeLifecycle({
      steps: [{ month: 0, billableTokPerSec: 1000 }],
      costPerHour: 100,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 12,
      assumptions: ramped,
    })!;
    // Same first rung; a second lands at 1.5, halfway through the first ramp, and
    // truncates it. Before 1.5 the fleet is running the identical rollout.
    const truncated = computeLifecycle({
      steps: [
        { month: 0, billableTokPerSec: 1000 },
        { month: 1.5, billableTokPerSec: 3000 },
      ],
      costPerHour: 100,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 12,
      assumptions: ramped,
    })!;

    for (const month of [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.2, 1.4]) {
      const a = valueAtMonth(alone.points, month, (p) => p.revenue);
      const b = valueAtMonth(truncated.points, month, (p) => p.revenue);
      // Guard the guard: a mistyped accessor yields NaN, and `expect(NaN).toBe(NaN)`
      // passes, so without this the comparison below would hold no matter what
      // the sampler did.
      expect(Number.isFinite(a), `month ${month} readable`).toBe(true);
      // Bit-equal, not merely close: the sample months are the same months, so
      // the interpolation is the same arithmetic on the same numbers. Dividing
      // the ramp window into a fixed number of pieces instead would put the
      // samples of the truncated run at different months and break this.
      expect(b, `month ${month}`).toBe(a);
    }
  });

  it('spaces ramp samples by the assumption, so a shorter window gets fewer', () => {
    // The flip side of the guarantee above: resolution is fixed in months, so a
    // rollout cut short carries proportionally fewer samples rather than the
    // same count squeezed into less time. Equal spacing is the whole mechanism.
    const series = computeLifecycle({
      steps: [{ month: 0, billableTokPerSec: 1000 }],
      costPerHour: 100,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 12,
      assumptions: ramped,
    })!;
    const rampMonthsSampled = series.points.filter((p) => p.month <= 3).map((p) => p.month);
    const gaps = rampMonthsSampled.slice(1).map((m, i) => m - rampMonthsSampled[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(3 / 24, 9);
  });
});

describe('billableTokPerSec', () => {
  // A fleet whose total rate is dominated by input tokens, most of them cached —
  // the agentic shape: production runs sit near 133:1 input:output with a median
  // 92% hit rate.
  const total = 13_636;
  const input = 13_525;

  it('is an exact identity where nothing was measured, which is every fixed sequence', () => {
    // Not "close to": fixed-sequence rows carry no cache metric on any row, so
    // this path must return the caller's own number bit-for-bit. Anything else
    // would move 8k/1k margins as a side effect of an agentic feature.
    for (const costType of ['total', 'input', 'output'] as const) {
      expect(billableTokPerSec(total, input, undefined, 0.1, costType)).toBe(total);
    }
  });

  it('is an exact identity at a 100% cached price, whatever the hit rate', () => {
    expect(billableTokPerSec(total, input, 0.92, 1, 'total')).toBe(total);
    expect(billableTokPerSec(total, input, 1, 1, 'input')).toBe(total);
  });

  it('discounts only the cached share of input tokens', () => {
    // 92% of 13,525 input tok/s bill at 10%, so 0.92 × 13,525 × 0.9 comes off.
    const expected = total - input * 0.92 * 0.9;
    expect(billableTokPerSec(total, input, 0.92, 0.1, 'total')).toBeCloseTo(expected, 9);
    // The size of the correction is the point of the feature: at this mix the
    // billable rate is a small fraction of the raw one.
    expect(expected / total).toBeLessThan(0.25);
  });

  it('leaves output pricing alone — generated tokens are never cache reads', () => {
    expect(billableTokPerSec(111, input, 0.92, 0.1, 'output')).toBe(111);
  });

  it('clamps a hit rate the data reports above 1 rather than billing negative tokens', () => {
    // Real rows report up to 1.185. Left unclamped that would discount more
    // input tokens than were served.
    const clamped = billableTokPerSec(total, input, 1.185, 0, 'total');
    expect(clamped).toBe(billableTokPerSec(total, input, 1, 0, 'total'));
    expect(clamped).toBeGreaterThanOrEqual(0);
  });

  it('never returns less than zero when the discount exceeds the base rate', () => {
    // `input` pricing on a frontier whose splined input rate exceeds the total.
    expect(billableTokPerSec(100, 10_000, 1, 0, 'total')).toBe(0);
  });

  it('ignores an unusable input rate instead of producing NaN', () => {
    expect(billableTokPerSec(total, Number.NaN, 0.92, 0.1, 'total')).toBe(total);
    expect(billableTokPerSec(total, 0, 0.92, 0.1, 'total')).toBe(total);
  });
});

describe('margin per megawatt', () => {
  const costPerHour = 10_000;
  const steps: ThroughputStep[] = [
    { month: 0, billableTokPerSec: 400_000 },
    { month: 6, billableTokPerSec: 1_600_000 },
  ];
  const base = {
    steps,
    costPerHour,
    provisionedMw: PROVISIONED_MW,
    horizonMonths: 24,
    assumptions,
  };

  it('is the daily margin divided by the power actually provisioned', () => {
    const series = computeLifecycle(base)!;
    for (const p of series.points) {
      expect(p.marginPerMw).toBeCloseTo(p.margin / PROVISIONED_MW, 9);
    }
  });

  it('divides by provisioned power, so a denser fleet on the same budget reads higher', () => {
    // Two fleets earning the same $/day, one occupying half the power. Per MW
    // they are a factor of two apart even though `margin` cannot tell them apart.
    const wide = computeLifecycle(base)!;
    const dense = computeLifecycle({ ...base, provisionedMw: PROVISIONED_MW / 2 })!;
    expect(dense.points.at(-1)!.margin).toBeCloseTo(wide.points.at(-1)!.margin, 9);
    expect(dense.points.at(-1)!.marginPerMw).toBeCloseTo(wide.points.at(-1)!.marginPerMw * 2, 9);
  });

  it('crosses zero at the same instant margin does', () => {
    // The rescale is by a positive constant, which is what licenses the chart's
    // break-even rule and the surface's plane to stay at y = 0 on this metric.
    const series = computeLifecycle(base)!;
    for (const p of series.points) {
      expect(Math.sign(p.marginPerMw)).toBe(Math.sign(p.margin));
    }
    expect(isBreakEvenAnchored('marginPerMw')).toBe(true);
    expect(isBreakEvenAnchored('revenue')).toBe(false);
    expect(isBreakEvenAnchored('cumulativeRevenue')).toBe(false);
  });

  it('stays at zero rather than dividing by an unusable power figure', () => {
    for (const provisionedMw of [0, -1, Number.NaN]) {
      const series = computeLifecycle({ ...base, provisionedMw })!;
      for (const p of series.points) {
        expect(Number.isFinite(p.marginPerMw)).toBe(true);
        expect(p.marginPerMw).toBe(0);
      }
    }
  });

  it('is selected by metricValue', () => {
    const series = computeLifecycle(base)!;
    const p = series.points.at(-1)!;
    expect(metricValue(p, 'marginPerMw')).toBe(p.marginPerMw);
    expect(metricValue(p, 'margin')).toBe(p.margin);
  });
});

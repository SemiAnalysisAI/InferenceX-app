import { describe, expect, it } from 'vitest';

import {
  availabilityFromInterrupts,
  billableInputRate,
  effectiveTokPerSec,
  isBreakEvenAnchored,
  outputTokPerChip,
  splitTokenStreams,
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

const PROVISIONED_MW = 10;

const rev = (tput: number) => ((tput * 86_400) / 1e6) * 10 * (24 / 24.5);

const assumptions: LifecycleAssumptions = {
  mtbiDays: 24,
  recoveryHours: 12,
  inputPricePerMTok: 10,
  outputPricePerMTok: 0,
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
    expect(availabilityFromInterrupts(0, 12)).toBe(1);
    expect(availabilityFromInterrupts(-1, 12)).toBe(1);
    expect(availabilityFromInterrupts(NaN, 12)).toBe(1);
    expect(availabilityFromInterrupts(24, 0)).toBe(1);
  });
});

describe('breakEvenPricePerMTok', () => {
  it('returns the price at which revenue exactly covers cost', () => {
    expect(breakEvenPricePerMTok(36, 1000)).toBeCloseTo(10, 10);
  });

  it('is the price that zeroes the margin at that throughput', () => {
    const tokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const price = breakEvenPricePerMTok(costPerHour, tokPerSec)!;
    const series = computeLifecycle({
      steps: [{ month: 0, billableInputTokPerSec: tokPerSec, outputTokPerSec: 0 }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 24,
      assumptions: { ...assumptions, mtbiDays: 0, inputPricePerMTok: price, outputPricePerMTok: 0 },
    })!;
    expect(series.marginPerDay).toBeCloseTo(0, 6);
  });

  it('rises by the interrupt haircut, and still zeroes the margin', () => {
    const tokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const availability = availabilityFromInterrupts(24, 12);
    const flat = breakEvenPricePerMTok(costPerHour, tokPerSec)!;
    const haircut = breakEvenPricePerMTok(costPerHour, tokPerSec, availability)!;
    expect(haircut).toBeCloseTo(flat / availability, 10);

    const series = computeLifecycle({
      steps: [{ month: 0, billableInputTokPerSec: tokPerSec, outputTokPerSec: 0 }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 24,
      assumptions: { ...assumptions, inputPricePerMTok: haircut, outputPricePerMTok: 0 },
    })!;
    expect(series.availability).toBeCloseTo(availability, 10);
    expect(series.marginPerDay).toBeCloseTo(0, 6);

    const naive = computeLifecycle({
      steps: [{ month: 0, billableInputTokPerSec: tokPerSec, outputTokPerSec: 0 }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 24,
      assumptions: { ...assumptions, inputPricePerMTok: flat, outputPricePerMTok: 0 },
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
  const steps: ThroughputStep[] = [
    { month: 0, billableInputTokPerSec: 400_000, outputTokPerSec: 0 },
    { month: 3, billableInputTokPerSec: 900_000, outputTokPerSec: 0 },
    { month: 6, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 },
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
    const risers = series.points.filter((p) => p.isStep);
    expect(risers.map((p) => p.month)).toEqual([0, 3, 6]);
    expect(risers[1]!.revenue).toBeGreaterThan(risers[0]!.revenue);
    expect(risers[2]!.revenue).toBeGreaterThan(risers[1]!.revenue);
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
    const expected = ((1_600_000 * 86_400) / 1e6) * assumptions.inputPricePerMTok * (24 / 24.5);
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
    const late = computeLifecycle({
      ...base,
      steps: [{ month: 3, billableInputTokPerSec: 400_000, outputTokPerSec: 0 }],
    })!;
    expect(late.startMonth).toBe(3);
    expect(late.points[0]!.month).toBe(3);
  });

  it('integrates cumulative margin across the steps', () => {
    const series = computeLifecycle(base)!;
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
      assumptions: { ...assumptions, inputPricePerMTok: 0, outputPricePerMTok: 0 },
    })!;
    expect(series.paybackMonth).toBeNull();
    expect(series.lifetimeMargin).toBeLessThan(0);
  });

  it('can start underwater and end profitable — the point of the chart', () => {
    const price = breakEvenPricePerMTok(costPerHour, 700_000)!;
    const series = computeLifecycle({
      ...base,
      assumptions: { ...assumptions, mtbiDays: 0, inputPricePerMTok: price, outputPricePerMTok: 0 },
    })!;
    const risers = series.points.filter((p) => p.isStep);
    expect(risers[0]!.margin).toBeLessThan(0);
    expect(risers.at(-1)!.margin).toBeGreaterThan(0);
  });

  it('ignores steps beyond the horizon', () => {
    const series = computeLifecycle({ ...base, horizonMonths: 4 })!;
    expect(series.points.filter((p) => p.isStep).map((p) => p.month)).toEqual([0, 3]);
    expect(series.improvementCount).toBe(1);
    expect(series.endMonth).toBe(4);
  });

  it('sorts and cleans the schedule it is given', () => {
    const series = computeLifecycle({
      ...base,
      steps: [
        { month: 6, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 },
        { month: 0, billableInputTokPerSec: 400_000, outputTokPerSec: 0 },
        { month: 3, billableInputTokPerSec: 0, outputTokPerSec: 0 },
        { month: NaN, billableInputTokPerSec: 500_000, outputTokPerSec: 0 },
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
      expect(first.revenue).toBeCloseTo(0, 6);
      expect(first.margin).toBeCloseTo(-costPerHour * HOURS_PER_DAY, 6);
      const atRampEnd = series.points.find((p) => p.month === 3)!;
      expect(atRampEnd.revenue).toBeCloseTo(rev(400_000), 6);
    });

    it('gives every config its own rollout, from the incumbent level to its own', () => {
      const series = computeLifecycle(ramped)!;
      const risers = series.points.filter((p) => p.isStep);
      expect(risers.map((p) => p.month)).toEqual([0, 3, 6]);
      expect(risers[1]!.revenue).toBeCloseTo(rev(400_000), 6);
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
      const series = computeLifecycle({
        steps: [{ month: 0, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 }],
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
      const series = computeLifecycle({
        steps: [
          { month: 0, billableInputTokPerSec: 400_000, outputTokPerSec: 0 },
          { month: 3, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 },
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
      const series = computeLifecycle({
        steps: [
          { month: 0, billableInputTokPerSec: 400_000, outputTokPerSec: 0 },
          { month: 6, billableInputTokPerSec: 900_000, outputTokPerSec: 0 },
          { month: 6, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 },
        ],
        costPerHour,
        provisionedMw: PROVISIONED_MW,
        horizonMonths: 24,
        assumptions: { ...assumptions, rampMonths: 3 },
      })!;
      expect(series.points.filter((p) => p.isStep).map((p) => p.month)).toEqual([0, 6]);
      expect(series.improvementCount).toBe(1);
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
    const price = 3;
    const series = computeLifecycle({
      ...base,
      steps: [
        { month: 0, billableInputTokPerSec: 400_000, outputTokPerSec: 0 },
        { month: 3, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 },
      ],
      assumptions: { ...assumptions, mtbiDays: 0, inputPricePerMTok: price, outputPricePerMTok: 0 },
    })!;
    const cost = costPerHour * HOURS_PER_DAY;
    const perDay = (tput: number) => ((tput * 86_400) / 1e6) * price;
    const first = perDay(400_000) - cost;
    const second = perDay(1_600_000) - cost;
    expect(first).toBeLessThan(0);
    expect(second).toBeGreaterThan(0);
    expect(series.paybackMonth!).toBeCloseTo(3 + (-first * 3) / second, 6);
  });

  describe('cumulative revenue', () => {
    it('is the running area under the revenue curve, cost never subtracted', () => {
      const series = computeLifecycle(base)!;
      const first = series.points[0]!;
      const last = series.points.at(-1)!;
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
        assumptions: { ...assumptions, inputPricePerMTok: 0, outputPricePerMTok: 0 },
      })!;
      for (const point of series.points) expect(point.cumulativeRevenue).toBe(0);
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
        steps: [{ month: 30, billableInputTokPerSec: 1, outputTokPerSec: 0 }],
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
  revenuePerMw: (margin + 100) / PROVISIONED_MW,
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
    expect(valueAtMonth(points, 1.9, margin)).toBeNull();
    expect(valueAtMonth(points, 9.1, margin)).toBeNull();
    expect(valueAtMonth([], 3, margin)).toBeNull();
  });

  it('reads whichever field the caller picks', () => {
    expect(valueAtMonth(points, 3, (p) => p.cumulative)).toBeCloseTo(1000, 9);
    expect(valueAtMonth(points, 3, (p) => p.cost)).toBeCloseTo(100, 9);
  });

  it('does not divide by zero on samples that share a month', () => {
    const vertical = [point(1, 0), point(3, 0), point(3, 500), point(6, 500)];
    expect(valueAtMonth(vertical, 3, margin)).toBeCloseTo(500, 9);
    expect(valueAtMonth(vertical, 4.5, margin)).toBeCloseTo(500, 9);
  });
});

describe('ramp sampling is anchored, not proportional', () => {
  const ramped: LifecycleAssumptions = { ...assumptions, rampMonths: 3 };

  it('reconstructs a governing rollout identically whether or not it is cut short', () => {
    const alone = computeLifecycle({
      steps: [{ month: 0, billableInputTokPerSec: 1000, outputTokPerSec: 0 }],
      costPerHour: 100,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 12,
      assumptions: ramped,
    })!;
    const truncated = computeLifecycle({
      steps: [
        { month: 0, billableInputTokPerSec: 1000, outputTokPerSec: 0 },
        { month: 1.5, billableInputTokPerSec: 3000, outputTokPerSec: 0 },
      ],
      costPerHour: 100,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 12,
      assumptions: ramped,
    })!;

    for (const month of [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.2, 1.4]) {
      const a = valueAtMonth(alone.points, month, (p) => p.revenue);
      const b = valueAtMonth(truncated.points, month, (p) => p.revenue);
      expect(Number.isFinite(a), `month ${month} readable`).toBe(true);
      expect(b, `month ${month}`).toBe(a);
    }
  });

  it('spaces ramp samples by the assumption, so a shorter window gets fewer', () => {
    const series = computeLifecycle({
      steps: [{ month: 0, billableInputTokPerSec: 1000, outputTokPerSec: 0 }],
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

describe('billableInputRate', () => {
  const input = 13_525;

  it('is an exact identity where nothing was measured, which is every fixed sequence', () => {
    expect(billableInputRate(input, undefined, 0.1)).toBe(input);
  });

  it('is an exact identity at a 100% cached price, whatever the hit rate', () => {
    expect(billableInputRate(input, 0.92, 1)).toBe(input);
    expect(billableInputRate(input, 1, 1)).toBe(input);
  });

  it('bills the cached share at the cached fraction of the price', () => {
    expect(billableInputRate(input, 0.92, 0.1)).toBeCloseTo(input * (1 - 0.92 * 0.9), 9);
    expect(billableInputRate(input, 0.92, 0.1) / input).toBeLessThan(0.2);
  });

  it('clamps a hit rate the data reports above 1 rather than billing negative tokens', () => {
    expect(billableInputRate(input, 1.185, 0)).toBe(billableInputRate(input, 1, 0));
    expect(billableInputRate(input, 1.185, 0)).toBeGreaterThanOrEqual(0);
  });

  it('is zero for an unusable input rate rather than NaN', () => {
    expect(billableInputRate(Number.NaN, 0.9, 0.1)).toBe(0);
    expect(billableInputRate(0, 0.9, 0.1)).toBe(0);
    expect(billableInputRate(-5, 0.9, 0.1)).toBe(0);
  });
});

describe('input and output prices', () => {
  const costPerHour = 1000;
  const IN = 800_000;
  const OUT = 100_000;
  const twoStream = {
    steps: [{ month: 0, billableInputTokPerSec: IN, outputTokPerSec: OUT }],
    costPerHour,
    provisionedMw: PROVISIONED_MW,
    horizonMonths: 12,
    assumptions: { ...assumptions, inputPricePerMTok: 0.27, outputPricePerMTok: 1.1 },
  };

  it('charges each stream its own price', () => {
    const series = computeLifecycle(twoStream)!;
    const expected = ((IN * 0.27 + OUT * 1.1) / 1e6) * 86_400 * availabilityFromInterrupts(24, 12);
    expect(series.revenuePerDay).toBeCloseTo(expected, 6);
  });

  it('is not a blended single price — the split changes the answer', () => {
    const blended = computeLifecycle({
      ...twoStream,
      assumptions: { ...assumptions, inputPricePerMTok: 0.27, outputPricePerMTok: 0.27 },
    })!;
    expect(blended.revenuePerDay).toBeLessThan(computeLifecycle(twoStream)!.revenuePerDay);
    const outputShare = (OUT * 1.1) / (IN * 0.27 + OUT * 1.1);
    expect(outputShare).toBeGreaterThan(0.3);
  });

  it('raising only the output price raises revenue, leaving cost alone', () => {
    const dearer = computeLifecycle({
      ...twoStream,
      assumptions: { ...assumptions, inputPricePerMTok: 0.27, outputPricePerMTok: 2.2 },
    })!;
    const base = computeLifecycle(twoStream)!;
    expect(dearer.revenuePerDay).toBeGreaterThan(base.revenuePerDay);
    expect(dearer.costPerDay).toBe(base.costPerDay);
    expect(dearer.revenuePerDay - base.revenuePerDay).toBeCloseTo(
      ((OUT * 1.1) / 1e6) * 86_400 * availabilityFromInterrupts(24, 12),
      6,
    );
  });

  it('reports a gain that neither price can move, counted over both streams', () => {
    const stepped = {
      ...twoStream,
      steps: [
        { month: 0, billableInputTokPerSec: IN, outputTokPerSec: OUT },
        { month: 3, billableInputTokPerSec: IN, outputTokPerSec: OUT * 3 },
      ],
    };
    const cheap = computeLifecycle(stepped)!;
    const dear = computeLifecycle({
      ...stepped,
      assumptions: { ...assumptions, inputPricePerMTok: 50, outputPricePerMTok: 1 },
    })!;
    expect(cheap.improvementFactor).toBeCloseTo((IN + OUT * 3) / (IN + OUT), 9);
    expect(cheap.improvementFactor).toBeGreaterThan(1.2);
    expect(dear.improvementFactor).toBeCloseTo(cheap.improvementFactor, 9);
  });

  it('keeps a step whose tokens are real even when both prices are zero', () => {
    const free = computeLifecycle({
      ...twoStream,
      assumptions: { ...assumptions, inputPricePerMTok: 0, outputPricePerMTok: 0 },
    })!;
    expect(free.points.length).toBeGreaterThan(0);
    expect(free.revenuePerDay).toBe(0);
    expect(free.marginPerDay).toBeCloseTo(-free.costPerDay, 6);
  });
});

describe('effectiveTokPerSec', () => {
  it('weights output tokens by how much more they sell for', () => {
    expect(effectiveTokPerSec(800_000, 100_000, 4)).toBe(800_000 + 400_000);
  });

  it('is what makes a two-price break-even a single solve', () => {
    const costPerHour = 1000;
    const IN = 800_000;
    const OUT = 100_000;
    const multiple = 4;
    const inputPrice = breakEvenPricePerMTok(
      costPerHour,
      effectiveTokPerSec(IN, OUT, multiple),
      1,
    )!;
    const series = computeLifecycle({
      steps: [{ month: 0, billableInputTokPerSec: IN, outputTokPerSec: OUT }],
      costPerHour,
      provisionedMw: PROVISIONED_MW,
      horizonMonths: 12,
      assumptions: {
        mtbiDays: 0,
        recoveryHours: 0,
        rampMonths: 0,
        inputPricePerMTok: inputPrice,
        outputPricePerMTok: inputPrice * multiple,
      },
    })!;
    expect(series.marginPerDay).toBeCloseTo(0, 6);
  });

  it('treats an unusable multiple as output earning nothing', () => {
    expect(effectiveTokPerSec(100, 50, Number.NaN)).toBe(100);
    expect(effectiveTokPerSec(100, 50, -1)).toBe(100);
  });
});

describe('per-megawatt lifecycle metrics', () => {
  const costPerHour = 10_000;
  const steps: ThroughputStep[] = [
    { month: 0, billableInputTokPerSec: 400_000, outputTokPerSec: 0 },
    { month: 6, billableInputTokPerSec: 1_600_000, outputTokPerSec: 0 },
  ];
  const base = {
    steps,
    costPerHour,
    provisionedMw: PROVISIONED_MW,
    horizonMonths: 24,
    assumptions,
  };

  it('divides daily revenue and margin by the power actually provisioned', () => {
    const series = computeLifecycle(base)!;
    for (const p of series.points) {
      expect(p.revenuePerMw).toBeCloseTo(p.revenue / PROVISIONED_MW, 9);
      expect(p.marginPerMw).toBeCloseTo(p.margin / PROVISIONED_MW, 9);
    }
  });

  it('divides by provisioned power, so a denser fleet on the same budget reads higher', () => {
    const wide = computeLifecycle(base)!;
    const dense = computeLifecycle({ ...base, provisionedMw: PROVISIONED_MW / 2 })!;
    expect(dense.points.at(-1)!.margin).toBeCloseTo(wide.points.at(-1)!.margin, 9);
    expect(dense.points.at(-1)!.marginPerMw).toBeCloseTo(wide.points.at(-1)!.marginPerMw * 2, 9);
  });

  it('crosses zero at the same instant margin does', () => {
    const series = computeLifecycle(base)!;
    for (const p of series.points) {
      expect(Math.sign(p.marginPerMw)).toBe(Math.sign(p.margin));
    }
    expect(isBreakEvenAnchored('marginPerMw')).toBe(true);
    expect(isBreakEvenAnchored('revenue')).toBe(false);
    expect(isBreakEvenAnchored('revenuePerMw')).toBe(false);
    expect(isBreakEvenAnchored('cumulativeRevenue')).toBe(false);
  });

  it('stays at zero rather than dividing by an unusable power figure', () => {
    for (const provisionedMw of [0, -1, Number.NaN]) {
      const series = computeLifecycle({ ...base, provisionedMw })!;
      for (const p of series.points) {
        expect(Number.isFinite(p.revenuePerMw)).toBe(true);
        expect(p.revenuePerMw).toBe(0);
        expect(Number.isFinite(p.marginPerMw)).toBe(true);
        expect(p.marginPerMw).toBe(0);
      }
    }
  });

  it('is selected by metricValue', () => {
    const series = computeLifecycle(base)!;
    const p = series.points.at(-1)!;
    expect(metricValue(p, 'revenuePerMw')).toBe(p.revenuePerMw);
    expect(metricValue(p, 'marginPerMw')).toBe(p.marginPerMw);
    expect(metricValue(p, 'margin')).toBe(p.margin);
  });
});

describe('splitTokenStreams', () => {
  const SHARE = 8192 / 9216;

  it('splits the per-chip total by the measured mix', () => {
    const { billableInputTokPerSec, outputTokPerSec } = splitTokenStreams(
      9000,
      SHARE,
      undefined,
      1,
    );
    expect(billableInputTokPerSec).toBeCloseTo(9000 * SHARE, 9);
    expect(outputTokPerSec).toBeCloseTo(9000 * (1 - SHARE), 9);
    expect(billableInputTokPerSec + outputTokPerSec).toBeCloseTo(9000, 6);
  });

  it('cannot bill more tokens than the chips served, whatever the reported rates', () => {
    for (const share of [0, 0.5, SHARE, 1]) {
      const s = splitTokenStreams(1000, share, undefined, 1);
      expect(s.billableInputTokPerSec + s.outputTokPerSec).toBeCloseTo(1000, 6);
    }
  });

  it('clamps a share outside [0,1] rather than producing a negative stream', () => {
    expect(splitTokenStreams(1000, 1.5, undefined, 1).outputTokPerSec).toBe(0);
    expect(splitTokenStreams(1000, -0.5, undefined, 1).billableInputTokPerSec).toBe(0);
  });

  it('charges nothing as input when the mix is unknown', () => {
    const s = splitTokenStreams(1000, undefined, undefined, 1);
    expect(s.billableInputTokPerSec).toBe(0);
    expect(s.outputTokPerSec).toBe(1000);
  });

  it('applies the cached discount to the input stream only', () => {
    const plain = splitTokenStreams(1000, 0.9, undefined, 0.1);
    const cached = splitTokenStreams(1000, 0.9, 0.5, 0.1);
    expect(cached.outputTokPerSec).toBeCloseTo(plain.outputTokPerSec, 9);
    expect(cached.billableInputTokPerSec).toBeLessThan(plain.billableInputTokPerSec);
    expect(cached.billableInputTokPerSec).toBeCloseTo(900 * (1 - 0.5 * 0.9), 9);
  });

  it('is zero for an unusable total', () => {
    for (const total of [0, -1, Number.NaN]) {
      const s = splitTokenStreams(total, 0.9, undefined, 1);
      expect(s.billableInputTokPerSec).toBe(0);
      expect(s.outputTokPerSec).toBe(0);
    }
  });

  it('keeps revenue monotone in the total when the mix holds — the dip regression', () => {
    const revenue = (total: number) => {
      const s = splitTokenStreams(total, SHARE, undefined, 1);
      return s.billableInputTokPerSec * 0.27 + s.outputTokPerSec * 1.1;
    };
    expect(revenue(2336)).toBeLessThan(revenue(2618));
  });
});

describe('outputTokPerChip', () => {
  it('is the reported rate when nothing pins the mix down', () => {
    expect(outputTokPerChip(1000, undefined, 123)).toBe(123);
  });

  it('re-bases a per-decode-chip rate onto chips overall', () => {
    const share = 8192 / 9216;
    const perDecodeChip = 6.857;
    const perChipOverall = outputTokPerChip(30.689, share, perDecodeChip);
    expect(perChipOverall).toBeCloseTo(30.689 * (1 - share), 6);
    expect(perDecodeChip / perChipOverall).toBeCloseTo(2, 1);
  });

  it('clamps a nonsensical share instead of returning a negative rate', () => {
    expect(outputTokPerChip(1000, 1.5, 50)).toBe(0);
    expect(outputTokPerChip(1000, -1, 50)).toBe(1000);
  });

  it('is zero for an unusable total', () => {
    expect(outputTokPerChip(0, 0.5, 50)).toBe(0);
    expect(outputTokPerChip(Number.NaN, 0.5, 50)).toBe(0);
  });
});

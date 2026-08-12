import { describe, expect, it } from 'vitest';

import {
  availabilityFromInterrupts,
  breakEvenPricePerMTok,
  computeLifecycle,
  DECOMMISSION_MONTHS,
  type LifecycleAssumptions,
} from './lifecycle';

const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 730 / 24;

const assumptions: LifecycleAssumptions = {
  ttfiMonths: 6,
  rampMonths: 6,
  mtbiDays: 24,
  recoveryHours: 12,
  lifeMonths: 48,
  // Comfortably above the fixture's ~$2.78/M tok break-even, so the base case
  // is a fleet that does eventually pay back.
  pricePerMTok: 10,
};

describe('availabilityFromInterrupts', () => {
  it('applies the mtbi / (mtbi + recovery) haircut', () => {
    // 24 days up, 0.5 days down
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
    expect(availabilityFromInterrupts(24, NaN)).toBe(1);
  });

  it('never exceeds 1 or falls to 0', () => {
    expect(availabilityFromInterrupts(1, 1000)).toBeGreaterThan(0);
    expect(availabilityFromInterrupts(1, 1000)).toBeLessThan(1);
  });
});

describe('breakEvenPricePerMTok', () => {
  it('returns the price at which revenue exactly covers cost', () => {
    // 1000 tok/s = 3.6M tok/hr; $36/hr → $10 per M tok
    expect(breakEvenPricePerMTok(36, 1000)).toBeCloseTo(10, 10);
  });

  it('is the price that zeroes the plateau margin', () => {
    const fleetTokPerSec = 1_000_000;
    const costPerHour = 12_345;
    const price = breakEvenPricePerMTok(costPerHour, fleetTokPerSec)!;
    const series = computeLifecycle({
      fleetTokPerSec,
      costPerHour,
      // no interrupt haircut, so plateau revenue is the full rate
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
  const fleetTokPerSec = 1_000_000;
  const costPerHour = 10_000;
  const base = { fleetTokPerSec, costPerHour, assumptions };

  it('derives plateau rates from throughput, price and availability', () => {
    const series = computeLifecycle(base)!;
    const tokensPerDay = fleetTokPerSec * 3600 * HOURS_PER_DAY;
    const expectedRevenue = (tokensPerDay / 1e6) * assumptions.pricePerMTok * (24 / 24.5);
    expect(series.revenuePerDay).toBeCloseTo(expectedRevenue, 6);
    expect(series.costPerDay).toBeCloseTo(costPerHour * HOURS_PER_DAY, 6);
    expect(series.marginPerDay).toBeCloseTo(expectedRevenue - costPerHour * HOURS_PER_DAY, 6);
    expect(series.availability).toBeCloseTo(24 / 24.5, 10);
  });

  it('bills cost but no revenue before first inference', () => {
    const series = computeLifecycle(base)!;
    const preRevenue = series.points.filter((p) => p.month < assumptions.ttfiMonths);
    expect(preRevenue.length).toBeGreaterThan(0);
    for (const p of preRevenue) {
      expect(p.revenue).toBe(0);
      // energised capacity accrues TCO from t=0 — that is what makes payback late
      expect(p.cost).toBeCloseTo(series.costPerDay, 6);
      expect(p.margin).toBeLessThan(0);
    }
  });

  it('ramps revenue monotonically from zero to the plateau rate', () => {
    const series = computeLifecycle(base)!;
    const rampStart = assumptions.ttfiMonths;
    const plateauStart = rampStart + assumptions.rampMonths;
    const ramping = series.points.filter((p) => p.month >= rampStart && p.month <= plateauStart);
    expect(ramping.length).toBeGreaterThan(2);
    for (let i = 1; i < ramping.length; i += 1) {
      expect(ramping[i]!.revenue).toBeGreaterThanOrEqual(ramping[i - 1]!.revenue);
    }
    expect(ramping.at(-1)!.revenue).toBeCloseTo(series.revenuePerDay, 6);
  });

  it('holds the plateau flat at the full rate', () => {
    const series = computeLifecycle(base)!;
    const plateauStart = assumptions.ttfiMonths + assumptions.rampMonths;
    const plateauEnd = plateauStart + assumptions.lifeMonths;
    const plateau = series.points.filter(
      (p) => p.month > plateauStart && p.month < plateauEnd - 0.01,
    );
    expect(plateau.length).toBeGreaterThan(10);
    for (const p of plateau) {
      expect(p.revenue).toBeCloseTo(series.revenuePerDay, 6);
      expect(p.cost).toBeCloseTo(series.costPerDay, 6);
    }
  });

  it('tapers cost with the capacity being powered down, never spiking', () => {
    // Regression: an earlier model billed full cost through decommissioning
    // while revenue fell to zero, producing a large negative transient that
    // dominated the y-axis and was pure artifact.
    const series = computeLifecycle(base)!;
    const worst = Math.min(...series.points.map((p) => p.margin));
    // The most negative rate should be the pre-revenue period, not the tail.
    expect(worst).toBeCloseTo(-series.costPerDay, 6);
    expect(series.points.at(-1)!.cost).toBeCloseTo(0, 6);
    expect(series.points.at(-1)!.revenue).toBeCloseTo(0, 6);
  });

  it('models a window that ends after the decommissioning taper', () => {
    const series = computeLifecycle(base)!;
    const expectedEnd =
      assumptions.ttfiMonths +
      assumptions.rampMonths +
      assumptions.lifeMonths +
      DECOMMISSION_MONTHS;
    expect(series.endMonth).toBe(expectedEnd);
    expect(series.points.at(-1)!.month).toBeCloseTo(expectedEnd, 6);
    expect(series.points[0]!.month).toBe(0);
  });

  it('reports payback only once cumulative margin turns positive', () => {
    const series = computeLifecycle(base)!;
    expect(series.paybackMonth).not.toBeNull();
    // payback cannot precede first revenue
    expect(series.paybackMonth!).toBeGreaterThan(assumptions.ttfiMonths);
    const atPayback = series.points.find((p) => p.month === series.paybackMonth);
    expect(atPayback!.cumulative).toBeGreaterThan(0);
    const before = series.points.filter((p) => p.month < series.paybackMonth!);
    for (const p of before) expect(p.cumulative).toBeLessThanOrEqual(0);
  });

  it('reports no payback for a fleet that never covers its cost', () => {
    const series = computeLifecycle({ ...base, assumptions: { ...assumptions, pricePerMTok: 0 } })!;
    expect(series.paybackMonth).toBeNull();
    expect(series.lifetimeMargin).toBeLessThan(0);
  });

  it('integrates lifetime margin consistently with the plateau rate', () => {
    // With no ramp, no TTFI and no interruptions, lifetime margin is the
    // plateau rate over the life plus the decommissioning tail. Bound it
    // between the plateau contribution and that plus a full-rate tail.
    const series = computeLifecycle({
      ...base,
      assumptions: { ...assumptions, ttfiMonths: 0, rampMonths: 0, mtbiDays: 0 },
    })!;
    const plateauOnly = series.marginPerDay * assumptions.lifeMonths * DAYS_PER_MONTH;
    expect(series.lifetimeMargin).toBeGreaterThan(plateauOnly * 0.99);
    const withFullTail =
      series.marginPerDay * (assumptions.lifeMonths + DECOMMISSION_MONTHS) * DAYS_PER_MONTH;
    expect(series.lifetimeMargin).toBeLessThan(withFullTail);
  });

  it('scales lifetime margin linearly with price above break-even', () => {
    const breakEven = breakEvenPricePerMTok(costPerHour, fleetTokPerSec)!;
    const noHaircut = { ...assumptions, mtbiDays: 0 };
    const at2x = computeLifecycle({
      ...base,
      assumptions: { ...noHaircut, pricePerMTok: breakEven * 2 },
    })!;
    const at3x = computeLifecycle({
      ...base,
      assumptions: { ...noHaircut, pricePerMTok: breakEven * 3 },
    })!;
    expect(at2x.marginPerDay).toBeCloseTo(at2x.costPerDay, 6);
    expect(at3x.marginPerDay).toBeCloseTo(at2x.costPerDay * 2, 6);
    expect(at3x.lifetimeMargin).toBeGreaterThan(at2x.lifetimeMargin);
  });

  it('returns null without throughput, a cost basis or a useful life', () => {
    expect(computeLifecycle({ ...base, fleetTokPerSec: 0 })).toBeNull();
    expect(computeLifecycle({ ...base, fleetTokPerSec: NaN })).toBeNull();
    expect(computeLifecycle({ ...base, costPerHour: NaN })).toBeNull();
    expect(
      computeLifecycle({ ...base, assumptions: { ...assumptions, lifeMonths: 0 } }),
    ).toBeNull();
  });

  it('tolerates a zero-length ramp without dividing by zero', () => {
    const series = computeLifecycle({
      ...base,
      assumptions: { ...assumptions, ttfiMonths: 0, rampMonths: 0 },
    })!;
    expect(series.points.every((p) => Number.isFinite(p.revenue))).toBe(true);
    expect(series.points[0]!.revenue).toBeCloseTo(series.revenuePerDay, 6);
  });
});

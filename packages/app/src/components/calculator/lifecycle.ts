/**
 * Pure fleet lifecycle math — no React, no 'use client'.
 *
 * `fleet.ts` answers "what does this fleet earn and cost per hour, right now?".
 * This answers "what has it earned and cost since the model shipped?" — and the
 * shape of that answer is measured, not assumed.
 *
 * A fixed fleet's revenue is not flat. The chips do not change, but the software
 * serving them does: over the months after a model's release, sweeps find better
 * configs, and each one raises the tokens the same hardware delivers at the same
 * interactivity. MI355X on DeepSeek-V4-Pro is the clearest example — an FP8
 * baseline, then FP4 with graphs and FlashMLA, then AITER GEMMs and Triton SWA,
 * then fused kernels — each step lifting the frontier.
 *
 *   revenue │           ┌────── each step is a config that beat the ones before
 *           │       ┌───┘
 *           │   ,─┘
 *   ────────┼──╯───────────────────────────────  cost: flat, the racks
 *           │ ╱ ramp to full load
 *           └──────────────────────────────────▶  months since model release
 *
 * So revenue ramps to full load, then becomes a staircase over calendar time —
 * one step per measured improvement — while cost is a constant, because the racks
 * bill the same whatever the software does. That makes the gap between them the
 * return on software progress, which is the thing no single benchmark date can
 * show.
 *
 * The ramp and the steps compose rather than sit end to end: the ramp is a
 * fraction of full load, and it scales whichever config is in force. A step that
 * lands mid-ramp is still a step.
 *
 * Three conventions worth stating:
 *
 * 1. **Cost is flat, including through the ramp.** It is `chips x $/chip/hr`, and
 *    neither term moves when a config improves. Racks bill from the moment they
 *    are energised, not from the moment they are fully loaded, so the ramp is paid
 *    for in full while it earns a fraction. Early months are therefore underwater
 *    at prices the later configs clear comfortably — that is the shape, not a bug.
 * 2. **The ramp is an assumption; the steps are not.** Ramp length is a user
 *    input, defaulting to a nominal quarter. It is measured from the fleet's first
 *    measured config, because that is when this hardware started serving.
 * 3. **Interrupts are an availability haircut, not drawn events.** A 24-day MTBI
 *    over a multi-year window is thousands of events, each far under a pixel, so
 *    drawing them is aliasing noise. They scale revenue instead.
 *
 * The lifecycle assumptions here (price, MTBI, recovery, horizon) are user
 * inputs, and callers must present them as such. The throughput steps are not:
 * they are measured.
 */

/** 24h × 365d ÷ 12 — matches `HOURS_PER_MONTH` in fleet.ts. */
const HOURS_PER_MONTH = 730;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = HOURS_PER_MONTH / HOURS_PER_DAY;
const TOKENS_PER_MILLION = 1e6;
const SECONDS_PER_DAY = 86_400;

export interface LifecycleAssumptions {
  /** Mean time between interruptions, in days. Zero means none modelled. */
  mtbiDays: number;
  /** Hours to recover from one interruption. */
  recoveryHours: number;
  /** Sale price of output tokens, $/M tok. Defaults to break-even upstream. */
  pricePerMTok: number;
  /**
   * Months to bring the fleet to full load from its first measured config. Zero
   * means "already at full load". This is an assumption, not a measurement.
   */
  rampMonths: number;
}

/**
 * A measured config improvement: from `month` onwards, the fleet serves
 * `fleetTokPerSec` until the next step.
 */
export interface ThroughputStep {
  /** Months since the anchor date (the model's release), >= 0. */
  month: number;
  /** Fleet throughput for the selected token type once this config lands. */
  fleetTokPerSec: number;
}

export interface LifecycleInputs {
  /**
   * Chronological, non-empty. The first step's month is when this hardware was
   * first measured on the model — before that there is no data, so no line.
   */
  steps: readonly ThroughputStep[];
  /** Fleet TCO for the selected tier ($/hr). Constant: configs don't change it. */
  costPerHour: number;
  /** End of the modelled window, months since the anchor. */
  horizonMonths: number;
  assumptions: LifecycleAssumptions;
}

export interface LifecyclePoint {
  /** Months since the anchor date. */
  month: number;
  /** Revenue rate, $/day. */
  revenue: number;
  /** Cost rate, $/day. */
  cost: number;
  /** revenue − cost, $/day. */
  margin: number;
  /** Cumulative margin from the first step to here, $. */
  cumulative: number;
  /** True at the instant a new config takes effect — the riser of the step. */
  isStep: boolean;
  /**
   * True while the fleet is still ramping to full load. The ramp is a continuous
   * curve, unlike the steps, so the chart draws it as its own segment.
   */
  isRamp: boolean;
}

export interface LifecycleSeries {
  /**
   * One point per step, one per ramp sample, and a closing point at the horizon.
   * With `curveStepAfter` a value holds until the next x, so the steps need no
   * duplicated tread points.
   */
  points: LifecyclePoint[];
  /** Revenue at the latest config, $/day. */
  revenuePerDay: number;
  /** Revenue at the first measured config, $/day. */
  firstRevenuePerDay: number;
  /** Flat cost rate, $/day. */
  costPerDay: number;
  /** Margin at the latest config, $/day. */
  marginPerDay: number;
  /** Margin at the first measured config, $/day. */
  firstMarginPerDay: number;
  /** Latest revenue ÷ first revenue — what software progress has been worth. */
  improvementFactor: number;
  availability: number;
  /** Months since the anchor at which cumulative margin first turns positive. */
  paybackMonth: number | null;
  /** Cumulative margin over the whole window, $. */
  lifetimeMargin: number;
  /** Month of the first measured config. */
  startMonth: number;
  endMonth: number;
  /** Month the ramp completes. Equals `startMonth` when no ramp is modelled. */
  rampEndMonth: number;
  /** Number of measured improvements, i.e. steps after the first. */
  improvementCount: number;
}

/**
 * Fraction of wall-clock time the fleet is serving traffic.
 *
 *   availability = mtbi / (mtbi + recovery)
 *
 * with both terms in days. A zero or negative MTBI means "no interruptions
 * modelled" (1), not "always down" — the input is an optional refinement, and
 * treating a blank field as total failure would be a hostile default.
 */
export function availabilityFromInterrupts(mtbiDays: number, recoveryHours: number): number {
  if (!Number.isFinite(mtbiDays) || mtbiDays <= 0) return 1;
  if (!Number.isFinite(recoveryHours) || recoveryHours <= 0) return 1;
  return mtbiDays / (mtbiDays + recoveryHours / HOURS_PER_DAY);
}

/**
 * Price at which revenue exactly covers cost at a given throughput, $/M tok.
 *
 * Derived from the fleet's own cost and throughput, so the margin this module
 * plots is exactly zero at this price.
 */
export function breakEvenPricePerMTok(costPerHour: number, fleetTokPerSec: number): number | null {
  if (!(fleetTokPerSec > 0) || !Number.isFinite(costPerHour)) return null;
  return (costPerHour / (fleetTokPerSec * 3600)) * TOKENS_PER_MILLION;
}

/** Revenue rate in $/day for a throughput, price and availability. */
function revenuePerDayFor(
  fleetTokPerSec: number,
  pricePerMTok: number,
  availability: number,
): number {
  return ((fleetTokPerSec * SECONDS_PER_DAY) / TOKENS_PER_MILLION) * pricePerMTok * availability;
}

/** Samples across the ramp. Enough that a smoothstep reads as a curve, not stairs. */
const RAMP_SAMPLES = 24;

/** Smoothstep: eases in and out, so the ramp has no kink at either end. */
function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Fraction of full load the fleet is carrying at `month`.
 *
 * The ramp is measured from the fleet's first measured config, not from the
 * model's release: that is when this hardware started serving, and a chip first
 * benchmarked three months in did not spend those three months ramping.
 */
export function rampFractionAt(month: number, startMonth: number, rampMonths: number): number {
  if (!Number.isFinite(rampMonths) || rampMonths <= 0) return 1;
  return smoothstep((month - startMonth) / rampMonths);
}

/**
 * Returns null when the projection is meaningless: no steps, no cost basis, or a
 * horizon that ends before the first measured config.
 */
export function computeLifecycle(inputs: LifecycleInputs): LifecycleSeries | null {
  const { steps, costPerHour, horizonMonths, assumptions } = inputs;
  if (steps.length === 0 || !Number.isFinite(costPerHour)) return null;

  const ordered = [...steps]
    .filter((s) => Number.isFinite(s.month) && s.fleetTokPerSec > 0)
    .toSorted((a, b) => a.month - b.month);
  if (ordered.length === 0) return null;

  const startMonth = ordered[0]!.month;
  const endMonth = Math.max(horizonMonths, startMonth);
  if (!(endMonth > startMonth)) return null;

  const availability = availabilityFromInterrupts(assumptions.mtbiDays, assumptions.recoveryHours);
  const price =
    Number.isFinite(assumptions.pricePerMTok) && assumptions.pricePerMTok > 0
      ? assumptions.pricePerMTok
      : 0;
  const costPerDay = costPerHour * HOURS_PER_DAY;
  const rampMonths =
    Number.isFinite(assumptions.rampMonths) && assumptions.rampMonths > 0
      ? assumptions.rampMonths
      : 0;
  const rampEndMonth = Math.min(startMonth + rampMonths, endMonth);

  const applied = ordered.filter((s) => s.month < endMonth);
  if (applied.length === 0) return null;

  /** The config in force at `month` — the last one to have landed by then. */
  const rateAt = (month: number): number => {
    let rate = applied[0]!.fleetTokPerSec;
    for (const step of applied) {
      if (step.month > month) break;
      rate = step.fleetTokPerSec;
    }
    return rate;
  };

  // Breakpoints: every step, the horizon, and enough samples across the ramp for
  // it to read as a curve. Steps inside the ramp still show as steps — the ramp
  // scales whatever config is in force rather than replacing it.
  const months = new Map<number, boolean>();
  const mark = (month: number, isStep: boolean) =>
    months.set(month, (months.get(month) ?? false) || isStep);

  mark(startMonth, true);
  if (rampEndMonth > startMonth) {
    for (let i = 1; i <= RAMP_SAMPLES; i += 1) {
      mark(startMonth + ((rampEndMonth - startMonth) * i) / RAMP_SAMPLES, false);
    }
  }
  for (const step of applied) mark(step.month, true);
  mark(endMonth, false);

  const ordinates = [...months.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([month, isStep]) => {
      const fraction = rampFractionAt(month, startMonth, rampMonths);
      const revenue = revenuePerDayFor(rateAt(month), price, availability) * fraction;
      return { month, isStep, fraction, revenue };
    });

  const points: LifecyclePoint[] = [];
  let cumulative = 0;
  let paybackMonth: number | null = null;

  for (let i = 0; i < ordinates.length; i += 1) {
    const here = ordinates[i]!;
    if (i > 0) {
      const prev = ordinates[i - 1]!;
      // Over [prev, here) the config in force is the one that held at `prev`,
      // while the ramp fraction moves continuously — so hold the rate and average
      // the fraction. Averaging the revenues instead would credit a step's new
      // config for the stretch before it landed.
      const heldRevenue =
        revenuePerDayFor(rateAt(prev.month), price, availability) *
        ((prev.fraction + here.fraction) / 2);
      const margin = heldRevenue - costPerDay;
      const days = (here.month - prev.month) * DAYS_PER_MONTH;
      const before = cumulative;
      cumulative += margin * days;
      if (paybackMonth === null && before <= 0 && cumulative > 0 && margin > 0) {
        // -before / margin is the days still owed at `prev`; convert to months.
        paybackMonth = prev.month + -before / margin / DAYS_PER_MONTH;
      }
    }
    points.push({
      month: here.month,
      revenue: here.revenue,
      cost: costPerDay,
      margin: here.revenue - costPerDay,
      cumulative,
      isStep: here.isStep,
      isRamp: here.month < rampEndMonth,
    });
  }

  if (points.length === 0) return null;

  const firstTput = applied[0]!.fleetTokPerSec;
  const lastApplied = applied.at(-1)!;
  // Reported rates are what the fleet earns at the end of the window — which is
  // the latest config at whatever load it has reached by then.
  const last = points.at(-1)!;
  const revenuePerDay = last.revenue;
  const firstRevenuePerDay = revenuePerDayFor(firstTput, price, availability);

  return {
    points,
    revenuePerDay,
    firstRevenuePerDay,
    costPerDay,
    marginPerDay: revenuePerDay - costPerDay,
    firstMarginPerDay: firstRevenuePerDay - costPerDay,
    improvementFactor: firstTput > 0 ? lastApplied.fleetTokPerSec / firstTput : 1,
    availability,
    paybackMonth,
    lifetimeMargin: cumulative,
    startMonth,
    endMonth,
    rampEndMonth,
    improvementCount: Math.max(0, applied.length - 1),
  };
}

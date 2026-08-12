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
 *   revenue │        ┌────── each step is a config that beat the ones before
 *           │    ┌───┘
 *           │ ┌──┘
 *   ────────┼─┴─────────────────────────────────  cost: flat, the racks
 *           └──────────────────────────────────▶  months since model release
 *
 * So revenue is a staircase over calendar time, one step per measured
 * improvement, and cost is a constant — the racks bill the same whatever the
 * software does. That makes the gap between them the return on software
 * progress, which is the thing no single benchmark date can show.
 *
 * Two conventions worth stating:
 *
 * 1. **Cost is flat.** It is `chips x $/chip/hr`, and neither term moves when a
 *    config improves. Early months can therefore be underwater at a price the
 *    later configs clear comfortably.
 * 2. **Interrupts are an availability haircut, not drawn events.** A 24-day MTBI
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
}

export interface LifecycleSeries {
  /** Two points per step (riser + tread) so a step renders square. */
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

  const points: LifecyclePoint[] = [];
  let cumulative = 0;
  let paybackMonth: number | null = null;

  const push = (month: number, fleetTokPerSec: number, isStep: boolean) => {
    const revenue = revenuePerDayFor(fleetTokPerSec, price, availability);
    points.push({
      month,
      revenue,
      cost: costPerDay,
      margin: revenue - costPerDay,
      cumulative,
      isStep,
    });
  };

  for (let i = 0; i < ordered.length; i += 1) {
    const step = ordered[i]!;
    if (step.month >= endMonth) break;
    const next = ordered[i + 1];
    // A config holds until the next one lands, or until the horizon.
    const until = next && next.month < endMonth ? next.month : endMonth;

    // Riser: the new config takes effect at this instant.
    push(step.month, step.fleetTokPerSec, true);

    // Accrue the flat stretch this config serves, then emit its far end.
    const margin = revenuePerDayFor(step.fleetTokPerSec, price, availability) - costPerDay;
    cumulative += margin * (until - step.month) * DAYS_PER_MONTH;

    if (paybackMonth === null && cumulative > 0 && margin > 0) {
      // Solve for the instant within this stretch where cumulative crosses zero.
      const beforeStretch = cumulative - margin * (until - step.month) * DAYS_PER_MONTH;
      paybackMonth = step.month + -beforeStretch / (margin * DAYS_PER_MONTH);
    }

    push(until, step.fleetTokPerSec, false);
  }

  if (points.length === 0) return null;

  const firstTput = ordered[0]!.fleetTokPerSec;
  const lastApplied = ordered.filter((s) => s.month < endMonth).at(-1) ?? ordered[0]!;
  const revenuePerDay = revenuePerDayFor(lastApplied.fleetTokPerSec, price, availability);
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
    improvementCount: Math.max(0, ordered.filter((s) => s.month < endMonth).length - 1),
  };
}

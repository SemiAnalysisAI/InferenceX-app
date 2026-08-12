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
 *   revenue │              ,──── each config rolls out to its own numbers
 *           │         ,───╯
 *           │    ,───╯
 *   ────────┼──╱──────────────────────────────  cost: flat once built out
 *           │ ╱ first rollout also energises the racks
 *           └──────────────────────────────────▶  months since model release
 *
 * A config does not take effect the instant a sweep finds it: it is rolled out.
 * So every config gets its own ramp, climbing from whatever the fleet was already
 * serving to that config's numbers. The first config climbs from zero, and that
 * first rollout is also when the racks are energised — so cost ramps with it and
 * the fleet starts at exactly zero rather than at a full-cost deficit.
 *
 * After the buildout cost is constant: later rollouts are software landing on
 * chips that are already billing. That makes the gap between the lines the return
 * on software progress, which is the thing no single benchmark date can show.
 *
 * Three conventions worth stating:
 *
 * 1. **Cost tracks energised capacity, then holds flat.** It is
 *    `chips x $/chip/hr`, and capacity is bought once — so cost ramps only over
 *    the first rollout and neither term moves when a config improves afterwards.
 *    Because revenue and cost ramp together, margin during the buildout is simply
 *    a fraction of the steady-state margin, and the line opens at zero.
 * 2. **The ramp is an assumption; the steps are not.** Ramp length is a user
 *    input, defaulting to a nominal quarter, and it applies to every rollout.
 *    Which configs exist, when, and how fast they ran are all measured.
 * 3. **Interrupts are an availability haircut, not drawn events.** A 24-day MTBI
 *    over a multi-year window is thousands of events, each far under a pixel, so
 *    drawing them is aliasing noise. They scale revenue instead.
 *
 * The lifecycle assumptions here (price, ramp, MTBI, recovery, horizon) are user
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
   * Months for a config to roll out across the fleet. Applies to every config;
   * on the first it also covers energising the racks. Zero means each config
   * takes effect instantly. An assumption, not a measurement.
   */
  rampMonths: number;
}

/**
 * A measured config improvement: from `month` onwards the fleet rolls out to
 * `fleetTokPerSec`, and holds it until the next step.
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
  /** Fleet TCO for the selected tier ($/hr) at full capacity. Configs don't move it. */
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
  /** True while a rollout is still climbing, i.e. not yet at its config's rate. */
  isRamp: boolean;
}

export interface LifecycleSeries {
  /**
   * Densely sampled across every rollout, plus the flat stretch each config holds
   * and a closing point at the horizon. Interpolate linearly to draw them: the
   * shape is already in the samples.
   */
  points: LifecyclePoint[];
  /** Revenue at the latest config, $/day. */
  revenuePerDay: number;
  /** Revenue at the first measured config, $/day. */
  firstRevenuePerDay: number;
  /** Cost rate once the fleet is built out, $/day. Flat from then on. */
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
  /**
   * Month the first rollout completes — i.e. when the fleet is fully energised.
   * Equals `startMonth` when no ramp is modelled. Later rollouts have their own
   * windows; this one is called out because it is the only one that moves cost.
   */
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

/** Samples per rollout. Enough that a smoothstep reads as a curve, not stairs. */
const RAMP_SAMPLES = 24;

/** Smoothstep: eases in and out, so the ramp has no kink at either end. */
function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Progress through a ramp that began at `startMonth`, in [0, 1].
 *
 * Used twice: once per config rollout, and once for the capacity buildout that
 * rides along with the first rollout. Ramps are timed from the event that starts
 * them — a config lands and then rolls out — never from the model's release.
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

  /**
   * One rollout per config: when it lands, the fleet climbs from whatever it was
   * already serving to that config's numbers over the ramp window. `from` is the
   * level actually reached by the previous rollout, so a config landing before the
   * previous one finished rolling out starts from there rather than jumping.
   */
  const rollouts: { start: number; end: number; from: number; to: number }[] = [];
  for (const step of applied) {
    const previous = rollouts.at(-1);
    const from = previous ? levelWithin(previous, step.month) : 0;
    rollouts.push({
      start: step.month,
      end: Math.min(step.month + rampMonths, endMonth),
      from,
      to: step.fleetTokPerSec,
    });
  }

  /** Throughput at `month` within one rollout, clamped to its end level. */
  function levelWithin(
    rollout: { start: number; end: number; from: number; to: number },
    month: number,
  ): number {
    const fraction = rampFractionAt(month, rollout.start, rampMonths);
    return rollout.from + (rollout.to - rollout.from) * fraction;
  }

  // Capacity is bought once, so only the first rollout energises racks. Later
  // rollouts are software landing on chips that are already billing.
  const capacityAt = (month: number) => rampFractionAt(month, startMonth, rampMonths);

  // Build the samples in order: each rollout contributes its ramp, then the flat
  // stretch it holds until the next one lands.
  const samples: { month: number; level: number; isStep: boolean; isRamp: boolean }[] = [];
  for (let i = 0; i < rollouts.length; i += 1) {
    const rollout = rollouts[i]!;
    const next = rollouts[i + 1];
    const holdUntil = next ? Math.min(next.start, endMonth) : endMonth;
    const rampEnd = Math.min(rollout.end, holdUntil);

    if (rampEnd > rollout.start) {
      for (let s = 0; s <= RAMP_SAMPLES; s += 1) {
        const month = rollout.start + ((rampEnd - rollout.start) * s) / RAMP_SAMPLES;
        samples.push({
          month,
          level: levelWithin(rollout, month),
          isStep: s === 0,
          isRamp: s < RAMP_SAMPLES,
        });
      }
    } else {
      // No ramp window at all: emit the incumbent level at this instant first so
      // the line rises vertically instead of sloping into the new config.
      if (i > 0)
        samples.push({ month: rollout.start, level: rollout.from, isStep: false, isRamp: false });
      samples.push({ month: rollout.start, level: rollout.to, isStep: true, isRamp: false });
    }

    if (holdUntil > rampEnd) {
      samples.push({
        month: holdUntil,
        level: levelWithin(rollout, rampEnd),
        isStep: false,
        isRamp: false,
      });
    }
  }

  const points: LifecyclePoint[] = [];
  let cumulative = 0;
  let paybackMonth: number | null = null;

  const rateOf = (sample: { month: number; level: number }) => ({
    revenue: revenuePerDayFor(sample.level, price, availability),
    cost: costPerDay * capacityAt(sample.month),
  });

  for (let i = 0; i < samples.length; i += 1) {
    const here = samples[i]!;
    const { revenue, cost } = rateOf(here);
    if (i > 0) {
      const prev = samples[i - 1]!;
      // Both revenue and cost vary continuously between samples, so trapezoid.
      // Sample density is what makes this accurate; a forced vertical shares its
      // month with the previous sample and so contributes nothing.
      const previous = rateOf(prev);
      const margin = (previous.revenue - previous.cost + (revenue - cost)) / 2;
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
      revenue,
      cost,
      margin: revenue - cost,
      cumulative,
      isStep: here.isStep,
      isRamp: here.isRamp,
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

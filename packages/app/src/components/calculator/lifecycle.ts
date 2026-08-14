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
 *   ────────┼──╱──────────────────────────────  cost: flat, the racks
 *           │ ╱ the first config rolls out from zero
 *           └──────────────────────────────────▶  months since model release
 *
 * A config does not take effect the instant a sweep finds it: it is rolled out.
 * So every config gets its own ramp, climbing from whatever the fleet was already
 * serving to that config's numbers. The first config climbs from zero — nothing is
 * being served before it lands.
 *
 * Cost is constant throughout, so the gap between the lines is the return on
 * software progress, which is the thing no single benchmark date can show.
 *
 * Three conventions worth stating:
 *
 * 1. **Cost is flat, including through every rollout.** It is `chips x $/chip/hr`,
 *    and neither term moves when a config rolls out — racks bill from the moment
 *    they are energised, not from the moment they are loaded. So the first rollout
 *    is paid for in full while it earns its way up from zero, which is what puts
 *    the opening months below the rule and gives payback its meaning.
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
   * Months for a config to roll out across the fleet. Applies to every config,
   * including the first, which rolls out from zero. Zero means each config takes
   * effect instantly. An assumption, not a measurement.
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
  /**
   * Cumulative *revenue* from the first step to here, $ — the area under the
   * revenue curve, with no cost subtracted.
   *
   * Separate from `cumulative` rather than derived from it, because
   * `cumulative + cost x elapsed` only reproduces it when the two are integrated
   * over identical intervals, and a caller reading at an arbitrary month has no
   * elapsed term to hand. Accumulated by the same trapezoid rule so the two agree
   * exactly at every sample.
   */
  cumulativeRevenue: number;
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
  /**
   * Revenue at the end of the window, $/day — the latest config at whatever level
   * its rollout has reached by then. Equal to that config's full rate only if the
   * rollout finished before the horizon and no later config pre-empted it.
   */
  revenuePerDay: number;
  /**
   * Revenue at the first measured config's full rate, $/day. A rollout still
   * climbing when the next config lands never attains it; it is the rate that
   * config was measured at, which is what makes it comparable across chips.
   */
  firstRevenuePerDay: number;
  /** Flat cost rate, $/day. */
  costPerDay: number;
  /** `revenuePerDay` − cost, $/day. */
  marginPerDay: number;
  /** `firstRevenuePerDay` − cost, $/day. */
  firstMarginPerDay: number;
  /**
   * Latest config's throughput ÷ the first's — what software progress has been
   * worth. A ratio of measured rates, deliberately independent of the rollout
   * assumption, so it does not move when the ramp input changes.
   */
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
   * Month the first rollout completes — when the opening config is fully deployed.
   * Equals `startMonth` when no ramp is modelled. Later rollouts have their own
   * windows; this one is called out because it is where revenue leaves zero.
   */
  rampEndMonth: number;
  /** Number of measured improvements, i.e. steps after the first. */
  improvementCount: number;
}

/**
 * What a view plots. `margin` and `revenue` are rates in $/day; `cumulativeRevenue`
 * is the area under the revenue curve since the fleet's first config, in $.
 *
 * Lives here rather than in a chart component because both the 2D chart and the 3D
 * surface select on it, and the surface's grid builder is pure.
 *
 * Note the unit change: a caller that formats an axis or a tooltip must ask
 * `isCumulative` rather than assume $/day, and anything anchored to zero as
 * break-even (the 2D rule, the 3D plane) applies to `margin` alone.
 */
export type LifecycleMetric = 'margin' | 'revenue' | 'cumulativeRevenue';

/** True when the metric is a running total in $ rather than a rate in $/day. */
export function isCumulative(metric: LifecycleMetric): boolean {
  return metric === 'cumulativeRevenue';
}

/** The quantity a metric names, for reading off a sampled point. */
export function metricValue(point: LifecyclePoint, metric: LifecycleMetric): number {
  if (metric === 'revenue') return point.revenue;
  if (metric === 'cumulativeRevenue') return point.cumulativeRevenue;
  return point.margin;
}

/**
 * A sampled series' value at an arbitrary month, or null outside its own window.
 *
 * Linear between samples, which is exactly what a `curveLinear` line draws through
 * them — so a readout built on this always agrees with the pixel under the cursor.
 * Null rather than a clamp at the ends: a chip first measured a year after release
 * has no line before then, and so no number either.
 */
export function valueAtMonth(
  points: readonly LifecyclePoint[],
  month: number,
  pick: (point: LifecyclePoint) => number,
): number | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  if (month < first.month || month > last.month) return null;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid]!.month <= month) lo = mid;
    else hi = mid - 1;
  }
  const before = points[lo]!;
  const after = points[Math.min(lo + 1, points.length - 1)]!;
  const span = after.month - before.month;
  const t = span > 0 ? (month - before.month) / span : 0;
  const a = pick(before);
  return a + (pick(after) - a) * t;
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
 * plots is exactly zero at this price — which is why `availability` belongs here.
 * Interrupts cost the same racks fewer billable tokens, so the break-even price
 * rises by exactly the haircut; ignoring it returns a price at which this
 * module's own margin is negative.
 */
export function breakEvenPricePerMTok(
  costPerHour: number,
  fleetTokPerSec: number,
  availability = 1,
): number | null {
  if (!(fleetTokPerSec > 0) || !Number.isFinite(costPerHour)) return null;
  if (!(availability > 0) || !Number.isFinite(availability)) return null;
  return (costPerHour / (fleetTokPerSec * 3600 * availability)) * TOKENS_PER_MILLION;
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

  const sorted = [...steps]
    .filter((s) => Number.isFinite(s.month) && s.fleetTokPerSec > 0)
    .toSorted((a, b) => a.month - b.month);
  if (sorted.length === 0) return null;

  // Two configs can land in the same month — the progression feeding this keeps
  // every rung that beat the incumbent, and same-day rungs share a month. Only
  // the best of them ever serves traffic, so collapse them. Emitting both would
  // give the superseded config a zero-width rollout, which spikes the line to a
  // full rate the fleet never reached and marks two risers at one instant.
  const ordered: ThroughputStep[] = [];
  for (const step of sorted) {
    const previous = ordered.at(-1);
    if (previous && previous.month === step.month) {
      if (step.fleetTokPerSec > previous.fleetTokPerSec) ordered[ordered.length - 1] = step;
      continue;
    }
    ordered.push(step);
  }

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
          // A rollout cut short by the next config is still climbing at its last
          // sample, so the flag follows the level, not the sample index.
          isRamp: s < RAMP_SAMPLES || rampEnd < rollout.end,
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
  let cumulativeRevenue = 0;
  let paybackMonth: number | null = null;

  const revenueOf = (sample: { level: number }) =>
    revenuePerDayFor(sample.level, price, availability);

  for (let i = 0; i < samples.length; i += 1) {
    const here = samples[i]!;
    const revenue = revenueOf(here);
    const cost = costPerDay;
    if (i > 0) {
      const prev = samples[i - 1]!;
      // Revenue varies continuously between samples while cost does not, so
      // trapezoid the revenue and subtract the flat cost. Sample density is what
      // makes this accurate; a forced vertical shares its month with the previous
      // sample and so contributes nothing.
      const meanRevenue = (revenueOf(prev) + revenue) / 2;
      const margin = meanRevenue - costPerDay;
      const days = (here.month - prev.month) * DAYS_PER_MONTH;
      const before = cumulative;
      cumulative += margin * days;
      // Same interval, same trapezoid: the two running totals stay exactly one
      // flat cost apart, which is what makes them comparable on one chart.
      cumulativeRevenue += meanRevenue * days;
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
      cumulativeRevenue,
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

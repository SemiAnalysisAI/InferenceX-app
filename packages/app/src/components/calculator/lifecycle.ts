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

const HOURS_PER_DAY = 24;

/**
 * Calendar month, in days — 365.25 ÷ 12.
 *
 * Deliberately not `HOURS_PER_MONTH / 24`. That constant is 730 (a flat 365-day
 * year), which is the right convention for `costPerMonth` in fleet.ts, where it
 * is a billing figure. It is the wrong one here: the x axis converts dates to
 * months with 365.25 ÷ 12 (`MS_PER_MONTH` below), and this constant converts
 * those months back to days to integrate. Two calendars across one round trip
 * understated every interval by 0.068% — small, but it is the only conversion
 * factor in the model that existed twice with two values, and the integral it
 * feeds is the section's headline number.
 */
export const DAYS_PER_MONTH = 365.25 / 12;

/** The same month, in milliseconds. Shared so the axis and the integral agree. */
export const MS_PER_MONTH = DAYS_PER_MONTH * HOURS_PER_DAY * 3600 * 1000;

const TOKENS_PER_MILLION = 1e6;
const SECONDS_PER_DAY = 86_400;

/**
 * Input tokens an operator can charge the fresh-token price for, tok/s.
 *
 * Agentic traces run at a median 133:1 input:output token ratio with a median
 * 92% prefix-cache hit rate, and providers bill a cache read at a fraction of a
 * fresh input token. Charging one blended price against the raw token rate
 * therefore overstates agentic margin by close to an order of magnitude. Fixed
 * sequences carry no cache metric on any row, so `cacheHitRate` is undefined
 * there and this returns `base` untouched.
 *
 * Expressed as a *subtraction* from the caller's throughput rather than as
 * `output + billableInput`, so the result is exactly `base` whenever there is
 * nothing to discount — no rounding drift against the independently splined
 * total, and no behaviour change outside agentic traces by construction rather
 * than by luck.
 *
 * @param base           tok/s for the selected token type — the undiscounted rate.
 * @param inputTput      tok/s of input tokens, the only stream a cache can serve.
 * @param cacheHitRate   cached fraction of those input tokens, or undefined when unmeasured.
 * @param cacheReadRatio price of a cached token as a fraction of a fresh one (1 = no discount).
 */
export function billableInputRate(
  inputTput: number,
  cacheHitRate: number | undefined,
  cacheReadRatio: number,
): number {
  if (!Number.isFinite(inputTput) || inputTput <= 0) return 0;
  if (typeof cacheHitRate !== 'number' || !Number.isFinite(cacheHitRate)) return inputTput;
  const hit = Math.max(0, Math.min(1, cacheHitRate));
  const ratio = Math.max(0, Math.min(1, cacheReadRatio));
  // A cache read still sells, just for less: `hit` of the stream at `ratio` of
  // the price is the same revenue as `hit * ratio` of the stream at full price.
  return inputTput * (1 - hit * (1 - ratio));
}

export interface LifecycleAssumptions {
  /** Mean time between interruptions, in days. Zero means none modelled. */
  mtbiDays: number;
  /** Hours to recover from one interruption. */
  recoveryHours: number;
  /**
   * Sale price of input tokens, $/M tok. Defaults to break-even upstream.
   *
   * Cached input tokens are already discounted into the step's billable input
   * rate — see {@link billableInputRate} — so this is the fresh-token price.
   */
  inputPricePerMTok: number;
  /**
   * Sale price of output tokens, $/M tok. Separate because providers bill them
   * at a multiple of input, and the two streams are wildly unequal: 8:1 on a
   * fixed 8k/1k sequence and ~130:1 on agentic traces, so a single blended price
   * hides which side of the workload the money is actually on.
   */
  outputPricePerMTok: number;
  /**
   * Months for a config to roll out across the fleet. Applies to every config,
   * including the first, which rolls out from zero. Zero means each config takes
   * effect instantly. An assumption, not a measurement.
   */
  rampMonths: number;
}

/**
 * A measured config improvement: from `month` onwards the fleet rolls out to
 * `billableTokPerSec`, and holds it until the next step.
 */
export interface ThroughputStep {
  /** Months since the anchor date (the model's release), >= 0. */
  month: number;
  /**
   * Fleet input tokens once this config lands, tok/s, already reduced for the
   * share served from cache — see {@link billableInputRate}.
   *
   * Deliberately not named `fleetTokPerSec` like {@link FleetStats}: that one is
   * the physical rate the racks deliver, and the two diverge whenever a workload
   * serves input tokens from cache. `FleetStats.fleetTokPerSec` is the physical
   * rate; revenue here is charged on these two.
   */
  billableInputTokPerSec: number;
  /** Fleet output tokens once this config lands, tok/s. Never cached. */
  outputTokPerSec: number;
}

/**
 * The token rate a break-even solve should be handed, given the price ratio the
 * user has set: input tokens plus output tokens weighted by how much more an
 * output token sells for. Feeding this to {@link breakEvenPricePerMTok} returns
 * the input price that zeroes the margin while preserving that ratio.
 */
export function effectiveTokPerSec(
  inputTokPerSec: number,
  outputTokPerSec: number,
  outputPriceMultiple: number,
): number {
  const multiple =
    Number.isFinite(outputPriceMultiple) && outputPriceMultiple > 0 ? outputPriceMultiple : 0;
  return inputTokPerSec + outputTokPerSec * multiple;
}

/**
 * Split a per-chip total token rate into the two streams revenue is charged on.
 *
 * Takes a *share* rather than two rates because the two rates are not always on
 * the same denominator: a disaggregated run reports input per prefill chip and
 * output per decode chip, while the total — the figure the fleet is sized and
 * costed on — is per chip overall. Reading the rates directly billed a
 * disaggregated config for up to 16x the tokens its chips actually served, which
 * put a visible dip in the margin line the moment a later, genuinely better
 * aggregated config took over. See `inputTokenShare` in `useThroughputData.ts`.
 *
 * With no share to hand, nothing is charged as input: understating revenue beats
 * inventing a mix.
 */
export function splitTokenStreams(
  totalTokPerSec: number,
  inputTokenShare: number | undefined,
  cacheHitRate: number | undefined,
  cacheReadRatio: number,
): { billableInputTokPerSec: number; outputTokPerSec: number } {
  if (!Number.isFinite(totalTokPerSec) || totalTokPerSec <= 0) {
    return { billableInputTokPerSec: 0, outputTokPerSec: 0 };
  }
  const share =
    typeof inputTokenShare === 'number' && Number.isFinite(inputTokenShare)
      ? Math.max(0, Math.min(1, inputTokenShare))
      : 0;
  return {
    billableInputTokPerSec: billableInputRate(totalTokPerSec * share, cacheHitRate, cacheReadRatio),
    outputTokPerSec: totalTokPerSec * (1 - share),
  };
}

/**
 * Output tokens per chip **overall**, for a fleet sized on chips overall.
 *
 * `outputThroughput` is per *decode* chip on a disaggregated run, so dividing it
 * into a whole-fleet chip count overstates the output rate by
 * `(prefill + decode) / decode` — a median of 2x and up to 7x in production
 * history. Concurrent users are a count of output streams, so that error lands
 * directly on the figure a reader is most likely to quote.
 *
 * Falls back to the reported rate where no share is known, which is the same
 * number as before for every aggregated run.
 */
export function outputTokPerChip(
  totalTokPerChip: number,
  inputTokenShare: number | undefined,
  reportedOutputTokPerChip: number,
): number {
  if (typeof inputTokenShare !== 'number' || !Number.isFinite(inputTokenShare)) {
    return reportedOutputTokPerChip;
  }
  if (!Number.isFinite(totalTokPerChip) || totalTokPerChip <= 0) return 0;
  return totalTokPerChip * (1 - Math.max(0, Math.min(1, inputTokenShare)));
}

/** A price is only a price when it is finite and positive; anything else is free. */
function nonNegativePrice(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Tokens a step sells per second, both streams. Price-independent. */
function stepTokPerSec(step: ThroughputStep): number {
  return step.billableInputTokPerSec + step.outputTokPerSec;
}

export interface LifecycleInputs {
  /**
   * Chronological, non-empty. The first step's month is when this hardware was
   * first measured on the model — before that there is no data, so no line.
   */
  steps: readonly ThroughputStep[];
  /** Fleet TCO for the selected tier ($/hr). Constant: configs don't change it. */
  costPerHour: number;
  /**
   * Facility power this fleet actually occupies, MW — `chips x kW/chip / 1000`,
   * **not** the budget the user typed. Chip counts are whole, so a fleet fills
   * its budget to within one chip and the remainder is stranded power nobody is
   * paying for capacity in. Dividing by the nominal budget would credit each
   * chip with power it never provisioned.
   *
   * Only used to express the per-MW metrics. Zero or negative leaves those
   * metrics at zero rather than dividing by it.
   */
  provisionedMw: number;
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
  /** Revenue per megawatt provisioned, $/MW/day. */
  revenuePerMw: number;
  /**
   * The same margin per megawatt provisioned, $/MW/day.
   *
   * Worth being clear about what this does and does not add. Every chip in the
   * section is sized to the same power budget, so this is very nearly `margin`
   * divided by a constant and it re-ranks almost nothing — the only spread comes
   * from how completely each chip's power density fills the budget. What it buys
   * is a figure that does not move when the budget does, which is the unit a
   * power-constrained plan is actually written in.
   */
  marginPerMw: number;
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
   * assumption, so it does not move when the ramp input changes — and of both
   * prices, so it stays a statement about the hardware and not about billing.
   * Counted over both token streams.
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
 * What a view plots. `margin` and `revenue` are rates in $/day; their `PerMw`
 * variants divide the same rate by provisioned power. `cumulativeRevenue` is the
 * area under the revenue curve since the fleet's first config, in $.
 *
 * Lives here rather than in a chart component because the selection is pure and
 * the chart is not the only thing that reads it.
 *
 * Note the unit change: a caller that formats an axis or a tooltip must ask
 * `isCumulative` rather than assume $/day, and anything anchored to zero as
 * break-even (the dashed rule) applies to margin metrics alone.
 */
export type LifecycleMetric =
  | 'margin'
  | 'marginPerMw'
  | 'revenue'
  | 'revenuePerMw'
  | 'cumulativeRevenue';

/** True when the metric is a running total in $ rather than a rate in $/day. */
export function isCumulative(metric: LifecycleMetric): boolean {
  return metric === 'cumulativeRevenue';
}

/**
 * True when zero on this metric means break-even, so a view may draw a rule
 * there. Per-MW margin is still revenue − cost, only rescaled by
 * a positive number, so its zero crossing is the same instant as `margin`'s.
 */
export function isBreakEvenAnchored(metric: LifecycleMetric): boolean {
  return metric === 'margin' || metric === 'marginPerMw';
}

/** The quantity a metric names, for reading off a sampled point. */
export function metricValue(point: LifecyclePoint, metric: LifecycleMetric): number {
  if (metric === 'revenue') return point.revenue;
  if (metric === 'revenuePerMw') return point.revenuePerMw;
  if (metric === 'cumulativeRevenue') return point.cumulativeRevenue;
  if (metric === 'marginPerMw') return point.marginPerMw;
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
 *
 * With two prices, break-even is a line rather than a point: any (input, output)
 * pair on it zeroes the margin. Callers resolve that by fixing the ratio between
 * the two and passing the **effective** rate — `billableInput + ratio x output` —
 * which makes the answer the input price, and the output price `ratio x` it. See
 * {@link effectiveTokPerSec}.
 */
export function breakEvenPricePerMTok(
  costPerHour: number,
  tokPerSec: number,
  availability = 1,
): number | null {
  if (!(tokPerSec > 0) || !Number.isFinite(costPerHour)) return null;
  if (!(availability > 0) || !Number.isFinite(availability)) return null;
  return (costPerHour / (tokPerSec * 3600 * availability)) * TOKENS_PER_MILLION;
}

/** Revenue rate in $/day for a throughput, price and availability. */
function revenuePerDayFor(revenuePerSec: number, availability: number): number {
  return revenuePerSec * SECONDS_PER_DAY * availability;
}

/**
 * What a step sells per second, in dollars — the quantity the rollout ramps.
 *
 * Both streams belong to one config and roll out together, so ramping their
 * priced sum is exactly ramping each and pricing after. Carrying one scalar
 * through the integral keeps the trapezoid rule and the payback search unchanged.
 */
function revenuePerSecOf(
  step: ThroughputStep,
  inputPricePerMTok: number,
  outputPricePerMTok: number,
): number {
  return (
    (step.billableInputTokPerSec * inputPricePerMTok + step.outputTokPerSec * outputPricePerMTok) /
    TOKENS_PER_MILLION
  );
}

/**
 * Samples per full ramp window. Enough that a smoothstep reads as a curve rather
 * than stairs. A rollout cut short by the next config gets proportionally fewer,
 * because the cadence is fixed — see the sampling loop.
 */
const RAMP_SAMPLES = 24;

/**
 * Month tolerance for "this sample is already the ramp's end". Guards against
 * emitting a duplicate at `rampEnd` when the cadence happens to land on it.
 */
const EPSILON_MONTHS = 1e-9;

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
  const { steps, costPerHour, provisionedMw, horizonMonths, assumptions } = inputs;
  // Guarded rather than trusted: an unregistered chip or a budget too small for
  // one chip must leave the per-MW metric flat at zero, not NaN or Infinity.
  const perMw = Number.isFinite(provisionedMw) && provisionedMw > 0 ? 1 / provisionedMw : 0;
  if (steps.length === 0 || !Number.isFinite(costPerHour)) return null;

  const sorted = [...steps]
    .filter((s) => Number.isFinite(s.month) && stepTokPerSec(s) > 0)
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
      if (stepTokPerSec(step) > stepTokPerSec(previous)) ordered[ordered.length - 1] = step;
      continue;
    }
    ordered.push(step);
  }

  const startMonth = ordered[0]!.month;
  const endMonth = Math.max(horizonMonths, startMonth);
  if (!(endMonth > startMonth)) return null;

  const availability = availabilityFromInterrupts(assumptions.mtbiDays, assumptions.recoveryHours);
  const inputPrice = nonNegativePrice(assumptions.inputPricePerMTok);
  const outputPrice = nonNegativePrice(assumptions.outputPricePerMTok);
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
      to: revenuePerSecOf(step, inputPrice, outputPrice),
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
      // A fixed cadence anchored at the rollout's start — deliberately not the
      // window divided into a fixed count.
      //
      // `levelWithin` is a smoothstep, which is convex over the first half of its
      // window, so reading between samples with a straight line overestimates by
      // an amount that grows with the spacing. Dividing the window into
      // RAMP_SAMPLES pieces makes that spacing a function of `rampEnd` — and
      // `rampEnd` depends on whether the *next* config is present. One line is
      // self-consistent either way, but two lifecycles built from the same runs
      // at different interactivities would sample the identical governing config
      // on different grids and disagree. A cadence fixed by `rampMonths` — a user
      // assumption, independent of which configs happen to be readable — puts the
      // samples at the same months regardless.
      const spacing = rampMonths / RAMP_SAMPLES;
      let s = 0;
      for (; rollout.start + spacing * s < rampEnd - EPSILON_MONTHS; s += 1) {
        const month = rollout.start + spacing * s;
        samples.push({
          month,
          level: levelWithin(rollout, month),
          isStep: s === 0,
          isRamp: true,
        });
      }
      samples.push({
        month: rampEnd,
        level: levelWithin(rollout, rampEnd),
        isStep: s === 0,
        // A rollout cut short by the next config is still climbing at its last
        // sample, so the flag follows the level, not the sample index.
        isRamp: rampEnd < rollout.end,
      });
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

  // `level` is already dollars per second — see `revenuePerSecOf`.
  const revenueOf = (sample: { level: number }) => revenuePerDayFor(sample.level, availability);

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
      revenuePerMw: revenue * perMw,
      marginPerMw: (revenue - cost) * perMw,
      cumulative,
      cumulativeRevenue,
      isStep: here.isStep,
      isRamp: here.isRamp,
    });
  }

  if (points.length === 0) return null;

  const firstTput = stepTokPerSec(applied[0]!);
  const lastApplied = applied.at(-1)!;
  // Reported rates are what the fleet earns at the end of the window — which is
  // the latest config at whatever load it has reached by then.
  const last = points.at(-1)!;
  const revenuePerDay = last.revenue;
  const firstRevenuePerDay = revenuePerDayFor(
    revenuePerSecOf(applied[0]!, inputPrice, outputPrice),
    availability,
  );

  return {
    points,
    revenuePerDay,
    firstRevenuePerDay,
    costPerDay,
    marginPerDay: revenuePerDay - costPerDay,
    firstMarginPerDay: firstRevenuePerDay - costPerDay,
    improvementFactor: firstTput > 0 ? stepTokPerSec(lastApplied) / firstTput : 1,
    availability,
    paybackMonth,
    lifetimeMargin: cumulative,
    startMonth,
    endMonth,
    rampEndMonth,
    improvementCount: Math.max(0, applied.length - 1),
  };
}

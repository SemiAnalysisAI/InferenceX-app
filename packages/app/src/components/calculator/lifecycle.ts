/**
 * Pure fleet lifecycle math — no React, no 'use client'.
 *
 * `fleet.ts` answers "what does this fleet earn and cost per hour, right now?".
 * This answers "what does it earn and cost across its life?" — the shape around
 * the operating point rather than the operating point itself:
 *
 *   ├─ TTFI ──┤├─ ramp ─┤├────────── plateau ──────────┤├─ decom ─┤
 *   nothing    revenue    revenue at full rate, less     racks
 *   billable   ramps up   the interrupt haircut          power down
 *
 * Two conventions the numbers depend on, both deliberate:
 *
 * 1. **Cost tracks energised capacity, not utilisation.** Racks bill from the
 *    moment they are powered, so cost is at full rate through the ramp — before
 *    a single token is sold — and tapers only as they are decommissioned. This
 *    is what makes the early months negative, which is the point of the chart.
 * 2. **Interrupts are an availability haircut, not drawn events.** A 24-day
 *    MTBI over a 5-year life is ~75 interrupts; at any sane chart width each is
 *    far under a pixel, so drawing them produces aliasing noise rather than
 *    information. They scale the plateau instead.
 *
 * None of the lifecycle assumptions come from a benchmark — they are user
 * inputs, and callers must present them as such.
 */

/** 24h × 365d ÷ 12 — matches `HOURS_PER_MONTH` in fleet.ts. */
const HOURS_PER_MONTH = 730;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = HOURS_PER_MONTH / HOURS_PER_DAY;
const TOKENS_PER_MILLION = 1e6;

/** Months spent powering down at end of life, over which cost tapers to zero. */
export const DECOMMISSION_MONTHS = 4;

/** Samples per month. 4 keeps ~250 points over a 5-year life — enough for a smooth ramp. */
const SAMPLES_PER_MONTH = 4;

export interface LifecycleAssumptions {
  /** Months from order to first billable inference. Revenue is zero before this. */
  ttfiMonths: number;
  /** Months from first token to full rate, as capacity and utilisation ramp. */
  rampMonths: number;
  /** Mean time between interruptions, in days. */
  mtbiDays: number;
  /** Hours to recover from one interruption. */
  recoveryHours: number;
  /** Months of useful service at full rate, after the ramp completes. */
  lifeMonths: number;
  /** Sale price of output tokens, $/M tok. Defaults to break-even upstream. */
  pricePerMTok: number;
}

export interface LifecycleInputs {
  /**
   * Fleet throughput for the selected token type (tok/s), from
   * `computeFleetStats`. Revenue is billed on this, so a caller measuring
   * blended tokens bills blended tokens.
   */
  fleetTokPerSec: number;
  /** Fleet TCO for the selected tier ($/hr), from `computeFleetStats`. */
  costPerHour: number;
  assumptions: LifecycleAssumptions;
}

export interface LifecyclePoint {
  /** Months since the capital was committed (t=0), not since first token. */
  month: number;
  /** Revenue rate at this instant, $/day. */
  revenue: number;
  /** Cost rate at this instant, $/day. */
  cost: number;
  /** revenue − cost, $/day. */
  margin: number;
  /** Cumulative margin from t=0 to here, $. */
  cumulative: number;
}

export interface LifecycleSeries {
  points: LifecyclePoint[];
  /** Plateau revenue rate, $/day, after the interrupt haircut. */
  revenuePerDay: number;
  /** Plateau cost rate, $/day. */
  costPerDay: number;
  /** Plateau margin rate, $/day. */
  marginPerDay: number;
  /** Fraction of wall-clock time the fleet is serving, 0–1. */
  availability: number;
  /** Months from t=0 until cumulative margin first turns positive; null if never. */
  paybackMonth: number | null;
  /** Cumulative margin at the end of the decommissioning taper, $. */
  lifetimeMargin: number;
  /** End of the modelled window, months from t=0. */
  endMonth: number;
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
  const recoveryDays = recoveryHours / HOURS_PER_DAY;
  return mtbiDays / (mtbiDays + recoveryDays);
}

/**
 * Price at which plateau revenue exactly covers plateau cost, $/M tok.
 *
 * This is the same quantity the calculator already reports as a config's
 * $/M tok cost — it is derived from the SemiAnalysis TCO model, not invented
 * here — recomputed at fleet scale so it stays consistent with `costPerHour`.
 * Returns null when it is undefined (a fleet producing no tokens has no
 * break-even price).
 */
export function breakEvenPricePerMTok(costPerHour: number, fleetTokPerSec: number): number | null {
  if (!(fleetTokPerSec > 0) || !Number.isFinite(costPerHour)) return null;
  const tokensPerHour = fleetTokPerSec * 3600;
  return (costPerHour / tokensPerHour) * TOKENS_PER_MILLION;
}

/** Smoothstep: 0→1 with zero slope at both ends. Ramps read as S-curves, not corners. */
function smoothstep(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Returns null when the projection is meaningless: no throughput, no cost
 * basis, or no useful life to project over.
 */
export function computeLifecycle(inputs: LifecycleInputs): LifecycleSeries | null {
  const { fleetTokPerSec, costPerHour, assumptions } = inputs;
  if (!(fleetTokPerSec > 0) || !Number.isFinite(costPerHour)) return null;

  const ttfi = clampNonNegative(assumptions.ttfiMonths);
  const ramp = clampNonNegative(assumptions.rampMonths);
  const life = clampNonNegative(assumptions.lifeMonths);
  const price = clampNonNegative(assumptions.pricePerMTok);
  if (!(life > 0)) return null;

  const availability = availabilityFromInterrupts(assumptions.mtbiDays, assumptions.recoveryHours);

  const tokensPerDay = fleetTokPerSec * 3600 * HOURS_PER_DAY;
  const fullRevenuePerDay = (tokensPerDay / TOKENS_PER_MILLION) * price * availability;
  const costPerDay = costPerHour * HOURS_PER_DAY;

  // Phase boundaries, months from t=0.
  const rampStart = ttfi;
  const plateauStart = rampStart + ramp;
  const plateauEnd = plateauStart + life;
  const endMonth = plateauEnd + DECOMMISSION_MONTHS;

  const points: LifecyclePoint[] = [];
  const steps = Math.max(1, Math.round(endMonth * SAMPLES_PER_MONTH));
  const dt = endMonth / steps;

  let cumulative = 0;
  let paybackMonth: number | null = null;
  let prevMargin = 0;

  for (let i = 0; i <= steps; i += 1) {
    const month = i * dt;

    // Revenue: nothing until first inference, then a smooth ramp, then flat,
    // then falls away with the capacity being decommissioned.
    let revenueFraction: number;
    if (month < rampStart) revenueFraction = 0;
    else if (month < plateauStart) {
      revenueFraction = ramp > 0 ? smoothstep((month - rampStart) / ramp) : 1;
    } else if (month < plateauEnd) revenueFraction = 1;
    else revenueFraction = 1 - smoothstep((month - plateauEnd) / DECOMMISSION_MONTHS);

    // Cost: energised capacity. Full rate from t=0 — the racks are drawing
    // power and accruing TCO through the whole pre-revenue period — tapering
    // only as they are powered down.
    const costFraction =
      month < plateauEnd ? 1 : 1 - smoothstep((month - plateauEnd) / DECOMMISSION_MONTHS);

    const revenue = fullRevenuePerDay * revenueFraction;
    const cost = costPerDay * costFraction;
    const margin = revenue - cost;

    // Trapezoidal integration over the interval that just closed.
    if (i > 0) cumulative += ((prevMargin + margin) / 2) * dt * DAYS_PER_MONTH;
    prevMargin = margin;

    if (paybackMonth === null && cumulative > 0) paybackMonth = month;

    points.push({ month, revenue, cost, margin, cumulative });
  }

  return {
    points,
    revenuePerDay: fullRevenuePerDay,
    costPerDay,
    marginPerDay: fullRevenuePerDay - costPerDay,
    availability,
    paybackMonth,
    lifetimeMargin: cumulative,
    endMonth,
  };
}

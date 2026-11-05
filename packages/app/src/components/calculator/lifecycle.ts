import { DEFAULT_CACHED_INPUT_PRICE_RATIO } from '@/lib/calculator/cache-pricing';

export const LIFECYCLE_DEFAULTS = {
  mtbiDays: 24,
  recoveryHours: 12,
  rampMonths: 0.5,
  cachedInputPct: DEFAULT_CACHED_INPUT_PRICE_RATIO * 100,
  outputPriceMultiple: 4,
} as const;

const HOURS_PER_DAY = 24;

export const DAYS_PER_MONTH = 365.25 / 12;

export const MS_PER_MONTH = DAYS_PER_MONTH * HOURS_PER_DAY * 3600 * 1000;

const TOKENS_PER_MILLION = 1e6;
const SECONDS_PER_DAY = 86_400;

export function billableInputRate(
  inputTput: number,
  cacheHitRate: number | undefined,
  cacheReadRatio: number,
): number {
  if (!Number.isFinite(inputTput) || inputTput <= 0) return 0;
  if (typeof cacheHitRate !== 'number' || !Number.isFinite(cacheHitRate)) return inputTput;
  const hit = Math.max(0, Math.min(1, cacheHitRate));
  const ratio = Math.max(0, Math.min(1, cacheReadRatio));
  return inputTput * (1 - hit * (1 - ratio));
}

export interface LifecycleAssumptions {
  mtbiDays: number;
  recoveryHours: number;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  rampMonths: number;
}

export interface ThroughputStep {
  month: number;
  billableInputTokPerSec: number;
  outputTokPerSec: number;
}

export function effectiveTokPerSec(
  inputTokPerSec: number,
  outputTokPerSec: number,
  outputPriceMultiple: number,
): number {
  const multiple =
    Number.isFinite(outputPriceMultiple) && outputPriceMultiple > 0 ? outputPriceMultiple : 0;
  return inputTokPerSec + outputTokPerSec * multiple;
}

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

function nonNegativePrice(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function stepTokPerSec(step: ThroughputStep): number {
  return step.billableInputTokPerSec + step.outputTokPerSec;
}

export interface LifecycleInputs {
  steps: readonly ThroughputStep[];
  costPerHour: number;
  provisionedMw: number;
  horizonMonths: number;
  assumptions: LifecycleAssumptions;
}

export interface LifecyclePoint {
  month: number;
  revenue: number;
  cost: number;
  margin: number;
  revenuePerMw: number;
  marginPerMw: number;
  cumulative: number;
  cumulativeRevenue: number;
  isStep: boolean;
  isRamp: boolean;
}

export interface LifecycleSeries {
  points: LifecyclePoint[];
  revenuePerDay: number;
  firstRevenuePerDay: number;
  costPerDay: number;
  marginPerDay: number;
  firstMarginPerDay: number;
  improvementFactor: number;
  availability: number;
  paybackMonth: number | null;
  lifetimeMargin: number;
  startMonth: number;
  endMonth: number;
  rampEndMonth: number;
  improvementCount: number;
}

export const LIFECYCLE_METRICS = [
  'margin',
  'marginPerMw',
  'revenue',
  'revenuePerMw',
  'cumulativeRevenue',
] as const;
export type LifecycleMetric = (typeof LIFECYCLE_METRICS)[number];

export function isCumulative(metric: LifecycleMetric): boolean {
  return metric === 'cumulativeRevenue';
}

export function isBreakEvenAnchored(metric: LifecycleMetric): boolean {
  return metric === 'margin' || metric === 'marginPerMw';
}

export function metricValue(point: LifecyclePoint, metric: LifecycleMetric): number {
  if (metric === 'revenue') return point.revenue;
  if (metric === 'revenuePerMw') return point.revenuePerMw;
  if (metric === 'cumulativeRevenue') return point.cumulativeRevenue;
  if (metric === 'marginPerMw') return point.marginPerMw;
  return point.margin;
}

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

export function availabilityFromInterrupts(mtbiDays: number, recoveryHours: number): number {
  if (!Number.isFinite(mtbiDays) || mtbiDays <= 0) return 1;
  if (!Number.isFinite(recoveryHours) || recoveryHours <= 0) return 1;
  return mtbiDays / (mtbiDays + recoveryHours / HOURS_PER_DAY);
}

export function breakEvenPricePerMTok(
  costPerHour: number,
  tokPerSec: number,
  availability = 1,
): number | null {
  if (!(tokPerSec > 0) || !Number.isFinite(costPerHour)) return null;
  if (!(availability > 0) || !Number.isFinite(availability)) return null;
  return (costPerHour / (tokPerSec * 3600 * availability)) * TOKENS_PER_MILLION;
}

function revenuePerDayFor(revenuePerSec: number, availability: number): number {
  return revenuePerSec * SECONDS_PER_DAY * availability;
}

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

const RAMP_SAMPLES = 24;

const EPSILON_MONTHS = 1e-9;

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

export function rampFractionAt(month: number, startMonth: number, rampMonths: number): number {
  if (!Number.isFinite(rampMonths) || rampMonths <= 0) return 1;
  return smoothstep((month - startMonth) / rampMonths);
}

export function computeLifecycle(inputs: LifecycleInputs): LifecycleSeries | null {
  const { steps, costPerHour, provisionedMw, horizonMonths, assumptions } = inputs;
  const perMw = Number.isFinite(provisionedMw) && provisionedMw > 0 ? 1 / provisionedMw : 0;
  if (steps.length === 0 || !Number.isFinite(costPerHour)) return null;

  const sorted = [...steps]
    .filter((s) => Number.isFinite(s.month) && stepTokPerSec(s) > 0)
    .toSorted((a, b) => a.month - b.month);
  if (sorted.length === 0) return null;

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

  function levelWithin(
    rollout: { start: number; end: number; from: number; to: number },
    month: number,
  ): number {
    const fraction = rampFractionAt(month, rollout.start, rampMonths);
    return rollout.from + (rollout.to - rollout.from) * fraction;
  }

  const samples: { month: number; level: number; isStep: boolean; isRamp: boolean }[] = [];
  for (let i = 0; i < rollouts.length; i += 1) {
    const rollout = rollouts[i]!;
    const next = rollouts[i + 1];
    const holdUntil = next ? Math.min(next.start, endMonth) : endMonth;
    const rampEnd = Math.min(rollout.end, holdUntil);

    if (rampEnd > rollout.start) {
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
        isRamp: rampEnd < rollout.end,
      });
    } else {
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

  const revenueOf = (sample: { level: number }) => revenuePerDayFor(sample.level, availability);

  for (let i = 0; i < samples.length; i += 1) {
    const here = samples[i]!;
    const revenue = revenueOf(here);
    const cost = costPerDay;
    if (i > 0) {
      const prev = samples[i - 1]!;
      const meanRevenue = (revenueOf(prev) + revenue) / 2;
      const margin = meanRevenue - costPerDay;
      const days = (here.month - prev.month) * DAYS_PER_MONTH;
      const before = cumulative;
      cumulative += margin * days;
      cumulativeRevenue += meanRevenue * days;
      if (paybackMonth === null && before <= 0 && cumulative > 0 && margin > 0) {
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

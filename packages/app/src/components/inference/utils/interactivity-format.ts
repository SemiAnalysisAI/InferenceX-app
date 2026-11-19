import * as d3 from 'd3';

/**
 * Interactivity (tok/s/user) as PowerX prints it. Agentic and large-model sweeps
 * sit at single-digit tok/s/user, where whole numbers collapse distinct points
 * (2.4 and 2.6 both read "2", 2.6 and 3.4 both read "3"), so values under 10
 * keep one decimal; from 10 up a whole number is precise enough.
 */
export function interactivityDecimals(value: number): number {
  return Math.abs(value) < 10 ? 1 : 0;
}

export function formatInteractivity(value: number): string {
  return d3.format(`,.${interactivityDecimals(value)}f`)(value);
}

/** Approximate tick label width at the chart's 12 px tick font, plus breathing room. */
const TICK_CHAR_PX = 7;
const TICK_GAP_PX = 10;
/** Ticks never sit closer than this, however short their labels. */
const MIN_TICK_SPACING_PX = 36;
/**
 * The finest precision an axis label gets before equal-looking slots are dropped:
 * one decimal. A second one (2.06 vs 2.08) is noise on an axis whose slots carry
 * no distance; those points stay apart in the readout, tooltip and parts list.
 */
const MAX_TICK_DECIMALS = 1;

export interface InteractivityTick {
  /** Slot index on the evenly spaced axis. */
  index: number;
  label: string;
}

/** Every `step`-th slot, labelled as `interactivityAxisTicks` describes. */
function ticksEvery(values: readonly number[], step: number): InteractivityTick[] {
  const indices = values.map((_, index) => index).filter((index) => index % step === 0);
  const labelsAt = (extra: number) =>
    indices.map((index) => {
      const own = interactivityDecimals(values[index]);
      const places = Math.min(own + extra, Math.max(own, MAX_TICK_DECIMALS));
      return d3.format(`,.${places}f`)(values[index]);
    });
  let labels = labelsAt(0);
  if (new Set(labels).size < labels.length) labels = labelsAt(1);
  return indices
    .map((index, position) => ({ index, label: labels[position] }))
    .filter((tick, position, all) => position === 0 || tick.label !== all[position - 1].label);
}

/** The slot spacing the widest of these labels needs. */
function spacingFor(ticks: readonly InteractivityTick[]): number {
  const widest = Math.max(...ticks.map((tick) => tick.label.length));
  return Math.max(MIN_TICK_SPACING_PX, widest * TICK_CHAR_PX + TICK_GAP_PX);
}

/**
 * Tick labels for an evenly spaced axis whose slots are points in interactivity
 * order. Every slot is the same width, so the axis shows every `step`-th slot,
 * with `step` large enough that the widest label fits its share of the plot.
 * Each label reads as `formatInteractivity` would print it (one decimal under 10,
 * whole numbers above); if whole numbers would repeat, those gain a decimal, up
 * to `MAX_TICK_DECIMALS`. A slot that still reads like its left neighbour (two
 * concurrencies at nearly the same interactivity) is left unlabelled, so no
 * label repeats.
 */
export function interactivityAxisTicks(
  values: readonly number[],
  plotWidth: number,
): InteractivityTick[] {
  if (values.length === 0) return [];
  const slot = Math.max(1, Math.abs(plotWidth) / values.length);
  // Wider labels need sparser ticks, and sparser ticks can need fewer decimals;
  // `step` only grows and is bounded by the slot count, so this settles.
  let step = 1;
  let ticks = ticksEvery(values, step);
  let needed = Math.ceil(spacingFor(ticks) / slot);
  while (needed > step && step < values.length) {
    step = Math.min(values.length, needed);
    ticks = ticksEvery(values, step);
    needed = Math.ceil(spacingFor(ticks) / slot);
  }
  return ticks;
}

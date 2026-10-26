import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { PowerCompare } from '../types';
import { powerCompareVariants } from '../utils/power-compare';
import type { MeasuredMetricField } from '../ui/MeasuredMetricControls';

/** The four PowerX views; each maps onto existing metric + compare state, so no new URL param. */
export type PowerXView = 'energy' | 'draw' | 'where' | 'time';
export const POWERX_VIEWS = [
  'energy',
  'draw',
  'where',
  'time',
] as const satisfies readonly PowerXView[];
/** The three measured boundaries the Count toggle names: GPU only, IT (no PUE), Facility. */
export type PowerXBoundary = 'gpu' | 'it' | 'system';
export const POWERX_BOUNDARIES = [
  'gpu',
  'it',
  'system',
] as const satisfies readonly PowerXBoundary[];
/** Count on the Energy view: one boundary, or all three on one chart. */
export type PowerXCount = PowerXBoundary | 'both';
/** What one unit of energy is charged to on the Energy view. */
export type EnergyPer = 'output' | 'input' | 'total' | 'query';

export const POWERX_DEFAULT_METRIC = 'y_measuredJPerOutputToken';

/** GPU-measured metric behind each Energy unit. Only output tokens have an IT or facility basis. */
export const ENERGY_PER_METRIC: Record<EnergyPer, string> = {
  output: 'y_measuredJPerOutputToken',
  input: 'y_measuredJPerInputToken',
  total: 'y_measuredJPerTotalToken',
  query: 'y_measuredWhPerSuccessfulQuery',
};

/** Metric keys behind each view/boundary pair. */
export const VIEW_METRICS: Record<Exclude<PowerXView, 'time'>, Record<PowerXBoundary, string>> = {
  draw: { gpu: 'y_measuredAvgPower', it: 'y_itModeledWatts', system: 'y_utilityModeledWatts' },
  energy: {
    gpu: 'y_measuredJPerOutputToken',
    it: 'y_itModeledJPerOutputToken',
    system: 'y_utilityModeledJPerOutputToken',
  },
  where: { gpu: 'y_measuredAvgPower', it: 'y_measuredAvgPower', system: 'y_measuredAvgPower' },
};

/** The compare mode behind the Where the power goes view (`i_pcompare=breakdown`). */
export const WHERE_COMPARE = 'breakdown' satisfies PowerCompare;

export const POWER_TIMELINE_METRIC = 'y_measuredPowerTimeline';
export const POWER_PERCENT_TDP_METRIC = 'y_measuredPowerPercentTdp';

export function energyPerFor(metric: string): EnergyPer {
  if (metric.endsWith('JPerInputToken')) return 'input';
  if (metric.endsWith('JPerTotalToken')) return 'total';
  if (metric.endsWith('PerSuccessfulQuery')) return 'query';
  return 'output';
}

export function powerXViewFor(metric: string, compare: PowerCompare): PowerXView | null {
  const config = getMeasuredMetricConfig(metric);
  if (!config) return null;
  // The breakdown stacks and the prefill/decode split are the Where view; a boundary
  // overlay (Count: All, with or without the rated lines) stays on the metric's own view.
  if (compare === 'breakdown' || compare === 'roles') return 'where';
  if (config.family === 'energy') return 'energy';
  return config.display === 'timeline' ? 'time' : 'draw';
}

export function powerXBoundaryFor(metric: string): PowerXBoundary {
  const basis = getMeasuredMetricConfig(metric)?.basis;
  if (basis === 'gpu-measured') return 'gpu';
  return basis === 'it-modeled' ? 'it' : 'system';
}

export interface PowerXSelection {
  metric: string;
  compare: PowerCompare;
}

/** The metric + compare pair a view tab selects, keeping the current boundary where it applies. */
export function selectPowerXView(next: PowerXView, current: PowerXSelection): PowerXSelection {
  const view = powerXViewFor(current.metric, current.compare);
  if (next === view) return current;
  if (next === 'time') return { metric: POWER_TIMELINE_METRIC, compare: 'none' };
  const boundary = powerXBoundaryFor(current.metric);
  if (next === 'where') return { metric: VIEW_METRICS.where.gpu, compare: WHERE_COMPARE };
  return { metric: VIEW_METRICS[next][boundary], compare: 'none' };
}

export function powerXCountFor(metric: string, compare: PowerCompare): PowerXCount {
  return compare === 'boundaries' || compare === 'all' ? 'both' : powerXBoundaryFor(metric);
}

/**
 * The Count toggle (GPU only | IT (no PUE) | Facility | All) on the Energy and Power draw
 * views. All overlays the three measured boundaries on the view's own chart: GPU only solid,
 * IT dashed and Facility dash-dot per chip.
 */
export function selectPowerXCount(next: PowerXCount, current: PowerXSelection): PowerXSelection {
  const view = powerXViewFor(current.metric, current.compare);
  if (next === 'both') {
    return {
      metric: view === 'draw' ? VIEW_METRICS.draw.gpu : ENERGY_PER_METRIC.output,
      compare: 'boundaries',
    };
  }
  if (view === 'draw') return { metric: VIEW_METRICS.draw[next], compare: 'none' };
  const per = energyPerFor(current.metric);
  return {
    metric: next === 'gpu' ? ENERGY_PER_METRIC[per] : VIEW_METRICS.energy[next],
    compare: 'none',
  };
}

/**
 * True when the rated GPU TDP and all-in provisioned lines exist for the metric: they are
 * J per output token series, so W per chip gains nothing from `all` over `boundaries`.
 */
export function powerXRatedAvailable(metric: string): boolean {
  return (
    powerCompareVariants(metric, 'all').length > powerCompareVariants(metric, 'boundaries').length
  );
}

/**
 * The Rated boundaries toggle in Chart Config: on adds the rated GPU TDP and all-in
 * provisioned lines to the three measured boundaries (Count: All); off removes just them.
 */
export function selectPowerXRated(on: boolean, current: PowerXSelection): PowerXSelection {
  if (on) {
    const view = powerXViewFor(current.metric, current.compare);
    return {
      metric: view === 'energy' ? ENERGY_PER_METRIC.output : current.metric,
      compare: 'all',
    };
  }
  return {
    metric: current.metric,
    compare: current.compare === 'all' ? 'boundaries' : current.compare,
  };
}

/** The Per toggle on the Energy view; only output tokens keep an IT or facility basis. */
export function selectPowerXPer(next: EnergyPer, current: PowerXSelection): PowerXSelection {
  if (next === energyPerFor(current.metric)) return current;
  const boundary = powerXBoundaryFor(current.metric);
  const compare = next !== 'output' && current.compare !== 'none' ? 'none' : current.compare;
  return {
    metric:
      next === 'output' && boundary !== 'gpu'
        ? VIEW_METRICS.energy[boundary]
        : ENERGY_PER_METRIC[next],
    compare,
  };
}

export type PowerXShowAs = 'watts' | 'tdp';

export function powerXShowAsFor(metric: string): PowerXShowAs {
  const config = getMeasuredMetricConfig(metric);
  return config?.family === 'power' && config.display === 'tdp' ? 'tdp' : 'watts';
}

/** The Show as toggle on the Power draw view; % of TDP is a GPU-only reading. */
export function selectPowerXShowAs(next: PowerXShowAs): string {
  return next === 'tdp' ? POWER_PERCENT_TDP_METRIC : VIEW_METRICS.draw.gpu;
}

/** True on the Power draw view shown as % of TDP, where the headroom shading and table apply. */
export function powerXShowsHeadroom(metric: string, compare: PowerCompare): boolean {
  return metric === POWER_PERCENT_TDP_METRIC && compare === 'none';
}

/**
 * Which of the measured-metric controls still mean something on a view:
 * Scope (All / Prefill / Decode GPUs) for GPU-only power and for per-token
 * energy, plus the Power statistic (Average / P75 / P90) for power. Timelines,
 * comparisons and the modeled IT and facility boundaries are defined for the
 * all-GPU average only.
 */
export function powerXMetricFields(
  metric: string,
  compare: PowerCompare,
): readonly MeasuredMetricField[] {
  const config = getMeasuredMetricConfig(metric);
  const view = powerXViewFor(metric, compare);
  if (!config || !view || compare !== 'none' || config.basis !== 'gpu-measured') return [];
  if (view === 'draw') return ['scope', 'statistic'];
  if (
    config.family === 'energy' &&
    view === 'energy' &&
    (config.denominator === 'input' || config.denominator === 'output')
  )
    return ['scope'];
  return [];
}

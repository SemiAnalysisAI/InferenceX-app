import { getMeasuredMetricConfig } from '../measured-metric-config';
import type { PowerCompare } from '../types';
import type { MeasuredMetricField } from '../ui/MeasuredMetricControls';

/** The four PowerX views; each maps onto existing metric + compare state, so no new URL param. */
export type PowerXView = 'energy' | 'draw' | 'where' | 'time';
export const POWERX_VIEWS = [
  'energy',
  'draw',
  'where',
  'time',
] as const satisfies readonly PowerXView[];
export type PowerXBoundary = 'gpu' | 'system';
/** Count on the Energy view: one boundary, or both on one chart. */
export type PowerXCount = PowerXBoundary | 'both';
/** What one unit of energy is charged to on the Energy view. */
export type EnergyPer = 'output' | 'input' | 'total' | 'query';

export const POWERX_DEFAULT_METRIC = 'y_measuredJPerOutputToken';

/** GPU-measured metric behind each Energy unit. Only output tokens have a whole-system basis. */
export const ENERGY_PER_METRIC: Record<EnergyPer, string> = {
  output: 'y_measuredJPerOutputToken',
  input: 'y_measuredJPerInputToken',
  total: 'y_measuredJPerTotalToken',
  query: 'y_measuredWhPerSuccessfulQuery',
};

/** Metric keys behind each view/boundary pair. */
export const VIEW_METRICS: Record<Exclude<PowerXView, 'time'>, Record<PowerXBoundary, string>> = {
  draw: { gpu: 'y_measuredAvgPower', system: 'y_utilityModeledWatts' },
  energy: { gpu: 'y_measuredJPerOutputToken', system: 'y_utilityModeledJPerOutputToken' },
  where: { gpu: 'y_measuredAvgPower', system: 'y_measuredAvgPower' },
};

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
  // Overlaying both boundaries of an energy metric stays on the Energy view.
  if ((compare === 'boundaries' || compare === 'all') && config.family === 'energy')
    return 'energy';
  if (compare !== 'none') return 'where';
  if (config.family === 'energy') return 'energy';
  return config.display === 'timeline' ? 'time' : 'draw';
}

export function powerXBoundaryFor(metric: string): PowerXBoundary {
  return getMeasuredMetricConfig(metric)?.basis === 'gpu-measured' ? 'gpu' : 'system';
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
  if (next === 'where') return { metric: VIEW_METRICS.where.gpu, compare: 'boundaries' };
  return { metric: VIEW_METRICS[next][boundary], compare: 'none' };
}

export function powerXCountFor(metric: string, compare: PowerCompare): PowerXCount {
  return compare === 'boundaries' || compare === 'all' ? 'both' : powerXBoundaryFor(metric);
}

/** The Count toggle (GPU only | Whole system | Both) on the Energy and Power draw views. */
export function selectPowerXCount(next: PowerXCount, current: PowerXSelection): PowerXSelection {
  const view = powerXViewFor(current.metric, current.compare);
  if (next === 'both') return { metric: ENERGY_PER_METRIC.output, compare: 'boundaries' };
  if (view === 'draw') return { metric: VIEW_METRICS.draw[next], compare: 'none' };
  const per = energyPerFor(current.metric);
  return {
    metric: next === 'system' ? VIEW_METRICS.energy.system : ENERGY_PER_METRIC[per],
    compare: 'none',
  };
}

/** The Per toggle on the Energy view; only output tokens keep a whole-system basis. */
export function selectPowerXPer(next: EnergyPer, current: PowerXSelection): PowerXSelection {
  if (next === energyPerFor(current.metric)) return current;
  const boundary = powerXBoundaryFor(current.metric);
  const compare = next !== 'output' && current.compare !== 'none' ? 'none' : current.compare;
  return {
    metric:
      next === 'output' && boundary === 'system'
        ? VIEW_METRICS.energy.system
        : ENERGY_PER_METRIC[next],
    compare,
  };
}

export type PowerXShowAs = 'watts' | 'tdp';

export function powerXShowAsFor(metric: string): PowerXShowAs {
  const config = getMeasuredMetricConfig(metric);
  return config?.family === 'power' && config.display === 'tdp' ? 'tdp' : 'watts';
}

/** The Show as toggle on the Power draw view. */
export function selectPowerXShowAs(next: PowerXShowAs): string {
  return next === 'tdp' ? POWER_PERCENT_TDP_METRIC : VIEW_METRICS.draw.gpu;
}

/**
 * Which of the measured-metric controls still mean something on a view:
 * Scope (All / Prefill / Decode GPUs) for GPU-only power and for per-token
 * energy, plus the Power statistic (Average / P75 / P90) for power. Timelines,
 * comparisons and the modeled whole system are defined for the all-GPU average only.
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

export interface PowerXProvenanceInput {
  /** Benchmark points with validated measured GPU power in the current selection. */
  measuredPoints: number;
  /** Mean one-second GPU samples per point, when a timeline has been loaded. */
  samplesPerPoint?: number | null;
  powerModelRevision: string;
  /** The facility assumption of the selected model, when one is modeled. */
  pue?: number | null;
}

const PROVENANCE_STRINGS = {
  en: {
    points: (n: number) => `${n.toLocaleString('en-US')} measured point${n === 1 ? '' : 's'}`,
    samples: (s: string) => `~${s} 1-second GPU samples per point`,
    windows: 'validated serving windows only',
    revision: (rev: string) => `power model rev ${rev}`,
    pue: (pue: string) => `PUE ${pue}`,
  },
  zh: {
    points: (n: number) => `${n.toLocaleString('zh-CN')} 个实测数据点`,
    samples: (s: string) => `每点约 ${s} 个 1 秒 GPU 采样`,
    windows: '仅统计通过验证的服务窗口',
    revision: (rev: string) => `功耗模型版本 ${rev}`,
    pue: (pue: string) => `PUE ${pue}`,
  },
} as const;

function formatSamples(samples: number): string {
  if (samples >= 1000) {
    const k = samples / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return String(Math.round(samples));
}

/** The one-line provenance strip under the chart. Items without a value are left out. */
export function powerXProvenanceText(
  input: PowerXProvenanceInput,
  locale: 'en' | 'zh' = 'en',
): string {
  const t = PROVENANCE_STRINGS[locale];
  const items = [t.points(input.measuredPoints)];
  if (typeof input.samplesPerPoint === 'number' && input.samplesPerPoint > 0)
    items.push(t.samples(formatSamples(input.samplesPerPoint)));
  items.push(t.windows, t.revision(input.powerModelRevision.slice(0, 7)));
  if (typeof input.pue === 'number' && Number.isFinite(input.pue))
    items.push(t.pue(String(input.pue)));
  return items.join(' · ');
}

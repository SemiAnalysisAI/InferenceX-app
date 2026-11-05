import type { ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { Metric } from './metrics';

export interface ComparisonModel {
  view: ComparisonView;
  metric: Metric;
  hardware: string[];
  available: string[];
  toggle: (hardware: string) => void;
  colors: Record<string, string>;
  baseline: string | null;
  value: (hardware: string, caseIndex: number) => number | null;
  latency: (hardware: string, caseIndex: number) => number | null;
  better: (a: number, b: number) => boolean;
  inspect: (caseIndex: number) => void;
  preview: (caseIndex: number) => void;
}

export function buildModel(
  view: ComparisonView,
  metric: Metric,
  selection: { hardware: string[]; available: string[]; toggle: (hardware: string) => void },
  colors: Record<string, string>,
  baseline: string | null,
  drill: { inspect: (caseIndex: number) => void; preview: (caseIndex: number) => void },
): ComparisonModel {
  const latency = (hw: string, i: number) => {
    const col = view.measurements[hw];
    return col && col.status[i] === 'ok' ? col.latencyUs[i] : null;
  };
  return {
    view,
    metric,
    ...selection,
    colors,
    baseline,
    latency,
    value: (hw, i) => {
      const us = latency(hw, i);
      return us ? metric.value(view.cases[i], us, hw) : null;
    },
    better: (a, b) => (metric.better === 'higher' ? a > b : a < b),
    ...drill,
  };
}

export function caseRefs(
  view: ComparisonView,
  hardware: string[],
  caseIndex: number,
): { hardware: string; ref: string }[] {
  return hardware.flatMap((hw) => {
    const col = view.measurements[hw];
    const runId = col?.runId[caseIndex];
    const index = col?.resultIndex[caseIndex];
    const revision = col?.revision[caseIndex];
    return col?.status[caseIndex] === 'ok' &&
      runId &&
      index !== null &&
      index !== undefined &&
      revision
      ? [{ hardware: hw, ref: `${runId}:${index}:${revision}` }]
      : [];
  });
}

export function geomean(values: number[]): number | null {
  const v = values.filter((x) => x > 0);
  return v.length > 0 ? Math.exp(v.reduce((s, x) => s + Math.log(x), 0) / v.length) : null;
}

export function advantage(
  model: ComparisonModel,
  hardware: string,
  reference: string,
  i: number,
): number | null {
  const v = model.value(hardware, i);
  const r = model.value(reference, i);
  if (!v || !r) return null;
  return model.metric.better === 'higher' ? v / r : r / v;
}

export function commonCases(model: ComparisonModel, indices?: number[]): number[] {
  const all = indices ?? model.view.cases.map((_, i) => i);
  return all.filter((i) => model.hardware.every((hw) => model.value(hw, i) !== null));
}

export function geomeanAdvantage(
  model: ComparisonModel,
  hardware: string,
  reference: string,
  indices?: number[],
): { value: number; cases: number } | null {
  const ratios: number[] = [];
  for (const i of indices ?? model.view.cases.map((_, j) => j)) {
    const a = advantage(model, hardware, reference, i);
    if (a) ratios.push(a);
  }
  const g = geomean(ratios);
  return g === null ? null : { value: g, cases: ratios.length };
}

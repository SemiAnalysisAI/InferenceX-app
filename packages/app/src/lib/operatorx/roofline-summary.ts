import { quantileSorted } from 'd3';

import type {
  ComparisonView,
  ComputePrecision,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import { peakBandwidthTBs, peakTflops } from '@/components/operatorx/compare/hardware';

export interface RooflineSummaryParams {
  precision: ComputePrecision | null;
  hardware: string[];
  normalized: boolean;
  sharedOnly?: boolean;
}

export interface RooflineSummaryBar {
  hardware: string;
  n: number;
  caseIndices: number[];
  median: number;
  best: number;
  medianTflops: number;
  bestTflops: number;
  bestCaseIndex: number;
}

export function rooflineSummary(view: ComparisonView, params: RooflineSummaryParams) {
  const hardware = [...new Set(params.hardware)].filter((hw) => hw in view.measurements);
  const reference = new Map(
    hardware.map((hw) => [
      hw,
      {
        peak: params.precision ? peakTflops(hw, params.precision) : null,
        bandwidth: peakBandwidthTBs(hw),
      },
    ]),
  );
  const missingReferences = hardware.filter((hw) => {
    const { peak, bandwidth } = reference.get(hw)!;
    return !peak || !bandwidth || !Number.isFinite(peak) || !Number.isFinite(bandwidth);
  });
  const throughput = (hw: string, i: number): number | null => {
    const col = view.measurements[hw];
    const us = col?.status[i] === 'ok' ? col.latencyUs[i] : null;
    const flops = view.cases[i].flops;
    if (!us || us <= 0 || !Number.isFinite(us) || !flops || flops <= 0) return null;
    const value = flops / (us * 1e6);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const shared =
    hardware.length > 0
      ? view.cases.flatMap((c, i) =>
          c.computePrecision === params.precision &&
          c.flops &&
          c.flops > 0 &&
          Number.isFinite(c.flops) &&
          c.bytes &&
          c.bytes > 0 &&
          Number.isFinite(c.bytes) &&
          hardware.every((hw) => throughput(hw, i) !== null)
            ? [i]
            : [],
        )
      : [];
  const caseIndices =
    missingReferences.length > 0
      ? []
      : shared.filter((i) => {
          const c = view.cases[i];
          return hardware.every((hw) => {
            const { peak, bandwidth } = reference.get(hw)!;
            return c.flops! / c.bytes! >= peak! / bandwidth!;
          });
        });
  const sharedOnly = params.sharedOnly ?? false;
  const bars: RooflineSummaryBar[] = hardware
    .flatMap((hw) => {
      if (missingReferences.includes(hw)) return [];
      const { peak, bandwidth } = reference.get(hw)!;
      const indices = sharedOnly
        ? caseIndices
        : view.cases.flatMap((c, i) =>
            c.computePrecision === params.precision &&
            throughput(hw, i) !== null &&
            c.bytes &&
            c.bytes > 0 &&
            Number.isFinite(c.bytes) &&
            c.flops! / c.bytes >= peak! / bandwidth!
              ? [i]
              : [],
          );
      if (indices.length === 0) return [];
      const values = indices
        .map((i) => ({ i, value: throughput(hw, i)! }))
        .sort((a, b) => a.value - b.value || a.i - b.i);
      const medianTflops = quantileSorted(
        values.map((p) => p.value),
        0.5,
      )!;
      const best = values.at(-1)!;
      const divisor = params.normalized ? peak! : 1;
      return [
        {
          hardware: hw,
          n: values.length,
          caseIndices: indices,
          median: medianTflops / divisor,
          best: best.value / divisor,
          medianTflops,
          bestTflops: best.value,
          bestCaseIndex: best.i,
        },
      ];
    })
    .sort((a, b) => b.median - a.median || b.best - a.best || a.hardware.localeCompare(b.hardware));

  return {
    precision: params.precision,
    hardware,
    normalized: params.normalized,
    sharedOnly,
    cohort: sharedOnly
      ? ('shared-compute-bound' as const)
      : ('per-hardware-compute-bound' as const),
    matchedCases: shared.length,
    caseIndices: sharedOnly
      ? caseIndices
      : [...new Set(bars.flatMap((bar) => bar.caseIndices))].sort((a, b) => a - b),
    missingReferences,
    bars,
  };
}

export type RooflineSummary = ReturnType<typeof rooflineSummary>;

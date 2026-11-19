import { quantileSorted } from 'd3';

import type { ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

import { metricById, type MetricId } from '@/components/operatorx/compare/metrics';

export interface DistributionParams {
  metric: MetricId;
  hardware: string[];
  matchedOnly: boolean;
  normalized: boolean;
}

export interface DistributionBox {
  hardware: string;
  caseIndices: number[];
  n: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface DistributionView {
  requestedMetric: MetricId;
  metric: MetricId;
  hardware: string[];
  matchedOnly: boolean;
  matchedCases: number;
  normalized: boolean;
  boxes: DistributionBox[];
}

export function normalizedDistributionMetric(metric: MetricId, normalized: boolean): MetricId {
  if (!normalized) return metric;
  if (metric === 'tflops') return 'computeUtil';
  if (metric === 'bandwidth') return 'bandwidthUtil';
  return metric;
}

/** The same box statistics serve the chart and the page-owned comparison API. */
export function distributionView(
  view: ComparisonView,
  params: DistributionParams,
): DistributionView {
  const hardware = [...new Set(params.hardware)].filter((key) => key in view.measurements);
  const normalized =
    params.normalized && (params.metric === 'tflops' || params.metric === 'bandwidth');
  const metricId = normalizedDistributionMetric(params.metric, normalized);
  const metric = metricById(metricId);
  const value = (key: string, index: number): number | null => {
    const column = view.measurements[key];
    const latency = column?.status[index] === 'ok' ? column.latencyUs[index] : null;
    if (!latency || latency <= 0) return null;
    const measured = metric.value(view.cases[index], latency, key);
    return measured !== null && Number.isFinite(measured) ? measured : null;
  };
  const all = view.cases.map((_, index) => index);
  const matched =
    hardware.length > 0
      ? all.filter((index) => hardware.every((key) => value(key, index) !== null))
      : [];
  const matchedOnly = params.matchedOnly && hardware.length > 0 && matched.length > 0;
  const indices = matchedOnly ? matched : all;
  const boxes = hardware.flatMap((key): DistributionBox[] => {
    const values = indices.flatMap((index) => {
      const measured = value(key, index);
      return measured === null ? [] : [{ index, value: measured }];
    });
    if (values.length === 0) return [];
    values.sort((a, b) => a.value - b.value);
    const sorted = values.map((point) => point.value);
    const q = (p: number) => quantileSorted(sorted, p)!;
    return [
      {
        hardware: key,
        caseIndices: values.map((point) => point.index),
        n: values.length,
        p5: q(0.05),
        p25: q(0.25),
        p50: q(0.5),
        p75: q(0.75),
        p95: q(0.95),
      },
    ];
  });
  return {
    requestedMetric: params.metric,
    metric: metricId,
    hardware,
    matchedOnly,
    matchedCases: matched.length,
    normalized,
    boxes,
  };
}

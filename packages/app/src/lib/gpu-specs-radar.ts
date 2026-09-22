import { GPU_CHART_METRICS, type GpuSpec } from './gpu-specs';

export const RADAR_METRICS = GPU_CHART_METRICS.filter(
  (metric) => metric.key !== 'scaleUpWorldSize' && metric.key !== 'scaleOutBandwidth',
);

/** Normalize before applying visibility, so hiding the maximum never rescales a chart. */
export function normalizeGpuValues(specs: GpuSpec[], metrics = RADAR_METRICS) {
  const maximums = metrics.map((metric) =>
    Math.max(
      1,
      ...specs.map((spec) => metric.getValue(spec)).filter((v): v is number => v !== null),
    ),
  );
  return specs.map((gpu) => ({
    gpu,
    values: metrics.map((metric, i) => {
      const value = metric.getValue(gpu);
      return value === null ? null : value / maximums[i];
    }),
  }));
}

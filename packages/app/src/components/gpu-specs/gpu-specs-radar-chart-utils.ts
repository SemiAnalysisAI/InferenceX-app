import { GPU_CHART_METRICS, GPU_SPECS, type GpuSpec } from '@/lib/gpu-specs';

/** Metrics to display on the radar chart axes. Excludes worldSize (discrete) and scaleOutBandwidth (nullable). */
export const RADAR_METRICS = GPU_CHART_METRICS.filter(
  (m) => m.key !== 'scaleUpWorldSize' && m.key !== 'scaleOutBandwidth',
);

/** Get a unique color per GPU. NVIDIA GPUs get green-ish hues, AMD gets red-ish hues. */
export function getGpuColor(spec: GpuSpec, _index: number): string {
  const nvidiaColors = ['#76b900', '#5a9e00', '#8fd400', '#4a8400', '#a0e800', '#3d6e00'];
  const amdColors = ['#ed1c24', '#c41920', '#ff4d52'];

  if (spec.vendor === 'nvidia') {
    const nvidiaGpus = GPU_SPECS.filter((s) => s.vendor === 'nvidia');
    const nvidiaIdx = nvidiaGpus.indexOf(spec);
    return nvidiaColors[nvidiaIdx % nvidiaColors.length];
  }
  const amdGpus = GPU_SPECS.filter((s) => s.vendor === 'amd');
  const amdIdx = amdGpus.indexOf(spec);
  return amdColors[amdIdx % amdColors.length];
}

export interface NormalizedGpu {
  gpu: GpuSpec;
  values: (number | null)[];
  color: string;
}

/** Normalize values across all GPUs for each metric to 0-1 range. */
export function normalizeGpuData(specs: GpuSpec[], metrics: typeof RADAR_METRICS): NormalizedGpu[] {
  const maxValues = metrics.map((metric) => {
    const values = specs
      .map((spec) => metric.getValue(spec))
      .filter((v): v is number => v !== null);
    return Math.max(...values, 1);
  });

  return specs.map((spec, idx) => ({
    gpu: spec,
    values: metrics.map((metric, i) => {
      const raw = metric.getValue(spec);
      if (raw === null) return null;
      return raw / maxValues[i];
    }),
    color: getGpuColor(spec, idx),
  }));
}

import type {
  GpuMetricsPointPayload,
  GpuMetricSeries,
  GpuMetricStatRow,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { useByIdQuery } from './benchmark-id-query';

export type { GpuMetricsPointPayload, GpuMetricSeries, GpuMetricStatRow };

export function useGpuMetricsPoint(id: number | null, enabled = false) {
  return useByIdQuery<GpuMetricsPointPayload>(
    'gpu-metrics-point',
    id,
    enabled && Boolean(id),
    undefined,
    { staleTime: 0, refetchOnWindowFocus: true },
  );
}

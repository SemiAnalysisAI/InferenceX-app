import type {
  GpuMetricsPointPayload,
  GpuMetricSeries,
  GpuMetricStatRow,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { useByIdQuery } from './benchmark-id-query';

export type { GpuMetricsPointPayload, GpuMetricSeries, GpuMetricStatRow };

/**
 * Lazy-fetch the PowerX telemetry linked to one benchmark point. Enabled only
 * while the PowerX detail view is open: a series is one 1 s sample per GPU for
 * the whole job (hundreds of KB), so it is not paid for on every page load.
 */
export function useGpuMetricsPoint(id: number | null, enabled = false) {
  return useByIdQuery<GpuMetricsPointPayload>('gpu-metrics-point', id, enabled && Boolean(id));
}

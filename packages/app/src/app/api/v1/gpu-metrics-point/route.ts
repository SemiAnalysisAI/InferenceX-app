import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getGpuMetricsForPoint,
  type GpuMetricsPointPayload,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

/**
 * Blob-cache namespace. Stored series are immutable per (run, artifact, CSV
 * hash), so the payload for a point only changes when the digest schema does;
 * bump the suffix alongside any change to the row shape in
 * `queries/gpu-metrics.ts`.
 */
export const CACHE_KEY_PREFIX = 'gpu-metrics-point-v1';

const getCachedGpuMetricsForPoint = cachedQuery(
  (id: number): Promise<GpuMetricsPointPayload | null> => getGpuMetricsForPoint(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/**
 * GET /api/v1/gpu-metrics-point?id=N
 *
 * PowerX telemetry recorded while one benchmark point ran: every linked
 * gpu_metrics series with full-resolution per-GPU samples and the ingest-time
 * per-GPU statistics digest. 404 when the point has no linked series (its
 * run predates migration 016 and the artifacts have expired, or the job
 * uploaded no gpu_metrics artifact).
 */
export const GET = idQueryRoute({
  logLabel: 'gpu metrics point',
  fetch: getCachedGpuMetricsForPoint,
});

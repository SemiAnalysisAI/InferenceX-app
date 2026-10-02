import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getGpuMetricsPointRevision } from '@semianalysisai/inferencex-db/queries/gpu-metrics-revision';
import type { NextRequest } from 'next/server';
import {
  getGpuMetricsForPoint,
  type GpuMetricsPointPayload,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = 'gpu-metrics-point-v2';

const getCachedGpuMetricsForPoint = cachedQuery(
  (id: number, _revision: string): Promise<GpuMetricsPointPayload | null> =>
    getGpuMetricsForPoint(getDb(), id),
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
const handleGet = idQueryRoute({
  logLabel: 'gpu metrics point',
  fetch: async (id) => {
    const revision = await getGpuMetricsPointRevision(getDb(), id);
    return revision === null ? null : getCachedGpuMetricsForPoint(id, revision);
  },
});

export async function GET(request: NextRequest): Promise<Response> {
  const response = await handleGet(request);
  // The live revision check must run even when a point used to be missing.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

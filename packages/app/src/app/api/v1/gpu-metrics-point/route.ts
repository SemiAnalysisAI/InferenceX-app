import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getGpuMetricsPointRevision } from '@semianalysisai/inferencex-db/queries/gpu-metrics-revision';
import type { NextRequest } from 'next/server';
import {
  getGpuMetricsForPoint,
  type GpuMetricsPointPayload,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { cachedJson, cachedQuery, notModifiedJson } from '@/lib/cache/api-cache';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = 'gpu-metrics-point-v2';

const CACHE_CONTROL = 'private, no-cache';

const getCachedGpuMetricsForPoint = cachedQuery(
  (id: number, _revision: string): Promise<GpuMetricsPointPayload | null> =>
    getGpuMetricsForPoint(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

async function handleGet(request: NextRequest): Promise<Response> {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
  }
  try {
    const revision = await getGpuMetricsPointRevision(getDb(), id);
    if (revision === null) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
    const cacheOptions = {
      cacheControl: CACHE_CONTROL,
      version: JSON.stringify([CACHE_KEY_PREFIX, id, revision]),
    };
    const notModified = notModifiedJson(request, cacheOptions);
    if (notModified) return notModified;
    const data = await getCachedGpuMetricsForPoint(id, revision);
    if (!data) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
    return cachedJson(request, data, cacheOptions);
  } catch (error) {
    console.error('Error fetching gpu metrics point:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

/**
 * GET /api/v1/gpu-metrics-point?id=N
 *
 * PowerX telemetry recorded while one benchmark point ran: every linked
 * gpu_metrics series with full-resolution per-GPU samples and the per-GPU
 * statistics computed from them. 404 when the point has no linked series (its
 * run predates migration 016 and the artifacts have expired, or the job
 * uploaded no gpu_metrics artifact).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const response = await handleGet(request);
  // The live revision check must run even when a point used to be missing.
  if (!response.headers.has('ETag')) response.headers.set('Cache-Control', 'no-store');
  return response;
}

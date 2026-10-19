import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getGpuMetricsPointRevision } from '@semianalysisai/inferencex-db/queries/gpu-metrics-revision';
import type { NextRequest } from 'next/server';
import {
  getGpuMetricsForPoint,
  type GpuMetricsPointPayload,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = 'gpu-metrics-point-v2';

const getCachedGpuMetricsForPoint = cachedQuery(
  (id: number, _revision: string): Promise<GpuMetricsPointPayload | null> =>
    getGpuMetricsForPoint(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

const handleGet = idQueryRoute({
  logLabel: 'gpu metrics point',
  fetch: async (id) => {
    const revision = await getGpuMetricsPointRevision(getDb(), id);
    return revision === null ? null : getCachedGpuMetricsForPoint(id, revision);
  },
});

export async function GET(request: NextRequest): Promise<Response> {
  const response = await handleGet(request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

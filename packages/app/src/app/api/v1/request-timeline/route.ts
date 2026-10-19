import type { NextRequest } from 'next/server';

import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getRequestTimeline,
  getStoredRequestTimelineGz,
  type RequestTimeline,
} from '@semianalysisai/inferencex-db/queries/request-timeline';

import { cachedGzipJson, cachedQuery } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `request-timeline-v${REQUEST_TIMELINE_VERSION}`;

const getCachedRequestTimeline = cachedQuery(
  (id: number): Promise<RequestTimeline | null> => getRequestTimeline(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

const legacyGET = idQueryRoute({
  logLabel: 'request timeline',
  fetch: getCachedRequestTimeline,
});

export async function GET(request: NextRequest): Promise<Response> {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
  }
  try {
    const chunks = await getStoredRequestTimelineGz(getDb(), id);
    if (chunks) return cachedGzipJson(chunks);
    return legacyGET(request);
  } catch (error) {
    console.error('Error fetching request timeline:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

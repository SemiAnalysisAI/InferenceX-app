import type { NextRequest } from 'next/server';

import { getPayloadDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import {
  getRequestChartData,
  REQUEST_CHART_DATA_VERSION,
} from '@semianalysisai/inferencex-db/queries/request-chart-data';
import { getCurrentRequestTimelineSha256s } from '@semianalysisai/inferencex-db/queries/request-timeline';

import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import {
  cachedJsonStoringContentBlob,
  contentBlobKey,
  contentBlobRedirect,
} from '@/lib/cache/content-blob';

export const dynamic = 'force-dynamic';

/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `request-chart-data-v${REQUEST_CHART_DATA_VERSION}`;

/**
 * GET /api/v1/request-chart-data?id=N
 *
 * Returns the compact request fields used by the default point charts. The
 * full request timeline remains a separate, timeline-view-only download.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
  }
  try {
    const sha256s = await getCurrentRequestTimelineSha256s(await getPayloadDb(id), [id]);
    const sha256 = sha256s.get(id);
    const key = sha256 ? contentBlobKey(CACHE_KEY_PREFIX, sha256) : null;
    const redirect = key ? await contentBlobRedirect(request, key) : null;
    if (redirect) return redirect;
    const data = await getRequestChartData(await getPayloadDb(id), id);
    if (!data) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
    return cachedJsonStoringContentBlob(request, data, key);
  } catch (error) {
    console.error('Error fetching request chart data:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

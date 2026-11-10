import type { NextRequest } from 'next/server';

import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { getPayloadDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import {
  getRequestTimeline,
  getStoredRequestTimelineGz,
  type RequestTimeline,
} from '@semianalysisai/inferencex-db/queries/request-timeline';

import { cachedGzipJson, cachedQuery } from '@/lib/cache/api-cache';
import {
  contentBlobKey,
  contentBlobRedirect,
  copyingToContentBlob,
} from '@/lib/cache/content-blob';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

// Key derived from REQUEST_TIMELINE_VERSION (governs the `request_timeline`
// payload). The blob cache is write-once with no post-backfill purge, so the
// version-derived key is what rolls the namespace on a bump — a hand-written
// string would serve stale blob-cached timelines forever.
/** Version-derived blob-cache key namespace (exported for the key-derivation test). */
export const CACHE_KEY_PREFIX = `request-timeline-v${REQUEST_TIMELINE_VERSION}`;

const STORED_GZIP_NAMESPACE = 'request-timeline-gz';

const getCachedRequestTimeline = cachedQuery(
  async (id: number): Promise<RequestTimeline | null> =>
    getRequestTimeline(await getPayloadDb(id), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

/**
 * GET /api/v1/request-timeline?id=N
 *
 * Returns the per-request Gantt timeline for one agentic benchmark point.
 * Each request entry has ns-from-start offsets for credit/start/ack/end,
 * plus TTFT, ISL, OSL, conversation id, turn index, worker id. 404 if the
 * point has no stored profile_export.jsonl blob.
 */
const legacyGET = idQueryRoute({
  logLabel: 'request timeline',
  fetch: getCachedRequestTimeline,
});

/** Current gzip timelines bypass parsed-object caches to keep memory bounded. */
export async function GET(request: NextRequest): Promise<Response> {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
  }
  try {
    const stored = await getStoredRequestTimelineGz(await getPayloadDb(id), id);
    if (!stored) return legacyGET(request);
    if (!stored.sha256) return cachedGzipJson(request, stored.chunks);
    const key = contentBlobKey(STORED_GZIP_NAMESPACE, stored.sha256);
    return (
      (await contentBlobRedirect(request, key)) ??
      cachedGzipJson(request, copyingToContentBlob(stored.chunks, key, stored.sha256))
    );
  } catch (error) {
    console.error('Error fetching request timeline:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

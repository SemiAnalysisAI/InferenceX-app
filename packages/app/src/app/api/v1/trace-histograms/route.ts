import { type NextRequest, NextResponse } from 'next/server';

import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getCurrentRequestTimelineSha256s } from '@semianalysisai/inferencex-db/queries/request-timeline';
import { getTraceHistograms } from '@semianalysisai/inferencex-db/queries/trace-histograms';

import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import {
  cachedJsonStoringContentBlob,
  contentBlobKeyOf,
  contentBlobRedirect,
} from '@/lib/cache/content-blob';

import { parseIdsParam } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `trace-histograms-v${REQUEST_TIMELINE_VERSION}`;

const MAX_IDS = 200;

/**
 * GET /api/v1/trace-histograms?ids=1,2,3
 *
 * Returns per-request ISL/OSL arrays parsed from the stored aiperf
 * `profile_export.jsonl` blobs, keyed by `benchmark_results.id`.
 * Ids without a trace_replay blob are omitted from the response.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const ids = parseIdsParam(request, MAX_IDS);
  if (ids instanceof NextResponse) return ids;
  try {
    const sha256s = await getCurrentRequestTimelineSha256s(getDb(), ids);
    const inputs = [...sha256s].toSorted(([a], [b]) => a - b).map(([id, sha]) => `${id}:${sha}`);
    const key = [...sha256s.values()].every(Boolean)
      ? contentBlobKeyOf(CACHE_KEY_PREFIX, inputs)
      : null;
    const redirect = key ? await contentBlobRedirect(request, key) : null;
    if (redirect) return redirect;
    const histograms = await getTraceHistograms(getDb(), ids);
    const complete = Object.keys(histograms).length === sha256s.size;
    return cachedJsonStoringContentBlob(request, histograms, complete ? key : null);
  } catch (error) {
    console.error('Error fetching trace histograms:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}

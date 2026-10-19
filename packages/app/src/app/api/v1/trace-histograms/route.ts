import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getTraceHistograms,
  type TraceHistogramMap,
} from '@semianalysisai/inferencex-db/queries/trace-histograms';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `trace-histograms-v${REQUEST_TIMELINE_VERSION}`;

const getCachedTraceHistograms = cachedQuery(
  (ids: number[]): Promise<TraceHistogramMap> => getTraceHistograms(getDb(), ids),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'trace histograms',
  fetch: getCachedTraceHistograms,
});

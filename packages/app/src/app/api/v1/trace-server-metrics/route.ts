import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getTraceServerMetrics,
  TRACE_SERVER_METRICS_VERSION,
  type TraceServerMetrics,
} from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const maxDuration = 300;

export const CACHE_KEY_PREFIX = `trace-server-metrics-v${TRACE_SERVER_METRICS_VERSION}`;

const getCachedTraceServerMetrics = cachedQuery(
  (id: number): Promise<TraceServerMetrics | null> => getTraceServerMetrics(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

export const GET = idQueryRoute({
  logLabel: 'trace server metrics',
  fetch: getCachedTraceServerMetrics,
});

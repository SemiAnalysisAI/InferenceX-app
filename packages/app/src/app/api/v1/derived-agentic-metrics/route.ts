import { STATS_VERSION } from '@semianalysisai/inferencex-db/queries/agentic-aggregates';
import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getDerivedAgenticMetrics,
  type DerivedAgenticMetricMap,
} from '@semianalysisai/inferencex-db/queries/derived-agentic-metrics';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `derived-agentic-metrics-v${STATS_VERSION}`;

const getCachedDerivedAgenticMetrics = cachedQuery(
  (ids: number[]): Promise<DerivedAgenticMetricMap> => getDerivedAgenticMetrics(getDb(), ids),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'derived agentic metrics',
  fetch: getCachedDerivedAgenticMetrics,
});

import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getAgenticAggregates,
  STATS_VERSION,
  type AgenticAggregateMap,
} from '@semianalysisai/inferencex-db/queries/agentic-aggregates';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `agentic-aggregates-v${STATS_VERSION}`;

const getCachedAgenticAggregates = cachedQuery(
  (ids: number[]): Promise<AgenticAggregateMap> => getAgenticAggregates(getDb(), ids),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'agentic aggregates',
  fetch: getCachedAgenticAggregates,
});

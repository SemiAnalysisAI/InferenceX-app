import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { cachedJson } from '@/lib/api-cache';
import { createCachedRoute } from '@/lib/create-cached-route';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const _handle = createCachedRoute(
  () => {
    if (JSON_MODE) return Promise.resolve(jsonProvider.getReliabilityStats());
    return getReliabilityStats(getDb());
  },
  'reliability',
  { resource: 'reliability stats' },
);

export function GET(): Promise<Response> {
  if (FIXTURES_MODE) return Promise.resolve(cachedJson(loadFixture('reliability')));
  return _handle();
}

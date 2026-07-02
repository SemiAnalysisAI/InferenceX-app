import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAvailabilityData } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson } from '@/lib/api-cache';
import { createCachedRoute } from '@/lib/create-cached-route';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const _handle = createCachedRoute(
  () => {
    if (JSON_MODE) return Promise.resolve(jsonProvider.getAvailabilityData());
    return getAvailabilityData(getDb());
  },
  'availability',
  { resource: 'availability' },
);

export function GET(): Promise<Response> {
  if (FIXTURES_MODE) return Promise.resolve(cachedJson(loadFixture('availability')));
  return _handle();
}

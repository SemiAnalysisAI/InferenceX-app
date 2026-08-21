import { getDb } from '@semianalysisai/inferencex-db/connection';
import { STATS_VERSION } from '@semianalysisai/inferencex-db/queries/agentic-shared';
import {
  getResidentSequenceLengthSketches,
  type ResidentSequenceLengthSketches,
} from '@semianalysisai/inferencex-db/queries/resident-sequence-lengths';

import { cachedQuery } from '@/lib/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `resident-sequence-lengths-v${STATS_VERSION}`;

const getCachedResidentSequenceLengths = cachedQuery(
  (ids: number[]): Promise<ResidentSequenceLengthSketches> =>
    getResidentSequenceLengthSketches(getDb(), ids),
  CACHE_KEY_PREFIX,
);

/**
 * GET /api/v1/resident-sequence-lengths?ids=1,2,3
 *
 * Returns one mergeable ISL/OSL sketch for the requested resident chart
 * points. The client chunks large charts and merges these bounded payloads.
 */
export const GET = idsQueryRoute({
  maxIds: 200,
  logLabel: 'resident sequence lengths',
  fetch: getCachedResidentSequenceLengths,
});

import { readFromPayloadDbs } from '@semianalysisai/inferencex-db/lib/payload-db';
import { STATS_VERSION } from '@semianalysisai/inferencex-db/queries/agentic-shared';
import {
  getResidentSequenceLengthSketches,
  mergeResidentSequenceLengthSketches,
  type ResidentSequenceLengthSketches,
} from '@semianalysisai/inferencex-db/queries/resident-sequence-lengths';

import { cachedQuery } from '@/lib/cache/api-cache';

import { idsQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

export const CACHE_KEY_PREFIX = `resident-sequence-lengths-v${STATS_VERSION}`;

const getCachedResidentSequenceLengths = cachedQuery(
  async (ids: number[]): Promise<ResidentSequenceLengthSketches> =>
    mergeResidentSequenceLengthSketches(
      await readFromPayloadDbs(ids, getResidentSequenceLengthSketches),
    ),
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

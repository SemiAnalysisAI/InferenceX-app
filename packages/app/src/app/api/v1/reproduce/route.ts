import { getPayloadDb } from '@semianalysisai/inferencex-db/lib/payload-db';
import { getReproduceSource } from '@semianalysisai/inferencex-db/queries/reproduce';

import { cachedQuery } from '@/lib/cache/api-cache';
import { buildReproducePayload, type ReproducePayload } from '@/lib/reproduce/reproduce-payload';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedReproduce = cachedQuery(async (id: number): Promise<ReproducePayload | null> => {
  const source = await getReproduceSource(await getPayloadDb(id), id);
  return source ? buildReproducePayload(id, source) : null;
}, 'reproduce');

/** GET /api/v1/reproduce?id=N. Stored config, producing run, and launch facts from the point's logs. */
export const GET = idQueryRoute({
  logLabel: 'reproduce record',
  fetch: getCachedReproduce,
});

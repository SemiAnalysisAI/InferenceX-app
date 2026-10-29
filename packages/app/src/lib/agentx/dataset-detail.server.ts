import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getDataset, type DatasetDetail } from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedQuery } from '@/lib/cache/api-cache';

/**
 * One dataset by slug, shared by `/api/v1/datasets/[slug]` and the `/agentx/[slug]` pages so both
 * read the same cache entry. Keyed per slug, so a newly ingested dataset resolves on its first
 * request instead of waiting for a purge of a cached whole-catalog list.
 */
export const getCachedDataset = cachedQuery(
  (slug: string): Promise<DatasetDetail | null> => getDataset(getDb(), slug),
  'dataset',
);

import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import type { DatasetDetail } from '@semianalysisai/inferencex-db/queries/datasets';

import { getCachedDataset } from '@/lib/agentx/dataset-detail.server';

export type DatasetPageLookup =
  | { kind: 'found'; record: DatasetDetail }
  | { kind: 'missing' }
  /** Fixture builds have no database; the client fetch (mocked in e2e) decides what renders. */
  | { kind: 'unchecked' };

/** Resolves an /agentx/[slug] page so unknown slugs can 404 instead of rendering an empty shell. */
export async function lookupDatasetPage(slug: string): Promise<DatasetPageLookup> {
  if (FIXTURES_MODE) return { kind: 'unchecked' };
  const record = await getCachedDataset(slug);
  return record ? { kind: 'found', record } : { kind: 'missing' };
}

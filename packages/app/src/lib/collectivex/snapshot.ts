import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import type {
  CollectiveXDataset,
  CollectiveXRunSummary,
} from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import { loadFixture } from '@/lib/testing/test-fixtures';

/**
 * The CollectiveX data a deployment serves: `scripts/sync-collectivex.ts`
 * assembles it at build time from the result files committed on InferenceX
 * `main`, so it changes only with a new build.
 */
export interface CollectiveXSnapshot {
  summary: CollectiveXRunSummary;
  dataset: CollectiveXDataset;
}

/**
 * Relative to packages/app, the working directory of `next build`, `next start`,
 * and the deployed functions; `outputFileTracingIncludes` bundles it with the
 * CollectiveX routes.
 */
export const COLLECTIVEX_SNAPSHOT_FILE = '.collectivex/snapshot.json';

let cached: CollectiveXSnapshot | undefined;

/**
 * The bundled snapshot, read once per server instance. Null when the build
 * produced none, which the routes report as 503; throws when it is unreadable.
 * Cypress fixture mode serves the synthetic `collectivex-latest` dataset instead.
 */
export async function loadCollectiveXSnapshot(): Promise<CollectiveXSnapshot | null> {
  if (FIXTURES_MODE) {
    const dataset = loadFixture<CollectiveXDataset>('collectivex-latest');
    return { summary: buildRunSummary(dataset), dataset };
  }
  if (cached) return cached;
  let body: string;
  try {
    body = await readFile(path.join(process.cwd(), COLLECTIVEX_SNAPSHOT_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const snapshot = JSON.parse(body) as Partial<CollectiveXSnapshot> | null;
  if (!snapshot?.summary || !snapshot.dataset?.run) {
    throw new Error(`${COLLECTIVEX_SNAPSHOT_FILE} is not a CollectiveX snapshot`);
  }
  cached = snapshot as CollectiveXSnapshot;
  return cached;
}

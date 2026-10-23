import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  type AvailabilityRow,
  getAvailabilityData,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedQuery } from '@/lib/cache/api-cache';
import { loadFixture } from '@/lib/testing/test-fixtures';
import {
  allCanonicalComparePairs,
  type ComparePair,
  COMPARE_MODEL_SLUGS,
} from '@/lib/compare/compare-slug';

export const getCachedAvailability = cachedQuery(() => {
  if (FIXTURES_MODE) return Promise.resolve(loadFixture<AvailabilityRow[]>('availability'));

  return getAvailabilityData(getDb());
}, 'availability');

export function buildDbKeyToSlugMap(): Map<string, string> {
  const dbKeyToSlug = new Map<string, string>();
  for (const m of COMPARE_MODEL_SLUGS) {
    for (const dbKey of m.dbKeys) dbKeyToSlug.set(dbKey, m.slug);
  }
  return dbKeyToSlug;
}

async function getHardwareByModelSlug(): Promise<Map<string, Set<string>>> {
  const rows = await getCachedAvailability();
  const dbKeyToSlug = buildDbKeyToSlugMap();
  const out = new Map<string, Set<string>>();
  for (const m of COMPARE_MODEL_SLUGS) out.set(m.slug, new Set());
  for (const row of rows) {
    const slug = dbKeyToSlug.get(row.model);
    if (!slug) continue;
    out.get(slug)!.add(row.hardware);
  }
  return out;
}

export async function getComparablePairsByModelSlug(): Promise<Map<string, ComparePair[]>> {
  const hwByModel = await getHardwareByModelSlug();
  const allPairs = allCanonicalComparePairs();
  const out = new Map<string, ComparePair[]>();
  for (const m of COMPARE_MODEL_SLUGS) {
    const hw = hwByModel.get(m.slug) ?? new Set();
    out.set(
      m.slug,
      allPairs.filter((p) => hw.has(p.a) && hw.has(p.b)),
    );
  }
  return out;
}

export async function getAllComparableCompareSlugs(): Promise<
  { modelSlug: string; a: string; b: string }[]
> {
  const byModel = await getComparablePairsByModelSlug();
  const out: { modelSlug: string; a: string; b: string }[] = [];
  for (const [modelSlug, pairs] of byModel.entries()) {
    for (const p of pairs) out.push({ modelSlug, a: p.a, b: p.b });
  }
  return out;
}

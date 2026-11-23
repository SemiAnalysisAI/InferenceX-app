import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeAvailabilityRows } from '@semianalysisai/inferencex-db/queries/across-dbs';
import {
  type AvailabilityRow,
  getAvailabilityData,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedQuery } from '@/lib/cache/api-cache';
import { loadFixture } from '@/lib/testing/test-fixtures';
import { getAllChipPages } from '@/lib/catalog/chip-pages';
import {
  allCanonicalComparePairs,
  canonicalCompareSlug,
  type ComparePair,
  COMPARE_MODEL_SLUGS,
  PUBLIC_COMPARE_MODEL_SLUGS,
} from '@/lib/compare/compare-slug';

export const getCachedAvailability = cachedQuery(async () => {
  if (FIXTURES_MODE) return loadFixture<AvailabilityRow[]>('availability');

  return mergeAvailabilityRows(await readEachDb(getAvailabilityData));
}, 'availability');

export function buildDbKeyToSlugMap(): Map<string, string> {
  const dbKeyToSlug = new Map<string, string>();
  for (const m of COMPARE_MODEL_SLUGS) {
    for (const dbKey of m.dbKeys) dbKeyToSlug.set(dbKey, m.slug);
  }
  return dbKeyToSlug;
}

function hardwareByModelSlug(rows: readonly AvailabilityRow[]): Map<string, Set<string>> {
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

/** Hardware keys with benchmark rows, keyed by model slug. */
export async function getHardwareByModelSlug(): Promise<Map<string, Set<string>>> {
  return hardwareByModelSlug(await getCachedAvailability());
}

export async function getComparablePairsByModelSlug(
  rows?: readonly AvailabilityRow[],
): Promise<Map<string, ComparePair[]>> {
  const hwByModel = hardwareByModelSlug(rows ?? (await getCachedAvailability()));
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

export async function getAllComparableCompareSlugs(
  rows?: readonly AvailabilityRow[],
): Promise<{ modelSlug: string; a: string; b: string }[]> {
  const byModel = await getComparablePairsByModelSlug(rows);
  const out: { modelSlug: string; a: string; b: string }[] = [];
  for (const [modelSlug, pairs] of byModel.entries()) {
    for (const p of pairs) out.push({ modelSlug, a: p.a, b: p.b });
  }
  return out;
}

/** Compare detail slugs (per family and locale) built at deploy time. */
export const PRERENDERED_COMPARE_SLUG_LIMIT = 120;

/**
 * A deploy starts with an empty ISR cache, so every compare page left out here renders on its
 * first visit after each deploy. Builds the public models with the newest results first, pairing
 * the chips that have their own chip page, up to `limit` slugs.
 */
export function prerenderedCompareSlugs(
  rows: readonly AvailabilityRow[],
  limit = PRERENDERED_COMPARE_SLUG_LIMIT,
): string[] {
  const chipHardware = new Set(getAllChipPages().map((chip) => chip.hwKey));
  const dbKeyToSlug = buildDbKeyToSlugMap();
  const newest = new Map<string, string>();
  const hardware = new Map<string, Set<string>>();
  for (const row of rows) {
    const modelSlug = dbKeyToSlug.get(row.model);
    if (!modelSlug || !chipHardware.has(row.hardware)) continue;
    if (row.date > (newest.get(modelSlug) ?? '')) newest.set(modelSlug, row.date);
    const modelHardware = hardware.get(modelSlug) ?? new Set<string>();
    modelHardware.add(row.hardware);
    hardware.set(modelSlug, modelHardware);
  }
  const models = PUBLIC_COMPARE_MODEL_SLUGS.filter((model) => newest.has(model.slug)).toSorted(
    (x, y) => newest.get(y.slug)!.localeCompare(newest.get(x.slug)!),
  );
  const pairs = allCanonicalComparePairs();
  const slugs: string[] = [];
  for (const model of models) {
    const modelHardware = hardware.get(model.slug)!;
    for (const { a, b } of pairs) {
      if (slugs.length === limit) return slugs;
      if (modelHardware.has(a) && modelHardware.has(b)) {
        slugs.push(canonicalCompareSlug(model.slug, a, b));
      }
    }
  }
  return slugs;
}

export async function getPrerenderedCompareParams(): Promise<{ slug: string }[]> {
  return prerenderedCompareSlugs(await getCachedAvailability()).map((slug) => ({ slug }));
}

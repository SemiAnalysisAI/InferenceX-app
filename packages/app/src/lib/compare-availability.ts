/**
 * Server-side helper: for each canonical compare model slug, returns the list
 * of GPU pairs that actually have benchmark data on both sides.
 *
 * Used by the /compare index, the sitemap, and the [slug] generateStaticParams
 * to avoid emitting cards / URLs for (model, pair) combinations where one or
 * both GPUs have no rows for that model. A pair is "comparable" if both GPU
 * keys appear in the availability table for any of the model's dbKeys.
 *
 * The page-level handler at /compare/[slug] still renders the empty-state
 * fallback if a user reaches a filtered-out URL directly, so this filtering
 * is purely an indexing/navigation concern, not a hard gate.
 */

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  type AvailabilityRow,
  getAvailabilityData,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';
import {
  allCanonicalComparePairs,
  type ComparePair,
  COMPARE_MODEL_SLUGS,
} from '@/lib/compare-slug';

const getCachedAvailability = cachedQuery(() => {
  if (FIXTURES_MODE) return Promise.resolve(loadFixture<AvailabilityRow[]>('availability'));
  if (JSON_MODE) return Promise.resolve(jsonProvider.getAvailabilityData());
  return getAvailabilityData(getDb());
}, 'availability');

/** Map from canonical model slug → set of GPU keys that have benchmark rows
 *  for any of the model's dbKeys. */
async function getHardwareByModelSlug(): Promise<Map<string, Set<string>>> {
  const rows = await getCachedAvailability();
  // Build a quick dbKey → modelSlug index so each row maps to at most one slug.
  const dbKeyToSlug = new Map<string, string>();
  for (const m of COMPARE_MODEL_SLUGS) {
    for (const dbKey of m.dbKeys) dbKeyToSlug.set(dbKey, m.slug);
  }
  const out = new Map<string, Set<string>>();
  for (const m of COMPARE_MODEL_SLUGS) out.set(m.slug, new Set());
  for (const row of rows) {
    const slug = dbKeyToSlug.get(row.model);
    if (!slug) continue;
    out.get(slug)!.add(row.hardware);
  }
  return out;
}

/** For each canonical model slug, return the GPU pairs where both GPUs have
 *  benchmark data for that model. Pairs are alphabetical (a < b), matching
 *  the canonical slug ordering. Returns empty list for models with fewer than
 *  2 GPUs that have data. */
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

/** Flattened cross-product of (model, comparable pair). Used by the sitemap
 *  and by `generateStaticParams` so neither emits URLs for empty pairs. */
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

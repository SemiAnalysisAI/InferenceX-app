/**
 * Server-side availability enumeration for precision-compare and
 * spec-decode-compare routes.
 *
 * Mirrors the pattern in compare-availability.ts but queries precision
 * and spec_method dimensions rather than hardware pairs.
 */

import { GPU_KEYS, SPEC_METHOD_KEYS } from '@semianalysisai/inferencex-constants';

import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { buildDbKeyToSlugMap, getCachedAvailability } from '@/lib/compare-availability';
import {
  orderPrecisionPair,
  PRECISION_SLUG_ORDER,
  PRECISION_SLUG_TOKENS,
  SPEC_METHODS_ACTIVE,
} from '@/lib/compare-variant-slug';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrecisionPair {
  gpu: string;
  precA: string;
  precB: string;
}

export interface SpecDecodePair {
  gpu: string;
  method: string;
}

// ---------------------------------------------------------------------------
// Internal: precision allowlist
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Precision pairs
// ---------------------------------------------------------------------------

/** For each canonical model slug, return the (gpu, precA, precB) combos where
 *  both precisions have benchmark data on that GPU. Pairs use canonical
 *  PRECISION_SLUG_ORDER ordering. Output sorted by model slug order, GPU
 *  alphabetical, pairs by canonical precision order. */
export async function getPrecisionPairsByModelSlug(): Promise<Map<string, PrecisionPair[]>> {
  const rows = await getCachedAvailability();
  const dbKeyToSlug = buildDbKeyToSlugMap();

  // Collect distinct precisions per (modelSlug, gpu).
  const precByModelGpu = new Map<string, Set<string>>();
  for (const row of rows) {
    const slug = dbKeyToSlug.get(row.model);
    if (!slug) continue;
    if (!GPU_KEYS.has(row.hardware)) continue;
    if (!PRECISION_SLUG_TOKENS.has(row.precision)) continue;
    const key = `${slug}\0${row.hardware}`;
    let s = precByModelGpu.get(key);
    if (!s) {
      s = new Set();
      precByModelGpu.set(key, s);
    }
    s.add(row.precision);
  }

  // Build output map — iterate models in COMPARE_MODEL_SLUGS order.
  const out = new Map<string, PrecisionPair[]>();
  for (const m of COMPARE_MODEL_SLUGS) {
    const pairs: PrecisionPair[] = [];

    // Collect GPUs for this model that have >=2 precisions.
    const gpus: string[] = [];
    for (const [key, precs] of precByModelGpu.entries()) {
      if (!key.startsWith(`${m.slug}\0`)) continue;
      if (precs.size < 2) continue;
      gpus.push(key.split('\0')[1]);
    }
    gpus.sort();

    for (const gpu of gpus) {
      const precs = precByModelGpu.get(`${m.slug}\0${gpu}`)!;
      // Sort precisions by PRECISION_SLUG_ORDER index.
      const sorted = [...precs].toSorted(
        (a, b) =>
          (PRECISION_SLUG_TOKENS.has(a) ? PRECISION_SLUG_ORDER.indexOf(a) : 999) -
          (PRECISION_SLUG_TOKENS.has(b) ? PRECISION_SLUG_ORDER.indexOf(b) : 999),
      );
      // Generate all C(n,2) pairs in canonical order.
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const [precA, precB] = orderPrecisionPair(sorted[i], sorted[j]);
          pairs.push({ gpu, precA, precB });
        }
      }
    }

    out.set(m.slug, pairs);
  }

  return out;
}

/** Flattened list of all comparable precision slugs. Sorted by model slug
 *  order, GPU alphabetical, pairs by canonical precision order. */
export async function getAllComparablePrecisionSlugs(): Promise<
  { modelSlug: string; gpu: string; precA: string; precB: string }[]
> {
  const byModel = await getPrecisionPairsByModelSlug();
  const result: { modelSlug: string; gpu: string; precA: string; precB: string }[] = [];
  // Iterate in COMPARE_MODEL_SLUGS order (Map preserves insertion order).
  for (const [modelSlug, pairs] of byModel.entries()) {
    for (const p of pairs) {
      result.push({ modelSlug, gpu: p.gpu, precA: p.precA, precB: p.precB });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Spec-decode pairs
// ---------------------------------------------------------------------------

/** For each canonical model slug, return the (gpu, method) combos where both
 *  the method AND 'none' have benchmark data on that GPU. Output sorted by
 *  model slug order, GPU alphabetical, methods alphabetical. */
export async function getSpecDecodePairsByModelSlug(): Promise<Map<string, SpecDecodePair[]>> {
  const rows = await getCachedAvailability();
  const dbKeyToSlug = buildDbKeyToSlugMap();

  // Collect distinct spec_methods per (modelSlug, gpu).
  const methodsByModelGpu = new Map<string, Set<string>>();
  for (const row of rows) {
    const slug = dbKeyToSlug.get(row.model);
    if (!slug) continue;
    if (!GPU_KEYS.has(row.hardware)) continue;
    // Accept methods present in data that are in SPEC_METHOD_KEYS.
    if (!SPEC_METHOD_KEYS.has(row.spec_method)) continue;
    const key = `${slug}\0${row.hardware}`;
    let s = methodsByModelGpu.get(key);
    if (!s) {
      s = new Set();
      methodsByModelGpu.set(key, s);
    }
    s.add(row.spec_method);
  }

  const out = new Map<string, SpecDecodePair[]>();
  for (const m of COMPARE_MODEL_SLUGS) {
    const pairs: SpecDecodePair[] = [];

    const gpus: string[] = [];
    for (const [key, methods] of methodsByModelGpu.entries()) {
      if (!key.startsWith(`${m.slug}\0`)) continue;
      // Need both 'none' and at least one active method.
      if (!methods.has('none')) continue;
      const active = [...methods].filter((meth) => SPEC_METHODS_ACTIVE.has(meth));
      if (active.length === 0) continue;
      gpus.push(key.split('\0')[1]);
    }
    gpus.sort();

    for (const gpu of gpus) {
      const methods = methodsByModelGpu.get(`${m.slug}\0${gpu}`)!;
      const active = [...methods].filter((meth) => SPEC_METHODS_ACTIVE.has(meth)).toSorted();
      for (const method of active) {
        pairs.push({ gpu, method });
      }
    }

    out.set(m.slug, pairs);
  }

  return out;
}

/** Flattened list of all comparable spec-decode slugs. Sorted by model slug
 *  order, GPU alphabetical, methods alphabetical. */
export async function getAllComparableSpecDecodeSlugs(): Promise<
  { modelSlug: string; gpu: string; method: string }[]
> {
  const byModel = await getSpecDecodePairsByModelSlug();
  const result: { modelSlug: string; gpu: string; method: string }[] = [];
  for (const [modelSlug, pairs] of byModel.entries()) {
    for (const p of pairs) {
      result.push({ modelSlug, gpu: p.gpu, method: p.method });
    }
  }
  return result;
}

/**
 * Slug parsing, canonicalization, and display-label helpers for the
 * precision-compare (`/compare-precision/[slug]`) and spec-decode-compare
 * (`/compare-spec-decode/[slug]`) routes.
 *
 * Slug formats:
 * - Precision:   `{model}-{gpu}-{precA}-vs-{precB}`
 * - Spec decode: `{model}-{gpu}-{precision}-{method}-vs-none`
 *
 * Both families require a model prefix — there is no legacy bare form.
 */

import {
  GPU_KEYS,
  SPEC_METHOD_KEYS,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import {
  type CompareModelSlug,
  COMPARE_MODEL_SLUGS,
  COMPARE_MODEL_ALIASES,
  getCompareModelBySlug,
} from '@/lib/compare-slug';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEPARATOR = '-vs-';

/** Precision tokens ordered by ascending bit-width. Canonical pair order =
 *  index order (lower index is side A). */
export const PRECISION_SLUG_ORDER: readonly string[] = [
  'fp4',
  'nvfp4',
  'mxfp4',
  'int4',
  'fp4fp8',
  'fp8',
  'bf16',
];

const PRECISION_INDEX = new Map(PRECISION_SLUG_ORDER.map((p, i) => [p, i]));
export const PRECISION_SLUG_TOKENS = new Set(PRECISION_SLUG_ORDER);
const CANONICAL_MODEL_SLUGS_SET = new Set(COMPARE_MODEL_SLUGS.map((m) => m.slug));

/** Active spec-decode methods (everything in SPEC_METHOD_KEYS except 'none').
 *  Data-driven — adding 'eagle' to SPEC_METHOD_KEYS later just works. */
export const SPEC_METHODS_ACTIVE = new Set([...SPEC_METHOD_KEYS].filter((k) => k !== 'none'));

// ---------------------------------------------------------------------------
// Precision pair ordering
// ---------------------------------------------------------------------------

/** Return [p1, p2] in canonical order (lower PRECISION_SLUG_ORDER index first).
 *  Unknown tokens sort after all known tokens. */
export function orderPrecisionPair(p1: string, p2: string): [string, string] {
  const i1 = PRECISION_INDEX.get(p1) ?? Number.MAX_SAFE_INTEGER;
  const i2 = PRECISION_INDEX.get(p2) ?? Number.MAX_SAFE_INTEGER;
  return i1 <= i2 ? [p1, p2] : [p2, p1];
}

// ---------------------------------------------------------------------------
// Precision compare slug
// ---------------------------------------------------------------------------

export interface PrecisionCompareSlug {
  model: CompareModelSlug;
  gpu: string;
  precA: string;
  precB: string;
  /** True when the URL used a model alias (e.g. `kimi` instead of `kimi-k26`).
   *  Caller should redirect to the canonical model-prefixed URL. */
  isAliasModel: boolean;
}

/** Parse `{model}-{gpu}-{precA}-vs-{precB}`. Preserves URL order — caller
 *  redirects to canonical if precA/precB are not in canonical order.
 *
 *  Algorithm: split on `-vs-`, validate right side as a precision token, then
 *  walk the left side backwards — precision tokens and GPU keys contain no
 *  hyphens, so `lastIndexOf('-')` cleanly separates each layer. Model prefix
 *  is REQUIRED (no legacy bare form). */
export function parsePrecisionCompareSlug(slug: string): PrecisionCompareSlug | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const sepIdx = lower.indexOf(SEPARATOR);
  if (sepIdx <= 0) return null;

  const precB = lower.slice(sepIdx + SEPARATOR.length);
  if (!precB || !PRECISION_SLUG_TOKENS.has(precB)) return null;

  const prefix = lower.slice(0, sepIdx);
  if (!prefix) return null;

  // prefix = '{model}-{gpu}-{precA}'
  const lastDash1 = prefix.lastIndexOf('-');
  if (lastDash1 === -1) return null;
  const precA = prefix.slice(lastDash1 + 1);
  if (!PRECISION_SLUG_TOKENS.has(precA) || precA === precB) return null;

  const remainder = prefix.slice(0, lastDash1);
  if (!remainder) return null;

  // remainder = '{model}-{gpu}'
  const lastDash2 = remainder.lastIndexOf('-');
  if (lastDash2 === -1) return null; // model prefix required
  const gpu = remainder.slice(lastDash2 + 1);
  if (!GPU_KEYS.has(gpu)) return null;

  const modelPart = remainder.slice(0, lastDash2);
  if (!modelPart) return null;

  // Resolve model slug.
  let isAliasModel = false;
  let resolvedSlug: string;
  if (CANONICAL_MODEL_SLUGS_SET.has(modelPart)) {
    resolvedSlug = modelPart;
  } else if (COMPARE_MODEL_ALIASES[modelPart]) {
    resolvedSlug = COMPARE_MODEL_ALIASES[modelPart];
    isAliasModel = true;
  } else {
    return null;
  }

  const model = getCompareModelBySlug(resolvedSlug);
  if (!model) return null;

  return { model, gpu, precA, precB, isAliasModel };
}

/** Canonical precision-compare slug. Precisions ordered by
 *  PRECISION_SLUG_ORDER so a stable URL exists for each combination. */
export function canonicalPrecisionCompareSlug(
  modelSlug: string,
  gpu: string,
  p1: string,
  p2: string,
): string {
  const [first, second] = orderPrecisionPair(p1, p2);
  return `${modelSlug}-${gpu}-${first}${SEPARATOR}${second}`;
}

/** Human-readable label: known Precision enum values use `getPrecisionLabel`
 *  (e.g. `'fp4fp8'` -> `'FP4+FP8'`); everything else uppercases. */
export function precisionDisplayLabel(p: string): string {
  const label = getPrecisionLabel(p as Precision);
  // getPrecisionLabel returns the input string unchanged for unknown values.
  if (label !== p) return label;
  return p.toUpperCase();
}

// ---------------------------------------------------------------------------
// Spec-decode compare slug
// ---------------------------------------------------------------------------

export interface SpecDecodeCompareSlug {
  model: CompareModelSlug;
  gpu: string;
  precision: string;
  method: string;
  isAliasModel: boolean;
}

/** Parse `{model}-{gpu}-{precision}-{method}-vs-none`. Also accepts the
 *  reversed form `{model}-{gpu}-{precision}-none-vs-{method}` (caller should
 *  redirect to canonical).
 *
 *  Canonical form (right === 'none'): from the left side, peel tokens
 *  right-to-left — method (must be in SPEC_METHODS_ACTIVE), precision (must be
 *  in PRECISION_SLUG_TOKENS), gpu (GPU_KEYS), remainder = model slug.
 *
 *  Reversed form (right is a method in SPEC_METHODS_ACTIVE): left side ends
 *  with '-none' preceded by precision/gpu/model —
 *  `{model}-{gpu}-{prec}-none-vs-{method}`. */
export function parseSpecDecodeCompareSlug(slug: string): SpecDecodeCompareSlug | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const sepIdx = lower.indexOf(SEPARATOR);
  if (sepIdx <= 0) return null;

  const right = lower.slice(sepIdx + SEPARATOR.length);
  const prefix = lower.slice(0, sepIdx);
  if (!prefix || !right) return null;

  let method: string;
  let modelGpuPrecPart: string;

  if (right === 'none') {
    // Canonical form: {model}-{gpu}-{precision}-{method}-vs-none
    // Peel method (last token of left side).
    const lastDash = prefix.lastIndexOf('-');
    if (lastDash === -1) return null;
    const candidate = prefix.slice(lastDash + 1);
    if (!SPEC_METHODS_ACTIVE.has(candidate)) return null;
    method = candidate;
    modelGpuPrecPart = prefix.slice(0, lastDash);
  } else if (SPEC_METHODS_ACTIVE.has(right)) {
    // Reversed form: {model}-{gpu}-{precision}-none-vs-{method}
    // Left side must end with '-none'.
    const lastDash = prefix.lastIndexOf('-');
    if (lastDash === -1) return null;
    const lastToken = prefix.slice(lastDash + 1);
    if (lastToken !== 'none') return null;
    method = right;
    modelGpuPrecPart = prefix.slice(0, lastDash);
  } else {
    return null;
  }

  if (!modelGpuPrecPart) return null;

  // modelGpuPrecPart = '{model}-{gpu}-{precision}'
  // Peel precision (last token).
  const precDash = modelGpuPrecPart.lastIndexOf('-');
  if (precDash === -1) return null;
  const precision = modelGpuPrecPart.slice(precDash + 1);
  if (!PRECISION_SLUG_TOKENS.has(precision)) return null;

  const modelGpuPart = modelGpuPrecPart.slice(0, precDash);
  if (!modelGpuPart) return null;

  // modelGpuPart = '{model}-{gpu}'
  const gpuDash = modelGpuPart.lastIndexOf('-');
  if (gpuDash === -1) return null; // model prefix required
  const gpu = modelGpuPart.slice(gpuDash + 1);
  if (!GPU_KEYS.has(gpu)) return null;

  const modelPart = modelGpuPart.slice(0, gpuDash);
  if (!modelPart) return null;

  let isAliasModel = false;
  let resolvedSlug: string;
  if (CANONICAL_MODEL_SLUGS_SET.has(modelPart)) {
    resolvedSlug = modelPart;
  } else if (COMPARE_MODEL_ALIASES[modelPart]) {
    resolvedSlug = COMPARE_MODEL_ALIASES[modelPart];
    isAliasModel = true;
  } else {
    return null;
  }

  const model = getCompareModelBySlug(resolvedSlug);
  if (!model) return null;

  return { model, gpu, precision, method, isAliasModel };
}

/** Canonical spec-decode slug: `{model}-{gpu}-{precision}-{method}-vs-none`. */
export function canonicalSpecDecodeCompareSlug(
  modelSlug: string,
  gpu: string,
  precision: string,
  method: string,
): string {
  return `${modelSlug}-${gpu}-${precision}-${method}${SEPARATOR}none`;
}

/** Display label for a speculative decoding method.
 *  `'none'` -> `'Off'`; otherwise delegates to `resolveFrameworkPartLabel`
 *  which yields e.g. `'M3 EAGLE'` for MiniMax-M3 mtp, `'MTP'` otherwise. */
export function specMethodDisplayLabel(
  modelDisplayName: string | undefined,
  method: string,
): string {
  if (method === 'none') return 'Off';
  return resolveFrameworkPartLabel(modelDisplayName, method);
}

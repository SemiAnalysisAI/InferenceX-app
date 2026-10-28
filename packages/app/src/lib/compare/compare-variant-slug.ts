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
} from '@/lib/compare/compare-slug';
import { type Precision, getPrecisionLabel } from '@/lib/catalog/data-mappings';

const SEPARATOR = '-vs-';

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

export const SPEC_METHODS_ACTIVE = new Set([...SPEC_METHOD_KEYS].filter((k) => k !== 'none'));

export function orderPrecisionPair(p1: string, p2: string): [string, string] {
  const i1 = PRECISION_INDEX.get(p1) ?? Number.MAX_SAFE_INTEGER;
  const i2 = PRECISION_INDEX.get(p2) ?? Number.MAX_SAFE_INTEGER;
  return i1 <= i2 ? [p1, p2] : [p2, p1];
}

export interface PrecisionCompareSlug {
  model: CompareModelSlug;
  gpu: string;
  precA: string;
  precB: string;
  isAliasModel: boolean;
}

export function parsePrecisionCompareSlug(slug: string): PrecisionCompareSlug | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const sepIdx = lower.indexOf(SEPARATOR);
  if (sepIdx <= 0) return null;

  const precB = lower.slice(sepIdx + SEPARATOR.length);
  if (!precB || !PRECISION_SLUG_TOKENS.has(precB)) return null;

  const prefix = lower.slice(0, sepIdx);
  if (!prefix) return null;

  const lastDash1 = prefix.lastIndexOf('-');
  if (lastDash1 === -1) return null;
  const precA = prefix.slice(lastDash1 + 1);
  if (!PRECISION_SLUG_TOKENS.has(precA) || precA === precB) return null;

  const remainder = prefix.slice(0, lastDash1);
  if (!remainder) return null;

  const lastDash2 = remainder.lastIndexOf('-');
  if (lastDash2 === -1) return null;
  const gpu = remainder.slice(lastDash2 + 1);
  if (!GPU_KEYS.has(gpu)) return null;

  const modelPart = remainder.slice(0, lastDash2);
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

  return { model, gpu, precA, precB, isAliasModel };
}

export function canonicalPrecisionCompareSlug(
  modelSlug: string,
  gpu: string,
  p1: string,
  p2: string,
): string {
  const [first, second] = orderPrecisionPair(p1, p2);
  return `${modelSlug}-${gpu}-${first}${SEPARATOR}${second}`;
}

export function precisionDisplayLabel(p: string): string {
  const label = getPrecisionLabel(p as Precision);
  if (label !== p) return label;
  return p.toUpperCase();
}

export interface SpecDecodeCompareSlug {
  model: CompareModelSlug;
  gpu: string;
  precision: string;
  method: string;
  isAliasModel: boolean;
}

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
    const lastDash = prefix.lastIndexOf('-');
    if (lastDash === -1) return null;
    const candidate = prefix.slice(lastDash + 1);
    if (!SPEC_METHODS_ACTIVE.has(candidate)) return null;
    method = candidate;
    modelGpuPrecPart = prefix.slice(0, lastDash);
  } else if (SPEC_METHODS_ACTIVE.has(right)) {
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

  const precDash = modelGpuPrecPart.lastIndexOf('-');
  if (precDash === -1) return null;
  const precision = modelGpuPrecPart.slice(precDash + 1);
  if (!PRECISION_SLUG_TOKENS.has(precision)) return null;

  const modelGpuPart = modelGpuPrecPart.slice(0, precDash);
  if (!modelGpuPart) return null;

  const gpuDash = modelGpuPart.lastIndexOf('-');
  if (gpuDash === -1) return null;
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

export function canonicalSpecDecodeCompareSlug(
  modelSlug: string,
  gpu: string,
  precision: string,
  method: string,
): string {
  return `${modelSlug}-${gpu}-${precision}-${method}${SEPARATOR}none`;
}

export function specMethodDisplayLabel(
  modelDisplayName: string | undefined,
  method: string,
): string {
  if (method === 'none') return 'Off';
  return resolveFrameworkPartLabel(modelDisplayName, method);
}

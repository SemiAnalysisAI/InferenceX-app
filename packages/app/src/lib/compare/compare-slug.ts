import { GPU_KEYS, HW_REGISTRY, MODEL_REGISTRY } from '@semianalysisai/inferencex-constants';

import { fitMetaTitle } from '../seo/meta-text';
import { isModelVisible, MODEL_OPTIONS } from '../catalog/data-mappings';

const SEPARATOR = '-vs-';

export interface CompareModelSlug {
  slug: string;
  displayName: string;
  dbKeys: string[];
  label: string;
  seoName: string;
}

/** Every selectable model, in selector order. */
export const COMPARE_MODEL_SLUGS: CompareModelSlug[] = MODEL_OPTIONS.map((displayName) => {
  const entry = MODEL_REGISTRY[displayName];
  return {
    slug: entry.slug,
    displayName,
    dbKeys: [...entry.dbKeys],
    label: entry.pageLabel ?? entry.label,
    seoName: entry.seoName,
  };
});

/** Discovery only; parsers and read-only API contracts retain the complete registry. */
export const PUBLIC_COMPARE_MODEL_SLUGS = COMPARE_MODEL_SLUGS.filter((entry) =>
  isModelVisible(entry.displayName),
);

export const COMPARE_MODEL_ALIASES: Record<string, string> = Object.fromEntries(
  Object.values(MODEL_REGISTRY).flatMap((entry) =>
    (entry.slugAliases ?? []).map((alias) => [alias, entry.slug]),
  ),
);

export const LEGACY_BARE_DEFAULT_MODEL_SLUG = 'deepseek-r1';

const SLUG_TO_MODEL: Record<string, CompareModelSlug> = Object.fromEntries(
  COMPARE_MODEL_SLUGS.map((m) => [m.slug, m]),
);
const CANONICAL_MODEL_SLUGS = new Set(COMPARE_MODEL_SLUGS.map((m) => m.slug));

export function getCompareModelBySlug(slug: string): CompareModelSlug | null {
  const canonical = COMPARE_MODEL_ALIASES[slug] ?? slug;
  return SLUG_TO_MODEL[canonical] ?? null;
}

const DISPLAY_NAME_TO_SLUG: Record<string, CompareModelSlug> = Object.fromEntries(
  COMPARE_MODEL_SLUGS.map((m) => [m.displayName, m]),
);

export function getModelSlugEntryForDisplayName(displayName: string): CompareModelSlug | null {
  return DISPLAY_NAME_TO_SLUG[displayName] ?? null;
}

export interface ComparePair {
  a: string;
  b: string;
}

export interface CompareSlug {
  model: CompareModelSlug;
  a: string;
  b: string;
  isLegacyBareSlug: boolean;
  isAliasModel: boolean;
}

export function parseCompareSlug(slug: string): CompareSlug | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const sepIdx = lower.indexOf(SEPARATOR);
  if (sepIdx <= 0) return null;

  const b = lower.slice(sepIdx + SEPARATOR.length);
  if (!b || !GPU_KEYS.has(b)) return null;

  const prefix = lower.slice(0, sepIdx);
  if (!prefix) return null;

  let a: string;
  let modelPart: string;
  const lastDash = prefix.lastIndexOf('-');
  if (lastDash === -1) {
    a = prefix;
    modelPart = '';
  } else {
    const candidate = prefix.slice(lastDash + 1);
    if (GPU_KEYS.has(candidate)) {
      a = candidate;
      modelPart = prefix.slice(0, lastDash);
    } else {
      return null;
    }
  }

  if (!GPU_KEYS.has(a) || a === b) return null;

  let modelSlug: string;
  let isLegacyBareSlug = false;
  let isAliasModel = false;
  if (modelPart === '') {
    modelSlug = LEGACY_BARE_DEFAULT_MODEL_SLUG;
    isLegacyBareSlug = true;
  } else if (CANONICAL_MODEL_SLUGS.has(modelPart)) {
    modelSlug = modelPart;
  } else if (COMPARE_MODEL_ALIASES[modelPart]) {
    modelSlug = COMPARE_MODEL_ALIASES[modelPart];
    isAliasModel = true;
  } else {
    return null;
  }

  const model = SLUG_TO_MODEL[modelSlug];
  if (!model) return null;
  return { model, a, b, isLegacyBareSlug, isAliasModel };
}

export function canonicalCompareSlug(modelSlug: string, a: string, b: string): string {
  const [first, second] = [a, b].toSorted();
  return `${modelSlug}-${first}${SEPARATOR}${second}`;
}

export function allCanonicalComparePairs(): ComparePair[] {
  const keys = [...GPU_KEYS].toSorted();
  const pairs: ComparePair[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairs.push({ a: keys[i], b: keys[j] });
    }
  }
  return pairs;
}

export function allCanonicalCompareSlugs(): { modelSlug: string; a: string; b: string }[] {
  const pairs = allCanonicalComparePairs();
  return COMPARE_MODEL_SLUGS.flatMap((m) => pairs.map((p) => ({ modelSlug: m.slug, ...p })));
}

export function compareDisplayLabel(a: string, b: string): string {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  return `${aLabel} vs ${bLabel}`;
}

export function compareModelDisplayLabel(model: CompareModelSlug, a: string, b: string): string {
  return `${model.label} — ${compareDisplayLabel(a, b)}`;
}

export function compareModelSeoName(model: CompareModelSlug): string {
  return model.seoName;
}

export function compareSeoTitle(gpuLabel: string, modelSeoName: string): string {
  return fitMetaTitle([
    `${gpuLabel}: ${modelSeoName} Inference Benchmark`,
    `${gpuLabel}: ${modelSeoName} Benchmark`,
    `${gpuLabel}: ${modelSeoName}`,
  ]);
}

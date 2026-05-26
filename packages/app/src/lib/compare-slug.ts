import { GPU_KEYS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

const SEPARATOR = '-vs-';

// ---------------------------------------------------------------------------
// Model registry for compare URLs
// ---------------------------------------------------------------------------
//
// The compare URL is `/compare/{model-slug}-{a}-vs-{b}` where {model-slug} is
// one of CANONICAL_MODEL_SLUGS. URL slugs are deliberately finer-grained than
// the dashboard's display-grouped model dropdown — `kimi-k25` and `kimi-k26`
// are distinct slugs even though both DB keys roll up to the single "Kimi-K2.5"
// display option in the UI. The slug encodes which DB bucket to query.
//
// `LEGACY_BARE_DEFAULT_MODEL_SLUG` is the model the parser falls back to when
// the URL has no model prefix at all (e.g. `/compare/h100-vs-h200`). PR #351
// shipped without a model prefix, so all pre-existing inbound links resolve
// here and get 308-redirected to the canonical model-prefixed URL.

export interface CompareModelSlug {
  /** Canonical URL slug, e.g. 'deepseek-r1'. Lowercase, hyphen-separated. */
  slug: string;
  /** Matches Model enum value passed via `?g_model=`, e.g. 'DeepSeek-R1-0528'. */
  displayName: string;
  /** DB keys to fetch from getLatestBenchmarks. Most models map to one key,
   *  but the slug stays finer-grained than the dashboard display grouping —
   *  e.g. `kimi-k26` only queries 'kimik2.6', not also 'kimik2.5'. */
  dbKeys: string[];
  /** Human label for OG image, metadata, and page header. */
  label: string;
}

// Order matches the master /compare and /compare-per-dollar index display:
// DeepSeek V4 Pro → R1 → Kimi → GLM → MiniMax → Qwen → gpt-oss → Llama 70B.
// Per product spec — flagship Chinese-developed models first, smaller open
// US-developed models at the bottom. Qwen sits between MiniMax and gpt-oss to
// keep the Chinese-lab cluster contiguous before the US transition.
export const COMPARE_MODEL_SLUGS: CompareModelSlug[] = [
  {
    slug: 'deepseek-v4',
    displayName: 'DeepSeek-V4-Pro',
    dbKeys: ['dsv4'],
    label: 'DeepSeek V4 Pro',
  },
  {
    slug: 'deepseek-r1',
    displayName: 'DeepSeek-R1-0528',
    dbKeys: ['dsr1'],
    label: 'DeepSeek R1',
  },
  {
    slug: 'kimi-k26',
    displayName: 'Kimi-K2.5',
    // Both K2.5 and K2.6 point releases share an architecture (mirroring
    // DISPLAY_MODEL_TO_DB in packages/constants/src/models.ts). The slug uses
    // the newer version name; the dbKey list pulls data from both DB buckets
    // so the slug is populated today and stays populated when K2.6 data lands.
    dbKeys: ['kimik2.6', 'kimik2.5'],
    // Slug groups two point releases sharing one architecture — the header
    // surfaces both versions so the URL doesn't read as "only K2.6".
    label: 'Kimi K2.5/K2.6',
  },
  {
    slug: 'glm-5-1',
    displayName: 'GLM-5',
    // GLM-5.0 and GLM-5.1 share an architecture per the model card; the slug
    // uses the newer version name but the data pull covers both DB buckets.
    dbKeys: ['glm5.1', 'glm5'],
    label: 'GLM 5/5.1',
  },
  {
    slug: 'minimax-m27',
    displayName: 'MiniMax-M2.5',
    // Same point-release grouping pattern as Kimi and GLM.
    dbKeys: ['minimaxm2.7', 'minimaxm2.5'],
    label: 'MiniMax M2.5/M2.7',
  },
  {
    slug: 'qwen-3-5',
    displayName: 'Qwen-3.5-397B-A17B',
    dbKeys: ['qwen3.5'],
    label: 'Qwen 3.5',
  },
  {
    slug: 'gptoss-120b',
    displayName: 'gpt-oss-120b',
    dbKeys: ['gptoss120b'],
    label: 'gpt-oss 120B',
  },
  {
    slug: 'llama-3-3-70b',
    displayName: 'Llama-3.3-70B-Instruct-FP8',
    dbKeys: ['llama70b'],
    label: 'Llama 3.3 70B',
  },
];

/** Family-level and older-version slugs that 308 to the canonical slug above.
 *  Used for backward compat ("deepseek" → "deepseek-r1") and for "same
 *  architecture, newer version supersedes" ("glm-5" → "glm-5-1"). */
export const COMPARE_MODEL_ALIASES: Record<string, string> = {
  deepseek: 'deepseek-r1',
  kimi: 'kimi-k26',
  'kimi-k25': 'kimi-k26',
  qwen: 'qwen-3-5',
  glm: 'glm-5-1',
  'glm-5': 'glm-5-1',
  minimax: 'minimax-m27',
  'minimax-m25': 'minimax-m27',
  llama: 'llama-3-3-70b',
  gptoss: 'gptoss-120b',
};

/** Default model the bare-slug (no model prefix) URL form maps to. PR #351 had
 *  no model dimension and pinned to DeepSeek R1, so legacy inbound links from
 *  that era resolve here. */
export const LEGACY_BARE_DEFAULT_MODEL_SLUG = 'deepseek-r1';

const SLUG_TO_MODEL: Record<string, CompareModelSlug> = Object.fromEntries(
  COMPARE_MODEL_SLUGS.map((m) => [m.slug, m]),
);
const CANONICAL_MODEL_SLUGS = new Set(COMPARE_MODEL_SLUGS.map((m) => m.slug));

/** Lookup helper. Returns null for unknown slugs (not even an alias). */
export function getCompareModelBySlug(slug: string): CompareModelSlug | null {
  const canonical = COMPARE_MODEL_ALIASES[slug] ?? slug;
  return SLUG_TO_MODEL[canonical] ?? null;
}

// ---------------------------------------------------------------------------
// Slug parsing and canonicalization
// ---------------------------------------------------------------------------

export interface ComparePair {
  a: string;
  b: string;
}

export interface CompareSlug {
  model: CompareModelSlug;
  a: string;
  b: string;
  /** True if the URL had no model prefix at all (legacy PR #351 form).
   *  Caller should redirect to the canonical model-prefixed URL. */
  isLegacyBareSlug: boolean;
  /** True if the URL used a model alias (e.g. `kimi` instead of `kimi-k26`,
   *  or `glm-5` instead of `glm-5-1`). Caller should redirect to canonical. */
  isAliasModel: boolean;
}

/** Parse a compare slug. Accepts both the legacy bare form (`h100-vs-h200`)
 *  and the new model-prefixed form (`deepseek-r1-h100-vs-h200`). Returns null
 *  on invalid input.
 *
 *  Algorithm: split on `-vs-`, validate the right side as a GPU key, then walk
 *  the left side backwards to find the longest suffix that's a GPU key. That
 *  suffix is the `a` GPU; the remainder is the model slug (or empty for the
 *  bare form). GPU keys contain no hyphens, so a single `lastIndexOf('-')`
 *  finds the split point. */
export function parseCompareSlug(slug: string): CompareSlug | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const sepIdx = lower.indexOf(SEPARATOR);
  if (sepIdx <= 0) return null;

  const b = lower.slice(sepIdx + SEPARATOR.length);
  if (!b || !GPU_KEYS.has(b)) return null;

  const prefix = lower.slice(0, sepIdx);
  if (!prefix) return null;

  // Split prefix into model + a GPU.
  // GPU keys have no hyphens (h100, gb200, mi355x), so the last hyphen in
  // `prefix` separates the model slug from the a GPU. If there's no hyphen,
  // the entire prefix is the a GPU (legacy bare form).
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

  // Resolve model slug.
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

/** Canonical model-prefixed slug. GPUs sorted alphabetically so a stable URL
 *  always exists for each (model, pair) combination. */
export function canonicalCompareSlug(modelSlug: string, a: string, b: string): string {
  const [first, second] = [a, b].toSorted();
  return `${modelSlug}-${first}${SEPARATOR}${second}`;
}

/** All distinct GPU pairs in alphabetical order. Model-agnostic — callers that
 *  need (model × pair) combinations should compose this with
 *  COMPARE_MODEL_SLUGS, or use `allCanonicalCompareSlugs()` for the flattened
 *  cross-product. */
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

/** Flattened cross-product of canonical model slugs and canonical GPU pairs.
 *  Used by sitemap.ts and generateStaticParams. Only emits canonical slugs
 *  (not aliases) — alias URLs would just 308 to these. */
export function allCanonicalCompareSlugs(): { modelSlug: string; a: string; b: string }[] {
  const pairs = allCanonicalComparePairs();
  return COMPARE_MODEL_SLUGS.flatMap((m) => pairs.map((p) => ({ modelSlug: m.slug, ...p })));
}

/** "H100 vs H200" or "GB200 NVL72 vs MI355X" — GPU-only display label. */
export function compareDisplayLabel(a: string, b: string): string {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  return `${aLabel} vs ${bLabel}`;
}

/** "DeepSeek R1 — H100 vs H200" — model-aware display label for headings,
 *  metadata titles, and OG image text. */
export function compareModelDisplayLabel(model: CompareModelSlug, a: string, b: string): string {
  return `${model.label} — ${compareDisplayLabel(a, b)}`;
}
